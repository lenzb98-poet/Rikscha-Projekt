-- Anmeldung per vollem Namen statt per E-Mail.
--
-- Supabase Auth braucht intern immer eine E-Mail-Adresse. Deshalb bleibt eine
-- E-Mail als technische Kennung bestehen (login_email), die Anmeldung selbst
-- erfolgt aber ueber den Namen. Bestehende Benutzer behalten ihre bisherige
-- Adresse als login_email, damit vorhandene Konten weiter funktionieren.
--
-- Die Migration ist wiederholbar: sie prueft jeden Schritt, laesst sich also
-- auch nach einem Abbruch gefahrlos erneut ausfuehren.

-- ---------------------------------------------------------------------------
-- 1) Alten Trigger entfernen
--    Wichtig zuerst: seine Funktion greift noch auf die Spalte "email" zu und
--    wuerde bei jeder Datenaenderung weiter unten fehlschlagen.
-- ---------------------------------------------------------------------------
drop trigger if exists app_users_normalize_trg on public.app_users;

-- ---------------------------------------------------------------------------
-- 2) Spalten anpassen
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'app_users' and column_name = 'email'
  ) and not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'app_users' and column_name = 'contact_email'
  ) then
    alter table public.app_users rename column email to contact_email;
  end if;
end;
$$;

alter table public.app_users alter column contact_email drop not null;
alter table public.app_users add column if not exists login_email text;

-- ---------------------------------------------------------------------------
-- 3) Aus einem Namen eine technische Login-Adresse ableiten
--    "Lenz Becker" -> "lenz.becker@rikscha-melle.de"
-- ---------------------------------------------------------------------------
create or replace function public.build_login_email(p_full_name text)
returns text
language plpgsql
immutable
as $$
declare
  v_slug text;
begin
  if p_full_name is null or trim(p_full_name) = '' then
    return null;
  end if;

  v_slug := lower(trim(p_full_name));
  v_slug := replace(v_slug, 'ä', 'ae');
  v_slug := replace(v_slug, 'ö', 'oe');
  v_slug := replace(v_slug, 'ü', 'ue');
  v_slug := replace(v_slug, 'ß', 'ss');
  v_slug := regexp_replace(v_slug, '[^a-z0-9]+', '.', 'g');
  v_slug := trim(both '.' from v_slug);

  if v_slug = '' then
    return null;
  end if;

  return v_slug || '@rikscha-melle.de';
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) Bestandsdaten aufbereiten (noch ohne Trigger)
-- ---------------------------------------------------------------------------

-- Fehlende Namen aus der Adresse ableiten, damit der Name Pflicht werden kann
update public.app_users
   set full_name = split_part(contact_email, '@', 1)
 where (full_name is null or trim(full_name) = '')
   and contact_email is not null;

-- Bestehende Benutzer: bisherige Adresse als Login-Kennung weiterverwenden,
-- damit bereits gesetzte Passwoerter gueltig bleiben
update public.app_users
   set login_email = lower(trim(contact_email))
 where login_email is null
   and contact_email is not null;

-- Alle uebrigen: Kennung aus dem Namen ableiten
update public.app_users
   set login_email = public.build_login_email(full_name)
 where login_email is null;

-- ---------------------------------------------------------------------------
-- 5) Regeln schaerfen
-- ---------------------------------------------------------------------------
alter table public.app_users alter column full_name set not null;
alter table public.app_users alter column login_email set not null;

-- Namen sind der Login und muessen daher eindeutig sein
create unique index if not exists app_users_full_name_key
  on public.app_users (lower(trim(full_name)));

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'app_users_login_email_key'
  ) then
    alter table public.app_users
      add constraint app_users_login_email_key unique (login_email);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) Neuer Trigger: Namen normalisieren, Login-Kennung ergaenzen
-- ---------------------------------------------------------------------------
create or replace function public.app_users_normalize()
returns trigger
language plpgsql
as $$
begin
  new.full_name := trim(new.full_name);
  new.contact_email := lower(nullif(trim(new.contact_email), ''));

  if new.login_email is null or trim(new.login_email) = '' then
    new.login_email := public.build_login_email(new.full_name);
  else
    new.login_email := lower(trim(new.login_email));
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger app_users_normalize_trg
  before insert or update on public.app_users
  for each row execute function public.app_users_normalize();

-- ---------------------------------------------------------------------------
-- 7) Policies auf die neue Login-Kennung umstellen
-- ---------------------------------------------------------------------------
drop policy if exists "app_users_select_own" on public.app_users;
drop policy if exists "app_users_link_own_account" on public.app_users;
drop policy if exists "app_users_admin_all" on public.app_users;

create policy "app_users_select_own"
  on public.app_users for select
  to authenticated
  using (
    auth_user_id = auth.uid()
    or login_email = lower(auth.jwt() ->> 'email')
  );

create policy "app_users_link_own_account"
  on public.app_users for update
  to authenticated
  using (login_email = lower(auth.jwt() ->> 'email'))
  with check (login_email = lower(auth.jwt() ->> 'email'));

-- Der Admin-Check darf die Tabelle nicht direkt in der Policy abfragen -
-- das loeste eine Endlosrekursion aus ("infinite recursion detected in
-- policy"). security definer umgeht RLS und bricht den Kreis.
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
  );
$$;

grant execute on function public.is_admin() to authenticated;

create policy "app_users_admin_all"
  on public.app_users for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 8) Login-Vorpruefung jetzt ueber den Namen.
--    Gibt die technische Login-Adresse zurueck, mit der sich die App
--    anschliessend bei Supabase Auth anmeldet.
-- ---------------------------------------------------------------------------
drop function if exists public.check_login_email(text);
drop function if exists public.check_login_name(text);

create function public.check_login_name(p_full_name text)
returns table (
  found       boolean,
  is_active   boolean,
  has_account boolean,
  full_name   text,
  login_email text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.app_users%rowtype;
begin
  select * into v
    from public.app_users u
   where lower(trim(u.full_name)) = lower(trim(p_full_name));

  if not found then
    return query select false, false, false, null::text, null::text;
  else
    return query select true, v.is_active, (v.auth_user_id is not null), v.full_name, v.login_email;
  end if;
end;
$$;

revoke all on function public.check_login_name(text) from public;
grant execute on function public.check_login_name(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9) Verknuepfung des Auth-Kontos ueber die Login-Kennung
-- ---------------------------------------------------------------------------
create or replace function public.link_auth_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.app_users
     set auth_user_id = auth.uid(),
         account_created_at = coalesce(account_created_at, now())
   where login_email = lower(auth.jwt() ->> 'email')
     and (auth_user_id is null or auth_user_id = auth.uid());
end;
$$;

grant execute on function public.link_auth_account() to authenticated;
