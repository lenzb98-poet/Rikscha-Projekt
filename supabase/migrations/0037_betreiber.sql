-- Betreiber: verwaltet die Organisationen, die die App nutzen.
--
-- Der Betreiber steht über den Organisationen. In den Admin Einstellungen
-- erreicht er die Betreiber Einstellungen: Organisationen anlegen (mit ihrer
-- ersten Administration), bearbeiten, stilllegen, löschen und sehen, wie viel
-- Speicher jede belegt.
--
-- Wer Betreiber ist, steht in einer eigenen Tabelle ohne jede Schreibregel -
-- aus der App lässt sich dort niemand eintragen, nur per Migration.
--
-- Zugleich der erste Teil der Datentrennung: Personen, Fahrten, Chat, Heime,
-- Rikschas und übernommene Zahlen bekommen eine org_id. Alles Bestehende
-- gehört der Stammorganisation, der Hospiz-Initiative Melle e.V.
--
-- SPERRE bis zur vollständigen Trennung: Die übrigen Funktionen filtern noch
-- nicht nach Organisation. Damit niemand aus einer neuen Organisation die
-- Daten der Stammorganisation sieht, gilt nur als freigeschaltet, wer zur
-- Stammorganisation gehört (current_app_user_id, is_admin, darf_verwalten).
-- Die Anmeldung für andere Organisationen meldet „wird eingerichtet“.
--
-- Wiederholbar.

-- ---------------------------------------------------------------------------
-- 1) Stammorganisation
-- ---------------------------------------------------------------------------
alter table public.organisationen
  add column if not exists stamm boolean not null default false;

create unique index if not exists organisationen_stamm_idx
  on public.organisationen (stamm) where stamm;

update public.organisationen set stamm = true
 where kuerzel = 'melle'
   and not exists (select 1 from public.organisationen where stamm);

create or replace function public.stamm_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.organisationen where stamm;
$$;

-- ---------------------------------------------------------------------------
-- 2) org_id an den Datentabellen - Bestehendes gehört der Stammorganisation
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['app_users', 'rides', 'messages', 'heime', 'rikschas', 'statistik_uebernahme']
  loop
    execute format(
      'alter table public.%I add column if not exists org_id uuid
         default public.stamm_org_id() references public.organisationen (id)', t);
    execute format('update public.%I set org_id = public.stamm_org_id() where org_id is null', t);
    execute format('alter table public.%I alter column org_id set not null', t);
    execute format('create index if not exists %I on public.%I (org_id)', t || '_org_idx', t);
  end loop;
end $$;

-- Ein Name nur einmal je Organisation - in zwei Vereinen darf es je eine
-- „Maria Müller“ geben
drop index if exists public.app_users_full_name_key;
create unique index if not exists app_users_org_name_key
  on public.app_users (org_id, lower(trim(full_name)));

-- ---------------------------------------------------------------------------
-- 3) Wer ist wer
-- ---------------------------------------------------------------------------
create or replace function public.eigene_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from public.app_users
   where auth_user_id = auth.uid() and is_active
   limit 1;
$$;

-- SPERRE: bis zur Trennung der Daten nur die Stammorganisation
create or replace function public.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
    from public.app_users
   where auth_user_id = auth.uid()
     and is_active
     and org_id = public.stamm_org_id()
   limit 1;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_users
     where auth_user_id = auth.uid()
       and role = 'admin'
       and is_active
       and org_id = public.stamm_org_id()
  );
$$;

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
       and org_id = public.stamm_org_id()
  );
$$;

-- Die Organisation eines Eintrags ändert niemand aus der App heraus
create or replace function public.app_users_guard_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.org_id is distinct from old.org_id then
    raise exception 'Die Organisation eines Eintrags lässt sich nicht ändern.'
      using errcode = '42501';
  end if;
  if new.role is distinct from old.role
     and 'admin' in (new.role, old.role)
     and not public.is_admin()
  then
    raise exception 'Die Administrationsrolle vergibt und entzieht nur die Administration.'
      using errcode = '42501';
  end if;
  if public.darf_verwalten() then
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

-- ---------------------------------------------------------------------------
-- 4) Anmeldung je Organisation
-- ---------------------------------------------------------------------------
drop function if exists public.check_login_name(text);

