# Rikscha-App – Hospizinitiative Melle

Web-App zur Buchung und Verwaltung von Rikscha-Fahrten und -Fahrer:innen.
Aktueller Stand: **Benutzer-Login mit Supabase** (Schritt 1 des Projekts).

## Anmelde-Ablauf

Angemeldet wird sich mit dem **vollen Namen**, nicht mit einer E-Mail-Adresse.

1. Die Person gibt ihren **Vor- und Nachnamen** ein.
2. Die App sucht den Namen in der Supabase-Tabelle `app_users`
   (über die Funktion `check_login_name`).
   - Nicht gefunden → Hinweis, sich an die Koordination zu wenden.
   - Gefunden, aber deaktiviert → Hinweis auf den gesperrten Zugang.
3. **Erste Anmeldung** (noch kein Auth-Konto verknüpft):
   Die Person legt ihr **eigenes Passwort** fest. Danach wird das Auth-Konto
   über `link_auth_account()` mit dem Eintrag in `app_users` verknüpft.
4. **Weitere Anmeldungen**: normale Passwort-Anmeldung.

### Warum trotzdem eine E-Mail in der Tabelle steht

Supabase Auth benötigt intern immer eine E-Mail-Adresse als Kennung. Deshalb
gibt es zwei Spalten:

- `full_name` – der Anmeldename, eindeutig (Groß-/Kleinschreibung egal)
- `login_email` – technische Kennung, wird nie angezeigt. Für neue Benutzer
  automatisch aus dem Namen abgeleitet: `Lenz Becker` → `lenz.becker@rikscha-melle.de`
- `contact_email` – die echte Adresse, rein zur Kontaktaufnahme, optional

Weil Namen der Login sind, müssen sie eindeutig sein. Bei zwei gleichen Namen
muss die Koordination sie unterscheidbar machen (z. B. „Lenz Becker (Melle)").

## Einrichtung

```bash
npm install
cp .env.example .env   # VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY eintragen
npm run dev
```

### Supabase

1. SQL aus `supabase/migrations/0001_app_users.sql` im SQL-Editor ausführen.
2. Unter *Authentication → Providers → Email*: **Confirm email** ausschalten,
   damit die Fahrer:innen nach der Passwortvergabe sofort angemeldet sind.
   Bleibt die Bestätigung an, zeigt die App den entsprechenden Hinweis an.
3. Benutzer freischalten – der Name ist der Login, die Kontaktadresse optional:

```sql
insert into public.app_users (full_name, contact_email, role)
values ('Vorname Nachname', 'vorname.nachname@example.de', 'fahrer');
```

Rollen: `admin`, `koordinator`, `fahrer`.

## Technik

- React 18 + TypeScript + Vite
- Supabase (Auth + Postgres mit Row Level Security)

## Team verwalten

Angemeldete Administratoren sehen auf der Startseite den Bereich „Team verwalten"
mit dem Button **Fahrer hinzufügen**. Dort wird der Name eingegeben und per
Schalter festgelegt, ob die Person Administratorrechte bekommt.

Die Rechteprüfung liegt in der Datenbank (`admin_create_user`), nicht in der
Oberfläche – das Ausblenden des Buttons ist nur Komfort, keine Absicherung.

## Nächste Schritte

- Fahrten anlegen, zuordnen und im Kalender anzeigen
- Verfügbarkeiten der Fahrer:innen
- Chat zwischen Koordination und Fahrer:innen

