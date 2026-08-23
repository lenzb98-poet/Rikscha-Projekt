-- Hospizinitiative Melle – Rikscha App
-- Basistabelle für die Benutzerverwaltung (Whitelist + Rollen)

create type public.app_role as enum ('admin', 'koordinator', 'fahrer');

create table public.app_users (
  id                uuid primary key default gen_random_uuid(),
  email             text not null unique,
  full_name         text,
  phone             text,
  role              public.app_role not null default 'fahrer',
  is_active         boolean not null default true,
  auth_user_id      uuid unique references auth.users (id) on delete set null,
  account_created_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- E-Mails immer klein speichern, damit die Suche beim Login eindeutig ist
create or replace function public.app_users_normalize()
returns trigger
language plpgsql
as $$
begin
  new.email := lower(trim(new.email));
  new.updated_at := now();
  return new;
end;
$$;

create trigger app_users_normalize_trg
  before insert or update on public.app_users
  for each row execute function public.app_users_normalize();

alter table public.app_users enable row level security;

-- Angemeldete Benutzer sehen ihren eigenen Datensatz
create policy "app_users_select_own"
  on public.app_users for select
  to authenticated
  using (lower(auth.jwt() ->> 'email') = email);

-- Nach dem ersten Login darf der Benutzer seinen Datensatz mit dem Auth-Konto verknüpfen
create policy "app_users_link_own_account"
  on public.app_users for update
  to authenticated
  using (lower(auth.jwt() ->> 'email') = email)
  with check (lower(auth.jwt() ->> 'email') = email);

-- Admins dürfen alles
create policy "app_users_admin_all"
  on public.app_users for all
  to authenticated
  using (exists (
    select 1 from public.app_users a
    where a.auth_user_id = auth.uid() and a.role = 'admin'
  ))
  with check (exists (
    select 1 from public.app_users a
    where a.auth_user_id = auth.uid() and a.role = 'admin'
  ));

-- Login-Vorprüfung: darf anonym aufgerufen werden, gibt aber nur das Nötigste zurück.
-- security definer, damit RLS die Prüfung vor dem Login nicht blockiert.
create or replace function public.check_login_email(p_email text)
returns table (
  exists_in_whitelist boolean,
  is_active           boolean,
  has_account         boolean,
  full_name           text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.app_users%rowtype;
begin
  select * into v from public.app_users where email = lower(trim(p_email));

  if not found then
    return query select false, false, false, null::text;
  else
    return query select true, v.is_active, (v.auth_user_id is not null), v.full_name;
  end if;
end;
$$;

revoke all on function public.check_login_email(text) from public;
grant execute on function public.check_login_email(text) to anon, authenticated;

-- Verknüpft nach der Passwortvergabe das Auth-Konto mit dem Whitelist-Eintrag
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
   where email = lower(auth.jwt() ->> 'email')
     and (auth_user_id is null or auth_user_id = auth.uid());
end;
$$;

grant execute on function public.link_auth_account() to authenticated;

-- Beispiel: ersten Admin anlegen
-- insert into public.app_users (email, full_name, role) values ('admin@hospiz-melle.de', 'Admin', 'admin');
