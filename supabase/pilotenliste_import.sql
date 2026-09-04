-- Piloten aus der bisherigen Adressen- und Telefonliste übernehmen.
--
-- Im SQL-Editor auszuführen. Dort ist niemand angemeldet (auth.uid() ist
-- leer), deshalb greift der Schutz aus 0005/0010 nicht und das direkte
-- INSERT/UPDATE ist der vorgesehene Wartungsweg. Über die App wären
-- stattdessen admin_create_user() und admin_update_user() zuständig.
--
-- Wiederholbar: Wer schon in app_users steht, wird übersprungen, und
-- gefüllt werden nur leere Felder. Was in der App gepflegt wurde, bleibt
-- damit unangetastet.
--
-- Die Login-Kennung (vorname.nachname@rikscha-melle.de) setzt der Trigger
-- app_users_normalize_trg selbst; er schreibt auch die E-Mail klein. Ein
-- Passwort vergibt jede Person bei ihrer ersten Anmeldung, es wird hier
-- bewusst keines hinterlegt.

-- ---------------------------------------------------------------------------
-- 1) Personen anlegen
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 2) Telefon und E-Mail nachtragen
--
-- app_users hat kein eigenes Feld für das Festnetz. Wo eines vorliegt,
-- steht es hinter der Mobilnummer im selben Feld - für drei Einträge ist
-- das verhältnismäßiger als eine neue Spalte samt Oberfläche.
-- ---------------------------------------------------------------------------
with liste(full_name, tel, mail) as (values
  ('Carl Martin Becker',    '0178 4661598',   'cmbecker@gmx.de'),
  ('Dieter Kampmanns',      '0171 5129000',   'dkampmann@kampmann-melle.de'),
  ('Uschi Selchow',         '01714 754769',   'uschi.selchow@yahoo.de'),
  ('Marlis Hinck',          '01520 8686365',  'Klaus.Hinck@osnanet.de'),
  ('Josefa Schmitz',        '0151 55298194 · Festnetz 05422 922 77 92', 'Josefa.Friderike.Schmitz@gmail.com'),
  ('Lenz Becker',           '01525 5925889',  'lenz.b98@gmail.com'),
  ('Wolfgang Peters',       '0151 122 76 323','Wolle.Peters@Osnanet.de'),
  ('Alexa Pelzer',          '01575 946 5653', 'alexa.pelzer@posteo.de'),
  ('Manfred Burhoff',       '0177 8068032',   'manfred-burhoff@gmx.de'),
  ('Conny Vogelsberg',      '01878 5215 132', 'covog@web.de'),
  ('Bernd Meyer',           '0173 253 6095',  'meyer@mellegesmold.de'),
  ('Sabine Reinholt',       '0176 7650 3876', 'sabine.reinholt@hotmail.de'),
  ('Manfred Heckmann',      '0151 5483 4707', 'heckmann.manfred@web.de'),
  ('Frank Diekmann',        '01575 2198213',  'Frank.Diekmann@gmx.de'),
  ('Manfred Arens',         '0170 8330337',   'm.arens@osnanet.de'),
  ('Gerhard Luelf',         '01520 8985022 · Festnetz 05422 3743', 'g.luelf@web.de'),
  ('Doris Wittmeyer-Luelf', '01520 8991292 · Festnetz 05422 3743', 'doris.w.luelf@web.de'),
  ('Martin Schnier',        '0176 72385175',  'spilurum62@gmail.com'),
  ('Monika Glaeser',        '0176 9080159',   'info@neuzeityoga.com'),
  ('Rolf Baeckermann',      '01512 7179335',  'r.baeckermann@gmail.com'),
  ('Rita Strobkriemann',    '0176 43497616',  'strobkriemann@web.de'),
  ('Reinhard Eickhoff',     '01725259367',    'reinhard.eickhoff1@gmail.com')
)
update public.app_users u
   set phone         = coalesce(u.phone, l.tel),
       contact_email = coalesce(u.contact_email, l.mail)
  from liste l
 where lower(trim(u.full_name)) = lower(trim(l.full_name))
   and (u.phone is null or u.contact_email is null);

-- Ergebnis zur Kontrolle
select full_name, role, phone, contact_email, login_email
  from public.app_users
 order by full_name;
