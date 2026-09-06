-- Pilot:innen-Liste für alle, Bearbeiten für Koordination und Administration.
--
-- Bisher zeigte die Policy auf app_users Nicht-Administratoren nur den
-- eigenen Datensatz; eine Liste war für Fahrer:innen damit nicht möglich.
-- list_piloten() liefert sie als security definer, ohne die Policy zu
-- lockern - direkte Abfragen auf app_users bleiben also weiter zu.
--
-- Fahrer:innen sehen nur freigeschaltete Personen. Wer deaktiviert ist und
-- wer noch kein Passwort vergeben hat, ist Verwaltungswissen und bleibt der
-- Koordination und der Administration vorbehalten.
--
-- Wiederholbar.

-- ---------------------------------------------------------------------------
-- Wer darf die Liste bearbeiten?
-- ---------------------------------------------------------------------------
create or replace function public.darf_verwalten()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_users
     where auth_user_id = auth.uid()
       and role in ('admin', 'koordinator')
       and is_active
  );
$$;

grant execute on function public.darf_verwalten() to authenticated;

-- ---------------------------------------------------------------------------
-- Die Liste lesen
-- ---------------------------------------------------------------------------
create or replace function public.list_piloten()
returns table (
  id            uuid,
  full_name     text,
  role          public.app_role,
  is_active     boolean,
  phone         text,
  contact_email text,
  hat_passwort  boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_verwaltet boolean := public.darf_verwalten();
begin
  if public.current_app_user_id() is null then
    raise exception 'Dein Zugang ist nicht freigeschaltet.' using errcode = '42501';
  end if;

  return query
    select u.id, u.full_name, u.role, u.is_active, u.phone, u.contact_email,
           -- Wer noch kein Passwort hat, geht nur die Verwaltung etwas an
           case when v_verwaltet then u.auth_user_id is not null else null end
      from public.app_users u
     where v_verwaltet or u.is_active
     order by u.full_name;
end;
$$;

grant execute on function public.list_piloten() to authenticated;

-- ---------------------------------------------------------------------------
-- Anlegen: jetzt auch für die Koordination
--
-- Die Administratorrolle bleibt der Administration vorbehalten. Sonst
-- könnte sich die Koordination über eine neu angelegte Person selbst
-- weiterreichende Rechte verschaffen.
-- ---------------------------------------------------------------------------
create or replace function public.admin_create_user(
  p_full_name     text,
  p_role          public.app_role default 'fahrer',
  p_phone         text default null,
  p_contact_email text default null
)
returns table (
  id            uuid,
  full_name     text,
  role          public.app_role,
  is_active     boolean,
  phone         text,
  contact_email text,
  login_email   text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := trim(coalesce(p_full_name, ''));
  v_rol  public.app_role := coalesce(p_role, 'fahrer');
  v      public.app_users%rowtype;
begin
  if not public.darf_verwalten() then
    raise exception 'Nur die Koordination oder Administration darf neue Personen anlegen.'
      using errcode = '42501';
  end if;

  if v_rol = 'admin' and not public.is_admin() then
    raise exception 'Nur Administratoren dürfen Administratorrechte vergeben.'
      using errcode = '42501';
  end if;

  if v_name = '' then
    raise exception 'Bitte einen Namen angeben.' using errcode = '22023';
  end if;

  if length(v_name) < 3 then
    raise exception 'Der Name ist zu kurz.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.app_users u where lower(trim(u.full_name)) = lower(v_name)
  ) then
    raise exception 'Es gibt bereits einen Eintrag mit dem Namen "%".', v_name
      using errcode = '23505';
  end if;

  insert into public.app_users (full_name, role, phone, contact_email)
  values (
    v_name, v_rol,
    nullif(trim(coalesce(p_phone, '')), ''),
    nullif(trim(coalesce(p_contact_email, '')), '')
  )
  returning * into v;

  return query select v.id, v.full_name, v.role, v.is_active,
                      v.phone, v.contact_email, v.login_email;
end;
$$;

revoke all on function public.admin_create_user(text, public.app_role, text, text) from public;
grant execute on function public.admin_create_user(text, public.app_role, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Bearbeiten: jetzt auch für die Koordination
--
-- Zwei Grenzen für die Koordination: Einträge der Administration bleiben
-- unberührt, und die Administratorrolle lässt sich nicht vergeben. Ohne
-- das könnte sie sich selbst befördern oder die Administration aussperren.
-- ---------------------------------------------------------------------------
create or replace function public.admin_update_user(
  p_id            uuid,
  p_full_name     text,
  p_role          public.app_role,
  p_is_active     boolean,
  p_phone         text default null,
  p_contact_email text default null
)
returns table (
  id            uuid,
  full_name     text,
  role          public.app_role,
  is_active     boolean,
  phone         text,
  contact_email text,
  login_email   text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name  text := trim(coalesce(p_full_name, ''));
  v_alt   public.app_users%rowtype;
  v_neu   public.app_users%rowtype;
  v_eigen boolean;
begin
  if not public.darf_verwalten() then
    raise exception 'Nur die Koordination oder Administration darf Einträge bearbeiten.'
      using errcode = '42501';
  end if;

  select * into v_alt from public.app_users u where u.id = p_id;
  if not found then
    raise exception 'Dieser Eintrag existiert nicht mehr.' using errcode = 'P0002';
  end if;

  if not public.is_admin() then
    if v_alt.role = 'admin' then
      raise exception 'Einträge der Administration kann nur die Administration bearbeiten.'
        using errcode = '42501';
    end if;
    if p_role = 'admin' then
      raise exception 'Nur Administratoren dürfen Administratorrechte vergeben.'
        using errcode = '42501';
    end if;
  end if;

  if v_name = '' then
    raise exception 'Bitte einen Namen angeben.' using errcode = '22023';
  end if;

  if length(v_name) < 3 then
    raise exception 'Der Name ist zu kurz.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.app_users u
     where lower(trim(u.full_name)) = lower(v_name) and u.id <> p_id
  ) then
    raise exception 'Es gibt bereits einen anderen Eintrag mit dem Namen "%".', v_name
      using errcode = '23505';
  end if;

  v_eigen := v_alt.auth_user_id is not null and v_alt.auth_user_id = auth.uid();

  if v_eigen and not p_is_active then
    raise exception 'Du kannst deinen eigenen Zugang nicht deaktivieren.'
      using errcode = '42501';
  end if;

  -- Gilt nur für die Administration: eine Koordination darf ihre eigene
  -- Rolle sehr wohl abgeben.
  if v_eigen and v_alt.role = 'admin' and p_role <> 'admin' then
    raise exception 'Du kannst dir deine Administratorrechte nicht selbst entziehen.'
      using errcode = '42501';
  end if;

  if (v_alt.role = 'admin' and v_alt.is_active)
     and (p_role <> 'admin' or not p_is_active)
     and not exists (
       select 1 from public.app_users u
        where u.role = 'admin' and u.is_active and u.id <> p_id
     )
  then
    raise exception 'Das ist die letzte aktive Administration – sie kann nicht entfernt werden.'
      using errcode = '42501';
  end if;

  update public.app_users
     set full_name     = v_name,
         role          = p_role,
         is_active     = p_is_active,
         phone         = nullif(trim(coalesce(p_phone, '')), ''),
         contact_email = nullif(trim(coalesce(p_contact_email, '')), '')
   where public.app_users.id = p_id
  returning * into v_neu;

  return query select v_neu.id, v_neu.full_name, v_neu.role, v_neu.is_active,
                      v_neu.phone, v_neu.contact_email, v_neu.login_email;
end;
$$;

revoke all on function public.admin_update_user(uuid, text, public.app_role, boolean, text, text) from public;
grant execute on function public.admin_update_user(uuid, text, public.app_role, boolean, text, text) to authenticated;

-- Löschen und Passwort zurücksetzen bleiben bewusst bei der Administration:
-- beides ist nicht rückholbar bzw. gibt einen Zugang zur Neuvergabe frei.

-- ---------------------------------------------------------------------------
-- Der Schutz an der Tabelle muss mitziehen
--
-- app_users_guard_privileges liess Rolle, Name und Freischaltung bisher nur
-- die Administration ändern. Ohne Anpassung liefe die Koordination beim
-- Speichern in genau diesen Trigger - Kontaktdaten gingen durch, ein
-- geänderter Name nicht.
--
-- Die Administratorrolle bleibt dabei aussen vor: Die Policy erlaubt jeder
-- Person Änderungen an der eigenen Zeile, ohne diese Schranke könnte sich
-- die Koordination am SQL-Weg vorbei selbst befördern.
-- ---------------------------------------------------------------------------
create or replace function public.app_users_guard_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Direkter Datenbankzugriff (SQL-Editor, Wartungsskripte): nicht zustaendig
  if auth.uid() is null then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  -- Koordination: alles ausser der Administratorrolle
  if public.darf_verwalten()
     and old.role <> 'admin'
     and new.role <> 'admin'
  then
    return new;
  end if;

  if new.role is distinct from old.role
     or new.is_active is distinct from old.is_active
     or lower(trim(new.full_name)) is distinct from lower(trim(old.full_name))
     or new.login_email is distinct from old.login_email
  then
    raise exception 'Nur die Koordination oder Administration darf Rolle, Name oder Freischaltung ändern.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;
