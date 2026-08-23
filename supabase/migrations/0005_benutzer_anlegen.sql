-- Administratoren koennen neue Fahrer:innen anlegen.
--
-- Das Anlegen laeuft bewusst ueber eine Funktion statt ueber ein direktes
-- INSERT: so liegt die Rechtepruefung in der Datenbank und nicht nur in der
-- Oberflaeche, und Fehler wie doppelte Namen kommen als verstaendlicher Text
-- zurueck.

create or replace function public.admin_create_user(
  p_full_name text,
  p_is_admin  boolean default false
)
returns table (
  id          uuid,
  full_name   text,
  role        public.app_role,
  login_email text
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
    raise exception 'Bitte einen Namen angeben.'
      using errcode = '22023';
  end if;

  if length(v_name) < 3 then
    raise exception 'Der Name ist zu kurz.'
      using errcode = '22023';
  end if;

  if exists (
    select 1 from public.app_users u
     where lower(trim(u.full_name)) = lower(v_name)
  ) then
    raise exception 'Es gibt bereits einen Eintrag mit dem Namen "%".', v_name
      using errcode = '23505';
  end if;

  insert into public.app_users (full_name, role)
  values (v_name, case when coalesce(p_is_admin, false) then 'admin' else 'fahrer' end::public.app_role)
  returning * into v;

  return query select v.id, v.full_name, v.role, v.login_email;
end;
$$;

revoke all on function public.admin_create_user(text, boolean) from public;
grant execute on function public.admin_create_user(text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Schutz gegen Selbstbefoerderung
--
-- Die Policy "app_users_link_own_account" erlaubt jedem Benutzer, seinen
-- eigenen Datensatz zu aendern - noetig, damit die App nach der
-- Passwortvergabe das Auth-Konto verknuepfen kann. Policies koennen aber
-- keine einzelnen Spalten einschraenken, dadurch konnte sich jede Person
-- selbst zur Administratorin machen. Dieser Trigger schliesst die Luecke.
-- ---------------------------------------------------------------------------
create or replace function public.app_users_guard_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if new.role is distinct from old.role
     or new.is_active is distinct from old.is_active
     or lower(trim(new.full_name)) is distinct from lower(trim(old.full_name))
     or new.login_email is distinct from old.login_email
  then
    raise exception 'Nur Administratoren dürfen Rolle, Name oder Freischaltung ändern.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists app_users_guard_privileges_trg on public.app_users;

-- Laeuft vor app_users_normalize_trg (alphabetische Reihenfolge)
create trigger app_users_guard_privileges_trg
  before update on public.app_users
  for each row execute function public.app_users_guard_privileges();
