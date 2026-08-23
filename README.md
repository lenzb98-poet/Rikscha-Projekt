# Rikscha-App – Hospizinitiative Melle

Web-App zur Buchung und Verwaltung von Rikscha-Fahrten und -Fahrer:innen.
Aktueller Stand: **Benutzer-Login mit Supabase** (Schritt 1 des Projekts).

## Anmelde-Ablauf

1. Die Person gibt ihre **E-Mail-Adresse** ein.
2. Die App sucht die Adresse in der Supabase-Tabelle `app_users`
   (über die Funktion `check_login_email`).
   - Nicht gefunden → Hinweis, sich an die Koordination zu wenden.
   - Gefunden, aber deaktiviert → Hinweis auf den gesperrten Zugang.
3. **Erste Anmeldung** (noch kein Auth-Konto verknüpft):
   Die Person legt ihr **eigenes Passwort** fest. Danach wird das Auth-Konto
   über `link_auth_account()` mit dem Eintrag in `app_users` verknüpft.
4. **Weitere Anmeldungen**: normale Passwort-Anmeldung.

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
3. Benutzer freischalten:

```sql
insert into public.app_users (email, full_name, role)
values ('vorname.nachname@example.de', 'Vorname Nachname', 'fahrer');
```

Rollen: `admin`, `koordinator`, `fahrer`.

## Technik

- React 18 + TypeScript + Vite
- Supabase (Auth + Postgres mit Row Level Security)

## Nächste Schritte

- Fahrten anlegen, zuordnen und im Kalender anzeigen
- Verfügbarkeiten der Fahrer:innen
- Chat zwischen Koordination und Fahrer:innen
