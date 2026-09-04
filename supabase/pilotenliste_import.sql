-- Piloten aus der bisherigen Adressen- und Telefonliste übernehmen.
--
-- Im SQL-Editor auszuführen. Dort ist niemand angemeldet (auth.uid() ist
-- leer), deshalb greift der Schutz aus 0005/0010 nicht und das direkte
-- INSERT ist der vorgesehene Wartungsweg. Über die App wäre stattdessen
-- admin_create_user() zuständig.
--
-- Wiederholbar: Wer schon in app_users steht, wird übersprungen; das
-- Skript legt niemanden doppelt an und ändert an Bestehenden nichts.
--
-- Die Login-Kennung (vorname.nachname@rikscha-melle.de) setzt der Trigger
-- app_users_normalize_trg selbst. Ein Passwort vergibt jede Person bei
-- ihrer ersten Anmeldung, es wird hier bewusst keines hinterlegt.

insert into public.app_users (full_name, role)
select v.full_name, 'fahrer'::public.app_role
  from (values
    ('Dieter Kampmanns'),
    ('Uschi Selchow'),
    ('Marlis Hinck'),
    ('Josefa Schmitz'),
    ('Wolfgang Peters'),
    ('Alexa Pelzer'),
    ('Manfred Burhoff'),
    ('Conny Vogelsberg'),
    ('Bernd Meyer'),
    ('Sabine Reinholt'),
    ('Manfred Heckmann'),
    ('Manfred Arens'),
    ('Gerhard Luelf'),
    ('Martin Schnier'),
    ('Monika Glaeser'),
    ('Rolf Baeckermann'),
    ('Rita Strobkriemann'),
    ('Reinhard Eickhoff')
  ) as v(full_name)
 where not exists (
   select 1 from public.app_users u
    where lower(trim(u.full_name)) = lower(trim(v.full_name))
 );

-- Ergebnis zur Kontrolle
select full_name, role, login_email
  from public.app_users
 order by full_name;
