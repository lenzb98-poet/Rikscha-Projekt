-- Passwort zurücksetzen jetzt auch für die Koordination.
--
-- Mit einer Grenze: Passwörter der Administration bleiben ausgenommen.
--
-- Grund ist der Anmeldeablauf. Zurücksetzen entfernt das Anmeldekonto; die
-- Person meldet sich danach nur mit ihrem Namen an und vergibt selbst ein
-- neues Passwort. Wer ein fremdes Passwort zurücksetzt, kann sich also
-- unmittelbar danach unter diesem Namen anmelden und den Zugang übernehmen.
-- Dürfte die Koordination das bei der Administration, wäre das ein Weg zu
-- vollen Rechten.
--
-- Wiederholbar.

create or replace function public.admin_reset_password(p_id uuid)
returns table (full_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.app_users%rowtype;
begin
  if not public.darf_verwalten() then
    raise exception 'Nur die Koordination oder Administration darf Passwörter zurücksetzen.'
      using errcode = '42501';
  end if;

  select * into v from public.app_users u where u.id = p_id;
  if not found then
    raise exception 'Dieser Eintrag existiert nicht mehr.' using errcode = 'P0002';
  end if;

  -- Siehe oben: sonst liesse sich darüber ein Administratorzugang übernehmen
  if v.role = 'admin' and not public.is_admin() then
    raise exception 'Passwörter der Administration setzt nur die Administration zurück.'
      using errcode = '42501';
  end if;

  if v.auth_user_id is not null and v.auth_user_id = auth.uid() then
    raise exception 'Dein eigenes Passwort kannst du hier nicht zurücksetzen.'
      using errcode = '42501';
  end if;

  if v.auth_user_id is null then
    raise exception 'Für % ist noch kein Passwort vergeben.', v.full_name
      using errcode = '22023';
  end if;

  update public.app_users
     set auth_user_id       = null,
         account_created_at = null,
         updated_at         = now()
   where id = p_id;

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
