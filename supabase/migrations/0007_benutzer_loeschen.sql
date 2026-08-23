-- Administratoren koennen Eintraege endgueltig loeschen.
--
-- Wichtig: Zum Eintrag gehoert ein Konto in auth.users. Bliebe das bestehen,
-- waere die technische Login-Kennung weiter belegt - eine spaeter erneut
-- angelegte Person mit demselben Namen koennte dann kein Passwort mehr
-- vergeben ("User already registered"). Deshalb wird das Auth-Konto
-- mitgeloescht.
--
-- Zum Deaktivieren statt Loeschen siehe admin_update_user: dabei bleibt der
-- Eintrag erhalten und nur die Anmeldung ist gesperrt.

create or replace function public.admin_delete_user(p_id uuid)
returns table (full_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.app_users%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Nur Administratoren dürfen Einträge löschen.'
      using errcode = '42501';
  end if;

  select * into v from public.app_users u where u.id = p_id;
  if not found then
    raise exception 'Dieser Eintrag existiert nicht mehr.'
      using errcode = 'P0002';
  end if;

  if v.auth_user_id is not null and v.auth_user_id = auth.uid() then
    raise exception 'Du kannst deinen eigenen Zugang nicht löschen.'
      using errcode = '42501';
  end if;

  if v.role = 'admin' and v.is_active
     and not exists (
       select 1 from public.app_users u
        where u.role = 'admin' and u.is_active and u.id <> p_id
     )
  then
    raise exception 'Das ist die letzte aktive Administration – sie kann nicht gelöscht werden.'
      using errcode = '42501';
  end if;

  delete from public.app_users where id = p_id;

  if v.auth_user_id is not null then
    begin
      delete from auth.users where id = v.auth_user_id;
    exception
      when insufficient_privilege then
        raise exception 'Das zugehörige Anmeldekonto konnte nicht entfernt werden. Bitte die Migration als Projekteigentümer im SQL-Editor ausführen.'
          using errcode = '42501';
    end;
  end if;

  return query select v.full_name;
end;
$$;

revoke all on function public.admin_delete_user(uuid) from public;
grant execute on function public.admin_delete_user(uuid) to authenticated;
