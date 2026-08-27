-- Passwort einer Person zurücksetzen.
--
-- Das Passwort selbst liegt in auth.users und laesst sich von hier nicht
-- neu setzen. Stattdessen wird das Anmeldekonto entfernt und die Verknuepfung
-- geloest: Die Person meldet sich dann wie beim ersten Mal nur mit ihrem Namen
-- an und vergibt dabei selbst ein neues Passwort.
--
-- Der sonst uebliche Weg per E-Mail scheidet aus, weil die Login-Kennung in
-- der Regel abgeleitet ist (name@rikscha-melle.de) und dorthin keine Post
-- zugestellt werden kann.
--
-- Der Eintrag in app_users bleibt vollstaendig erhalten, ebenso alle
-- Anmeldungen zu Fahrten - sie haengen an app_users.id, nicht am Konto.

create or replace function public.admin_reset_password(p_id uuid)
returns table (full_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.app_users%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Nur Administratoren dürfen Passwörter zurücksetzen.'
      using errcode = '42501';
  end if;

  select * into v from public.app_users u where u.id = p_id;
  if not found then
    raise exception 'Dieser Eintrag existiert nicht mehr.' using errcode = 'P0002';
  end if;

  if v.auth_user_id is not null and v.auth_user_id = auth.uid() then
    raise exception 'Dein eigenes Passwort kannst du hier nicht zurücksetzen.'
      using errcode = '42501';
  end if;

  if v.auth_user_id is null then
    raise exception 'Für % ist noch kein Passwort vergeben.', v.full_name
      using errcode = '22023';
  end if;

  -- Verknuepfung loesen, damit die naechste Anmeldung wieder die
  -- Passwortvergabe zeigt
  update public.app_users
     set auth_user_id       = null,
         account_created_at = null,
         updated_at         = now()
   where id = p_id;

  -- Anmeldekonto entfernen; sonst bliebe die Kennung belegt und die
  -- Passwortvergabe scheiterte mit "User already registered"
  begin
    delete from auth.users where id = v.auth_user_id;
  exception
    when insufficient_privilege then
      raise exception 'Das Anmeldekonto konnte nicht entfernt werden. Bitte die Migration als Projekteigentümer im SQL-Editor ausführen.'
        using errcode = '42501';
  end;

  return query select v.full_name;
end;
$$;

grant execute on function public.admin_reset_password(uuid) to authenticated;
