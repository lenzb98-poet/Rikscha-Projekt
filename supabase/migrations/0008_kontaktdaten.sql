-- Vollstaendige Stammdaten in der Fahrerverwaltung.
--
-- app_users hat seit Beginn die Spalten phone und contact_email, die bisher
-- nirgends gepflegt wurden. Die Anlege- und Bearbeitungsfunktionen bekommen
-- sie jetzt als Parameter. Beim Anlegen wird ausserdem die Rolle direkt
-- uebergeben statt nur "Admin ja/nein", damit auch die Koordination
-- vergeben werden kann.

drop function if exists public.admin_create_user(text, boolean);
drop function if exists public.admin_update_user(uuid, text, public.app_role, boolean);

create function public.admin_create_user(
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
  v      public.app_users%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Nur Administratoren dürfen neue Benutzer anlegen.'
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
    v_name,
    coalesce(p_role, 'fahrer'),
    nullif(trim(coalesce(p_phone, '')), ''),
    nullif(trim(coalesce(p_contact_email, '')), '')
  )
  returning * into v;

  return query select v.id, v.full_name, v.role, v.is_active, v.phone, v.contact_email, v.login_email;
end;
$$;

revoke all on function public.admin_create_user(text, public.app_role, text, text) from public;
grant execute on function public.admin_create_user(text, public.app_role, text, text) to authenticated;

create function public.admin_update_user(
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
  if not public.is_admin() then
    raise exception 'Nur Administratoren dürfen Einträge bearbeiten.'
      using errcode = '42501';
  end if;

  select * into v_alt from public.app_users u where u.id = p_id;
  if not found then
    raise exception 'Dieser Eintrag existiert nicht mehr.' using errcode = 'P0002';
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

  if v_eigen and p_role <> 'admin' then
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
