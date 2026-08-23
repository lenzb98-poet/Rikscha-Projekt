-- Wartungsarbeiten im SQL-Editor wieder ermoeglichen.
--
-- Der Schutz aus 0005 verhindert, dass Nicht-Administratoren ihre Rolle, ihren
-- Namen oder ihre Freischaltung selbst aendern. Er griff bisher aber auch bei
-- direkten Anweisungen im SQL-Editor: dort ist niemand angemeldet, auth.uid()
-- ist leer, also galt der Aufrufer als Nicht-Administrator und selbst der
-- Projekteigentuemer bekam
--   "Nur Administratoren dürfen Rolle, Name oder Freischaltung ändern."
--
-- Der Trigger greift jetzt nur noch, wenn tatsaechlich jemand angemeldet ist.
-- Ueber die App kommt man nur angemeldet, der Schutz bleibt dort also
-- unveraendert. Ohne Anmeldung wiederum hat die Rolle anon weder Schreibrechte
-- auf die Tabelle noch eine passende Policy - der Weg ist also nicht offen,
-- sondern schlicht ein anderer.

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
