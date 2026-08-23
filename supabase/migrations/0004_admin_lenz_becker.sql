-- Lenz Becker als Administrator anlegen bzw. den bestehenden Eintrag umbenennen.
--
-- Der bisherige Seed (0002) hat den Benutzer unter dem Namen "Lenz" mit der
-- Adresse lenz.b98@icloud.com angelegt. Existiert dieser Eintrag, wird er
-- umbenannt und behaelt seine Login-Kennung - ein bereits gesetztes Passwort
-- bleibt damit gueltig.

do $$
begin
  if exists (select 1 from public.app_users where contact_email = 'lenz.b98@icloud.com') then
    update public.app_users
       set full_name = 'Lenz Becker',
           role      = 'admin',
           is_active = true
     where contact_email = 'lenz.b98@icloud.com';
  else
    insert into public.app_users (full_name, contact_email, role, is_active)
    values ('Lenz Becker', 'lenz.b98@icloud.com', 'admin', true)
    on conflict (login_email) do update
      set full_name = excluded.full_name,
          role      = 'admin',
          is_active = true;
  end if;
end;
$$;