-- Ohne p_org_id gilt die Stammorganisation - so funktionieren ältere,
-- zwischengespeicherte Fassungen der App weiter.
create or replace function public.check_login_name(p_full_name text, p_org_id uuid default null)
returns table (found boolean, is_active boolean, has_account boolean, full_name text, login_email text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org public.organisationen%rowtype;
  v     public.app_users%rowtype;
begin
  select * into v_org from public.organisationen o
   where o.id = coalesce(p_org_id, public.stamm_org_id());
  if not found then
    raise exception 'Diese Organisation gibt es nicht mehr. Bitte wähle sie neu aus.'
      using errcode = 'P0002';
  end if;
  if not v_org.aktiv then
    raise exception 'Diese Organisation ist stillgelegt. Eine Anmeldung ist nicht möglich.'
      using errcode = '42501';
  end if;
  -- SPERRE bis zur Trennung der Daten
  if not v_org.stamm then
    raise exception 'Die Anmeldung für diese Organisation wird gerade eingerichtet und ist bald möglich.'
      using errcode = '42501';
  end if;

  select * into v
    from public.app_users u
   where u.org_id = v_org.id
     and lower(trim(u.full_name)) = lower(trim(p_full_name));

  if not found then
    return query select false, false, false, null::text, null::text;
  else
    return query select true, v.is_active, (v.auth_user_id is not null), v.full_name, v.login_email;
  end if;
end;
$$;

grant execute on function public.check_login_name(text, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) Personen verwalten: nur innerhalb der eigenen Organisation
-- ---------------------------------------------------------------------------
create or replace function public.list_piloten()
returns table (id uuid, full_name text, role public.app_role, is_active boolean,
               phone text, contact_email text, hat_passwort boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_verwaltet boolean := public.darf_verwalten();
  v_org       uuid := public.eigene_org_id();
begin
  if public.current_app_user_id() is null then
    raise exception 'Dein Zugang ist nicht freigeschaltet.' using errcode = '42501';
  end if;

  return query
    select u.id, u.full_name, u.role, u.is_active, u.phone, u.contact_email,
           case when v_verwaltet then u.auth_user_id is not null else null end
      from public.app_users u
     where u.org_id = v_org
       and (v_verwaltet or u.is_active)
     order by u.full_name;
end;
$$;

create or replace function public.list_pilots()
returns table (id uuid, full_name text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.darf_verwalten() then
    raise exception 'Nur die Koordination oder Administration darf die Liste abrufen.' using errcode = '42501';
  end if;
  return query
    select a.id, a.full_name from public.app_users a
     where a.is_active and a.org_id = public.eigene_org_id()
     order by a.full_name;
end;
$$;

create or replace function public.admin_create_user(
  p_full_name text, p_role public.app_role default 'fahrer',
  p_phone text default null, p_contact_email text default null)
returns table (id uuid, full_name text, role public.app_role, is_active boolean,
               phone text, contact_email text, login_email text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := trim(coalesce(p_full_name, ''));
  v_rol  public.app_role := coalesce(p_role, 'fahrer');
  v_org  uuid := public.eigene_org_id();
  v      public.app_users%rowtype;
begin
  if not public.darf_verwalten() then
    raise exception 'Nur die Koordination oder Administration darf neue Personen anlegen.'
      using errcode = '42501';
  end if;
  if v_rol = 'admin' and not public.is_admin() then
    raise exception 'Die Administrationsrolle vergibt nur die Administration.'
      using errcode = '42501';
  end if;
  if v_name = '' then
    raise exception 'Bitte einen Namen angeben.' using errcode = '22023';
  end if;
  if length(v_name) < 3 then
    raise exception 'Der Name ist zu kurz.' using errcode = '22023';
  end if;
  if exists (select 1 from public.app_users u
              where u.org_id = v_org and lower(trim(u.full_name)) = lower(v_name)) then
    raise exception 'Es gibt bereits einen Eintrag mit dem Namen "%".', v_name using errcode = '23505';
  end if;
  insert into public.app_users (full_name, role, phone, contact_email, org_id)
  values (v_name, v_rol,
          nullif(trim(coalesce(p_phone, '')), ''),
          nullif(trim(coalesce(p_contact_email, '')), ''),
          v_org)
  returning * into v;
  return query select v.id, v.full_name, v.role, v.is_active, v.phone, v.contact_email, v.login_email;
end;
$$;

create or replace function public.admin_update_user(
  p_id uuid, p_full_name text, p_role public.app_role, p_is_active boolean,
  p_phone text default null, p_contact_email text default null)
returns table (id uuid, full_name text, role public.app_role, is_active boolean,
               phone text, contact_email text, login_email text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name  text := trim(coalesce(p_full_name, ''));
  v_org   uuid := public.eigene_org_id();
  v_alt   public.app_users%rowtype;
  v_neu   public.app_users%rowtype;
  v_eigen boolean;
begin
  if not public.darf_verwalten() then
    raise exception 'Nur die Koordination oder Administration darf Einträge bearbeiten.'
      using errcode = '42501';
  end if;
  -- Einträge anderer Organisationen gibt es von hier aus nicht
  select * into v_alt from public.app_users u where u.id = p_id and u.org_id = v_org;
  if not found then
    raise exception 'Dieser Eintrag existiert nicht mehr.' using errcode = 'P0002';
  end if;
  -- Beide Richtungen: sonst koennte die Koordination erst die Rolle nehmen
  -- und den Zugang danach loeschen
  if p_role is distinct from v_alt.role
     and 'admin' in (p_role, v_alt.role)
     and not public.is_admin()
  then
    raise exception 'Die Administrationsrolle vergibt und entzieht nur die Administration.'
      using errcode = '42501';
  end if;
  if v_name = '' then
    raise exception 'Bitte einen Namen angeben.' using errcode = '22023';
  end if;
  if length(v_name) < 3 then
    raise exception 'Der Name ist zu kurz.' using errcode = '22023';
  end if;
  if exists (select 1 from public.app_users u
              where u.org_id = v_org and lower(trim(u.full_name)) = lower(v_name) and u.id <> p_id) then
    raise exception 'Es gibt bereits einen anderen Eintrag mit dem Namen "%".', v_name
      using errcode = '23505';
  end if;
  v_eigen := v_alt.auth_user_id is not null and v_alt.auth_user_id = auth.uid();
  if v_eigen and not p_is_active then
    raise exception 'Du kannst deinen eigenen Zugang nicht deaktivieren.' using errcode = '42501';
  end if;
  if v_eigen and v_alt.role in ('admin', 'koordinator') and p_role = 'fahrer' then
    raise exception 'Du kannst dir deine eigenen Rechte nicht selbst entziehen.' using errcode = '42501';
  end if;
  if (v_alt.role = 'admin' and v_alt.is_active)
     and (p_role <> 'admin' or not p_is_active)
     and not exists (select 1 from public.app_users u
                      where u.org_id = v_org and u.role = 'admin' and u.is_active and u.id <> p_id)
  then
    raise exception 'Das ist die letzte aktive Administration – sie kann nicht entfernt werden.'
      using errcode = '42501';
  end if;
  update public.app_users
     set full_name = v_name, role = p_role, is_active = p_is_active,
         phone = nullif(trim(coalesce(p_phone, '')), ''),
         contact_email = nullif(trim(coalesce(p_contact_email, '')), '')
   where public.app_users.id = p_id
  returning * into v_neu;
  return query select v_neu.id, v_neu.full_name, v_neu.role, v_neu.is_active,
                      v_neu.phone, v_neu.contact_email, v_neu.login_email;
end;
$$;

create or replace function public.admin_delete_user(p_id uuid)
returns table (full_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.eigene_org_id();
  v     public.app_users%rowtype;
begin
  if not public.darf_verwalten() then
    raise exception 'Nur die Koordination oder Administration darf Einträge löschen.'
      using errcode = '42501';
  end if;
  select * into v from public.app_users u where u.id = p_id and u.org_id = v_org;
  if not found then
    raise exception 'Dieser Eintrag existiert nicht mehr.' using errcode = 'P0002';
  end if;
  -- Die einzige Ausnahme zwischen Koordination und Administration
  if v.role = 'admin' and not public.is_admin() then
    raise exception 'Zugänge der Administration löscht nur die Administration.'
      using errcode = '42501';
  end if;
  if v.auth_user_id is not null and v.auth_user_id = auth.uid() then
    raise exception 'Du kannst deinen eigenen Zugang nicht löschen.' using errcode = '42501';
  end if;
  if v.role = 'admin' and v.is_active
     and not exists (select 1 from public.app_users u
                      where u.org_id = v_org and u.role = 'admin' and u.is_active and u.id <> p_id)
  then
    raise exception 'Das ist die letzte aktive Administration – sie kann nicht gelöscht werden.'
      using errcode = '42501';
  end if;
  delete from public.app_users where id = p_id;
  if v.auth_user_id is not null then
    begin
      delete from auth.users where id = v.auth_user_id;
    exception when insufficient_privilege then
      raise exception 'Das zugehörige Anmeldekonto konnte nicht entfernt werden. Bitte die Migration als Projekteigentümer im SQL-Editor ausführen.'
        using errcode = '42501';
    end;
  end if;
  return query select v.full_name;
end;
$$;

create or replace function public.admin_reset_password(p_id uuid)
returns table (full_name text)
language plpgsql
security definer
set search_path = public
as $$
declare v public.app_users%rowtype;
begin
  if not public.darf_verwalten() then
    raise exception 'Nur die Koordination oder Administration darf Passwörter zurücksetzen.'
      using errcode = '42501';
  end if;
  select * into v from public.app_users u where u.id = p_id and u.org_id = public.eigene_org_id();
  if not found then
    raise exception 'Dieser Eintrag existiert nicht mehr.' using errcode = 'P0002';
  end if;
  if v.auth_user_id is not null and v.auth_user_id = auth.uid() then
    raise exception 'Dein eigenes Passwort kannst du hier nicht zurücksetzen.' using errcode = '42501';
  end if;
  if v.auth_user_id is null then
    raise exception 'Für % ist noch kein Passwort vergeben.', v.full_name using errcode = '22023';
  end if;
  update public.app_users
     set auth_user_id = null, account_created_at = null, updated_at = now()
   where id = p_id;
  begin
    delete from auth.users where id = v.auth_user_id;
  exception when insufficient_privilege then
    raise exception 'Das Anmeldekonto konnte nicht entfernt werden. Bitte die Migration als Projekteigentümer im SQL-Editor ausführen.'
      using errcode = '42501';
  end;
  return query select v.full_name;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) Betreiber
-- ---------------------------------------------------------------------------
create table if not exists public.betreiber (
  app_user_id uuid primary key references public.app_users (id) on delete cascade,
  seit        timestamptz not null default now()
);

-- Keine Regeln: aus der App lässt sich niemand eintragen oder austragen
alter table public.betreiber enable row level security;
revoke all on public.betreiber from anon, authenticated;

insert into public.betreiber (app_user_id)
select u.id from public.app_users u
 where lower(trim(u.full_name)) = 'lenz becker'
   and u.org_id = public.stamm_org_id()
on conflict do nothing;

create or replace function public.is_betreiber()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.betreiber b
      join public.app_users a on a.id = b.app_user_id
     where a.auth_user_id = auth.uid() and a.is_active
  );
$$;

-- Kürzel aus dem Namen: „Hospiz-Initiative Melle e.V.“ → hospiz-initiative-melle
create or replace function public.org_kuerzel_aus(p_text text)
returns text
language plpgsql
immutable
as $$
declare
  v text := lower(btrim(coalesce(p_text, '')));
begin
  v := replace(replace(replace(replace(v, 'ä', 'ae'), 'ö', 'oe'), 'ü', 'ue'), 'ß', 'ss');
  v := regexp_replace(v, '[^a-z0-9]+', '-', 'g');
  -- „e.V.“ am Ende gehört nicht ins Kürzel
  v := regexp_replace(btrim(v, '-'), '-e-v$', '');
  v := btrim(left(btrim(v, '-'), 30), '-');
  return case when char_length(v) < 2 then 'org' else v end;
end;
$$;

-- Übersicht mit grobem Speicherverbrauch. Die Datenbankgröße ist geschätzt:
-- die Summe der gespeicherten Zeilen, ohne Verwaltungsaufwand der Datenbank.
create or replace function public.betreiber_organisationen()
returns table (
  id uuid, name text, kuerzel text, aktiv boolean, stamm boolean, created_at timestamptz,
  administration text, personen integer, fahrten integer, nachrichten integer,
  bilder_bytes bigint, daten_bytes bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_betreiber() then
    raise exception 'Nur der Betreiber darf die Organisationen sehen.' using errcode = '42501';
  end if;

  return query
    select o.id, o.name, o.kuerzel, o.aktiv, o.stamm, o.created_at,
           (select string_agg(a.full_name, ', ' order by a.full_name)
              from public.app_users a
             where a.org_id = o.id and a.role = 'admin' and a.is_active),
           (select count(*)::integer from public.app_users a where a.org_id = o.id),
           (select count(*)::integer from public.rides r where r.org_id = o.id),
           (select count(*)::integer from public.messages m where m.org_id = o.id),
           (select coalesce(sum(m.image_size), 0)::bigint
              from public.messages m where m.org_id = o.id and m.image_path is not null),
           (  coalesce((select sum(pg_column_size(a.*)) from public.app_users a where a.org_id = o.id), 0)
            + coalesce((select sum(pg_column_size(r.*)) from public.rides r where r.org_id = o.id), 0)
            + coalesce((select sum(pg_column_size(s.*)) from public.ride_slots s
                          join public.rides r on r.id = s.ride_id where r.org_id = o.id), 0)
            + coalesce((select sum(pg_column_size(n.*)) from public.ride_notes n
                          join public.rides r on r.id = n.ride_id where r.org_id = o.id), 0)
            + coalesce((select sum(pg_column_size(m.*)) from public.messages m where m.org_id = o.id), 0)
            + coalesce((select sum(pg_column_size(x.*)) from public.message_reactions x
                          join public.messages m on m.id = x.message_id where m.org_id = o.id), 0)
            + coalesce((select sum(pg_column_size(h.*)) from public.heime h where h.org_id = o.id), 0)
            + coalesce((select sum(pg_column_size(k.*)) from public.rikschas k where k.org_id = o.id), 0)
            + coalesce((select sum(pg_column_size(u.*)) from public.statistik_uebernahme u where u.org_id = o.id), 0)
           )::bigint
      from public.organisationen o
     order by o.stamm desc, o.position, lower(o.name);
end;
$$;

-- Neue Organisation samt erster Administration. Die Person meldet sich wie
-- gewohnt nur mit dem Namen an und vergibt beim ersten Mal ihr Passwort.
create or replace function public.org_anlegen(p_name text, p_admin_name text)
returns table (id uuid, name text, kuerzel text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name   text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_admin  text := regexp_replace(btrim(coalesce(p_admin_name, '')), '\s+', ' ', 'g');
  v_basis  text;
  v_kurz   text;
  v_nr     integer := 1;
  v_org    public.organisationen%rowtype;
begin
  if not public.is_betreiber() then
    raise exception 'Nur der Betreiber darf Organisationen anlegen.' using errcode = '42501';
  end if;
  if v_name = '' then
    raise exception 'Bitte den Namen der Organisation angeben.' using errcode = '22023';
  end if;
  if char_length(v_name) > 80 then
    raise exception 'Der Name darf höchstens 80 Zeichen lang sein.' using errcode = '22023';
  end if;
  if exists (select 1 from public.organisationen o where lower(o.name) = lower(v_name)) then
    raise exception 'Eine Organisation mit diesem Namen gibt es schon.' using errcode = '23505';
  end if;
  if char_length(v_admin) < 3 then
    raise exception 'Bitte den vollen Namen der ersten Administration angeben.' using errcode = '22023';
  end if;

  -- Freies Kürzel suchen: melle, melle-2, melle-3 …
  v_basis := public.org_kuerzel_aus(v_name);
  v_kurz  := v_basis;
  while exists (select 1 from public.organisationen o where o.kuerzel = v_kurz) loop
    v_nr   := v_nr + 1;
    v_kurz := left(v_basis, 30 - char_length(v_nr::text) - 1) || '-' || v_nr;
  end loop;

  insert into public.organisationen (name, kuerzel, position)
  values (v_name, v_kurz, coalesce((select max(o.position) from public.organisationen o), 0) + 1)
  returning * into v_org;

  -- Die technische Anmeldekennung trägt das Kürzel, damit gleiche Namen in
  -- verschiedenen Organisationen nicht zusammenstoßen
  insert into public.app_users (full_name, role, org_id, login_email)
  values (v_admin, 'admin', v_org.id,
          replace(public.build_login_email(v_admin), '@rikscha-melle.de', '@' || v_kurz || '.rikscha-fahrten.de'));

  return query select v_org.id, v_org.name, v_org.kuerzel;
end;
$$;

create or replace function public.org_speichern(p_id uuid, p_name text, p_kuerzel text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_kurz text := lower(btrim(coalesce(p_kuerzel, '')));
begin
  if not public.is_betreiber() then
    raise exception 'Nur der Betreiber darf Organisationen bearbeiten.' using errcode = '42501';
  end if;
  if v_name = '' or char_length(v_name) > 80 then
    raise exception 'Der Name muss zwischen 1 und 80 Zeichen lang sein.' using errcode = '22023';
  end if;
  if v_kurz !~ '^[a-z0-9-]{2,30}$' then
    raise exception 'Das Kürzel darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten (2 bis 30 Zeichen).'
      using errcode = '22023';
  end if;
  if exists (select 1 from public.organisationen o where lower(o.name) = lower(v_name) and o.id <> p_id) then
    raise exception 'Eine Organisation mit diesem Namen gibt es schon.' using errcode = '23505';
  end if;
  if exists (select 1 from public.organisationen o where o.kuerzel = v_kurz and o.id <> p_id) then
    raise exception 'Dieses Kürzel ist schon vergeben.' using errcode = '23505';
  end if;

  update public.organisationen set name = v_name, kuerzel = v_kurz where id = p_id;
  if not found then
    raise exception 'Diese Organisation gibt es nicht mehr.' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.org_aktiv_setzen(p_id uuid, p_aktiv boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_betreiber() then
    raise exception 'Nur der Betreiber darf Organisationen stilllegen.' using errcode = '42501';
  end if;
  -- Sonst sperrte sich der Betreiber selbst aus
  if p_id = public.eigene_org_id() and not coalesce(p_aktiv, true) then
    raise exception 'Deine eigene Organisation kannst du nicht stilllegen.' using errcode = '42501';
  end if;

  update public.organisationen set aktiv = coalesce(p_aktiv, true) where id = p_id;
  if not found then
    raise exception 'Diese Organisation gibt es nicht mehr.' using errcode = 'P0002';
  end if;
end;
$$;

-- Löscht die Organisation mit allem, was ihr gehört, auch die Anmeldekonten.
-- Verlangt den Namen als Bestätigung - auch hier in der Datenbank.
create or replace function public.org_loeschen(p_id uuid, p_bestaetigung text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org     public.organisationen%rowtype;
  v_konten  uuid[];
  v_anzahl  integer;
begin
  if not public.is_betreiber() then
    raise exception 'Nur der Betreiber darf Organisationen löschen.' using errcode = '42501';
  end if;

  select * into v_org from public.organisationen where id = p_id for update;
  if not found then
    raise exception 'Diese Organisation gibt es nicht mehr.' using errcode = 'P0002';
  end if;
  if v_org.stamm or p_id = public.eigene_org_id() then
    raise exception 'Deine eigene Organisation kannst du nicht löschen.' using errcode = '42501';
  end if;
  if btrim(coalesce(p_bestaetigung, '')) is distinct from v_org.name then
    raise exception 'Der eingegebene Name stimmt nicht. Die Organisation wurde nicht gelöscht.'
      using errcode = '22023';
  end if;

  select array_agg(a.auth_user_id) filter (where a.auth_user_id is not null), count(*)
    into v_konten, v_anzahl
    from public.app_users a where a.org_id = p_id;

  -- Kinder zuerst; Plätze, Notizen und Reaktionen gehen über ihre Fahrten
  -- und Nachrichten mit
  delete from public.messages where org_id = p_id;
  delete from public.rides where org_id = p_id;
  delete from public.heime where org_id = p_id;
  delete from public.rikschas where org_id = p_id;
  delete from public.statistik_uebernahme where org_id = p_id;
  delete from public.app_users where org_id = p_id;
  if v_konten is not null then
    delete from auth.users where id = any (v_konten);
  end if;
  delete from public.organisationen where id = p_id;

  return coalesce(v_anzahl, 0);
end;
$$;

-- Supabase gibt neuen Funktionen von selbst auch anon das Ausführrecht
revoke execute on function public.stamm_org_id() from public, anon;
revoke execute on function public.eigene_org_id() from public, anon;
revoke execute on function public.is_betreiber() from public, anon;
revoke execute on function public.org_kuerzel_aus(text) from public, anon;
revoke execute on function public.betreiber_organisationen() from public, anon;
revoke execute on function public.org_anlegen(text, text) from public, anon;
revoke execute on function public.org_speichern(uuid, text, text) from public, anon;
revoke execute on function public.org_aktiv_setzen(uuid, boolean) from public, anon;
revoke execute on function public.org_loeschen(uuid, text) from public, anon;
grant execute on function public.stamm_org_id() to authenticated;
grant execute on function public.eigene_org_id() to authenticated;
grant execute on function public.is_betreiber() to authenticated;
grant execute on function public.betreiber_organisationen() to authenticated;
grant execute on function public.org_anlegen(text, text) to authenticated;
grant execute on function public.org_speichern(uuid, text, text) to authenticated;
grant execute on function public.org_aktiv_setzen(uuid, boolean) to authenticated;
grant execute on function public.org_loeschen(uuid, text) to authenticated;
