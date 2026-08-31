# Rikscha-App – Hospiz-Initiative Melle e.V.

Web-App zur Verwaltung der Rikscha-Fahrten der Aktion **Radeln ohne Alter** in
Melle: Fahrten planen, Pilot:innen eintragen, nach der Fahrt die Zahlen
nachtragen und auswerten.

React + TypeScript + Vite, Daten in Supabase (PostgreSQL mit Row Level
Security). Veröffentlicht über GitHub Pages.

## Einrichtung

```bash
npm install
cp .env.example .env   # VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY eintragen
npm run dev
```

Die Migrationen unter `supabase/migrations/` der Reihe nach im Supabase
SQL-Editor ausführen. Unter *Authentication → Providers → Email* die
Bestätigungsmail abschalten, damit neue Pilot:innen sich direkt anmelden können.

Für die Veröffentlichung müssen unter *Settings → Secrets and variables →
Actions* die Werte `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` hinterlegt
sein; *Settings → Pages → Source* steht auf „GitHub Actions".

## Anmeldung

Angemeldet wird sich mit dem **vollen Namen**, nicht mit einer E-Mail-Adresse.

1. Name eingeben – die App sucht ihn in `app_users` (`check_login_name`).
2. **Erste Anmeldung:** Die Person legt selbst ein Passwort fest, danach wird
   das Auth-Konto mit dem Eintrag verknüpft.
3. **Weitere Anmeldungen:** normale Passwort-Anmeldung.

Supabase Auth braucht intern immer eine E-Mail. Deshalb gibt es drei Spalten:

- `full_name` – der Anmeldename, eindeutig (Groß-/Kleinschreibung egal)
- `login_email` – technische Kennung, nie angezeigt, aus dem Namen abgeleitet
  (`Lenz Becker` → `lenz.becker@rikscha-melle.de`)
- `contact_email` – die echte Adresse, optional, nur zur Kontaktaufnahme

Weil Namen der Login sind, müssen sie eindeutig sein. Eine Namensänderung ändert
den Anmeldenamen, **nicht** die `login_email` – ein gesetztes Passwort bleibt
gültig.

**Angemeldet bleiben** (Vorgabe: an) entscheidet, wo die Sitzung liegt: dauerhaft
im Browser oder nur für die laufende Browsersitzung. Die letzte Wahl ist beim
nächsten Mal vorausgewählt.

## Fahrer verwalten

Administratoren finden auf der Startseite **Fahrer verwalten**: Liste aller
Einträge mit Rolle und Status, dazu Anlegen, Bearbeiten, Deaktivieren und
Löschen.

Erfasst werden Name (Pflicht, zugleich Anmeldename), Rolle (Fahrer:in,
Koordination, Administration), Telefon und E-Mail (beide optional) sowie die
Freischaltung.

**Passwort zurücksetzen** entfernt das Anmeldekonto und löst die Verknüpfung;
die Person meldet sich dann wie beim ersten Mal nur mit dem Namen an und vergibt
ein neues Passwort. Der Weg per E-Mail scheidet aus, weil die Login-Kennung
meist abgeleitet ist. Der Eintrag und alle Fahrtanmeldungen bleiben erhalten.
Das eigene Passwort lässt sich hier nicht zurücksetzen.

**Löschen** entfernt den Eintrag samt Anmeldekonto in `auth.users` – nur so wird
der Name wieder frei. Zum bloßen Sperren ist Deaktivieren die bessere Wahl.

Die Rechteprüfung liegt in der Datenbank (`admin_create_user`,
`admin_update_user`, `admin_delete_user`, `admin_reset_password`), nicht in der
Oberfläche. Zusätzlich verhindert sie, dass Administratoren sich selbst
deaktivieren, löschen oder die eigenen Rechte entziehen.

## Fahrten

Auf der Startseite führen zwei Knöpfe zu den Fahrten, für alle Rollen:

- **Offene Fahrten** – es werden noch Pilot:innen gesucht
- **Fahrtenkalender** – Monatsansicht, jede Rikscha einzeln

Administratoren sehen zusätzlich **Fahrten verwalten** und
**Fahrtenbuch / Statistik**.

### Rikscha-Plätze

Jede Fahrt hat so viele **Plätze**, wie Rikschas gebraucht werden – je Platz ein
Datensatz in `ride_slots`, der zunächst frei ist. Gebucht wird einzeln.

- **Offene Fahrten** zeigt die Fahrt als *einen* Eintrag mit Zähler
  („1 von 4 Rikschas besetzt"). Der Knopf nimmt den ersten freien Platz.
- Der **Kalender** zeigt *jeden Platz einzeln* – blau solange frei, grün sobald
  vergeben, der eigene umrandet. Ein Klick auf einen freien Platz öffnet ein
  Fenster, in dem man genau diesen übernimmt.

Pro Fahrt kann jede Person nur einen Platz belegen. Beim Buchen wird die Zeile
gesperrt, damit sich zwei Leute nicht gleichzeitig denselben Platz nehmen. Wird
die Zahl der Rikschas später gesenkt, fallen zuerst die freien Plätze weg; unter
die Zahl der Buchungen lässt sie sich nicht senken.

### Ablauf

1. Die Koordination legt eine Fahrt an: Termin, Ort, Infotext und wie viele
   Rikschas gebraucht werden.
2. Die Fahrt erscheint unter **Offene Fahrten**. Wer mitfahren will, trägt sich
   dort oder über einen Platz im Kalender ein.
3. Sind alle Plätze belegt, gilt die Fahrt als zugesagt und verschwindet aus den
   offenen Fahrten.
4. Die Eingetragenen sehen oben auf der Startseite eine Meldung.

### Absagen

Der Knopf **Absagen** in dieser Meldung führt zu zwei Möglichkeiten:

- **Für mich absagen** – die Person wird ausgetragen, die Fahrt findet statt.
- **Die Fahrt absagen** – die gesamte Fahrt entfällt, auch für alle anderen.
  Dafür sind ein Grund und zwei Bestätigungen nötig. Vorgeschlagen wird
  „Wegen Regen abgesagt"; über *Anderer Grund* lässt sich ein Text eingeben.

Der Grund wird mit Namen als Mitteilung an der Fahrt festgehalten. Absagen darf,
wer eingetragen ist, sowie die Koordination.

### Zustände und Farben

Der Zustand ergibt sich größtenteils von selbst; gespeichert wird nur, was sich
nicht ableiten lässt (abgesagt, vorzeitig abgeschlossen).

| Zustand | Farbe | Bedeutung |
| --- | --- | --- |
| Offen | Blau | noch nicht alle Plätze belegt, Termin in der Zukunft |
| Zugesagt | Grün | alle Plätze belegt, Termin in der Zukunft |
| Angaben fehlen | – | Termin vorbei, Nacherfassung offen |
| Abgeschlossen | Gelb | nachgetragen oder Frist abgelaufen |
| Abgesagt | Rot | von der Koordination oder einer Pilot:in abgesagt |

## Nacherfassung

Nachgetragen wird **je Rikscha-Platz**: Jede Pilot:in trägt für ihren eigenen
Platz ein, wie weit sie gefahren ist, wie lange es gedauert hat, wie viele
Fahrgäste dabei waren und **welche Rikscha** sie hatte. Zur Auswahl stehen die
vier Rikschas des Vereins: **Fritz, Fred, Liese und Lotte**.

Es genügt, **einzelne Angaben** zu machen und zu speichern – die übrigen können
später folgen. Bereits Eingetragenes bleibt stehen; ein ausgefülltes Feld
ersetzt den alten Wert, sodass sich Fehler korrigieren lassen.

Die Fahrt ist **abgeschlossen**, sobald alle belegten Plätze vollständig sind.
Bleibt der Nachtrag aus, gilt sie **zwei Tage** nach dem Termin trotzdem als
abgeschlossen. Der Dialog nennt, wie lange noch Zeit bleibt; der Zeitpunkt kommt
aus der Datenbank, damit er nicht von der Zustandsgrenze abweicht. Nach Ablauf
lässt sich weiterhin nachtragen.

## Fahrtenbuch und Statistik

Der Knopf **Fahrtenbuch / Statistik** führt zu einer Tabelle im gewohnten
Aufbau:

| Nr. | Datum | Fahrer / Fahrerin | Fritz · Fred · Liese · Lotte | Passagiere | Gefahrene KM | Dauer / Zeit | Bemerkungen |

**Jede gefahrene Rikscha steht einzeln.** Fahren zwei Personen gemeinsam, gibt
es zwei Zeilen mit demselben Datum. Die gefahrene Rikscha wird mit einem **X**
in ihrer Spalte gekennzeichnet.

Die Dauer steht in **Stunden** (2,5 statt 150 Minuten), wie im bisherigen Buch;
erfasst wird sie in Minuten. Unter „Bemerkungen" stehen Ort und Infotext.

Die Tabelle lässt sich waagerecht schieben, die Nummernspalte bleibt stehen.
Unten fasst eine Summenzeile alles zusammen.

### Bisherige Zahlen übernehmen

Ganz oben stehen die übernommenen Zahlen aus der Zeit vor dieser App –
eingetragen über **Zahlen übernehmen** als eine zusammengefasste Zeile mit
Bezeichnung. Sie zählen in der Summenzeile und in der Auswertung mit. Mehrere
Übernahmen sind möglich, etwa je Jahr.

## Auswertung

Am Ende der Startseite stehen drei Gesamtwerte: gefahrene Kilometer, gefahrene
Minuten und beförderte Fahrgäste, dazu die Zahl der Fahrten. Darunter eine
Auswertung **je Rikscha**. Werte aus der Zeit vor der Rikscha-Erfassung
erscheinen dort als „Ohne Angabe".

## Piloten Chat

Ein gemeinsamer Verlauf für alle Freigeschalteten, erreichbar über den grünen
Knopf **Piloten Chat** unter den Fahrten-Knöpfen.

- Enter sendet, Umschalt+Enter macht einen Zeilenumbruch
- Eigene Nachrichten rechts in Blau, fremde links in Grau
- Eigene Nachrichten löschbar, Administratoren auch fremde
- Deaktivierte Zugänge können weder lesen noch schreiben

Der Absender wird serverseitig aus der Anmeldung bestimmt und lässt sich nicht
fälschen. Gelesen wird über `list_messages`, weil die Policy auf `app_users`
Nicht-Administratoren nur den eigenen Datensatz zeigt.

### Bilder

Über das Kamerasymbol lassen sich Fotos anhängen. Vor dem Hochladen verkleinert
die App sie auf höchstens 1600 px – ein Handyfoto schrumpft dadurch von mehreren
Megabyte auf unter 100 KB.

Der Speicher ist auf **750 MiB** begrenzt. Wird die Grenze überschritten,
verschwinden die **ältesten Bilder zuerst**; der Text bleibt stehen, an der
Stelle des Bildes erscheint ein Hinweis. Aufgeräumt wird nach jedem Hochladen in
drei Schritten – Kandidaten erfragen, Dateien löschen, Löschung melden – weil
ein `DELETE` in der Datenbank die Datei im Speicher nicht mit entfernt.

## Als App auf dem Handy

Die Seite lässt sich zum Startbildschirm hinzufügen und startet dann ohne
Browserleiste, mit dem Logo von „Radeln ohne Alter – Melle" als Symbol. Auf der
Startseite steht dafür der Knopf **App auf dem Handy einrichten** mit einer
Anleitung für iPhone und Android.

Zwei Feinheiten: Das Symbol für iOS hat **keinen Alphakanal** – bei Transparenz
füllt iOS den Hintergrund schwarz. Für Android gibt es zusätzlich ein
`maskable`-Symbol mit größerem Rand.

Als App verlässt die Zurück-Geste auf der Startseite die App nicht mehr – dort
gibt es keine vorher besuchte Seite, das Zurück führte sonst auf eine weiße
Fläche. Im Browser bleibt es beim gewohnten Verhalten.

Offline funktioniert die App nicht – dafür wäre ein Service Worker nötig.

## Gestaltung

Die Oberfläche folgt dem Auftritt des Vereins:

- Markenfarbe `#245892`, aus dem Hintergrundbild der Website entnommen
- Wortmarke und Möwe liegen als `src/assets/logo.png` und `src/assets/moewe.png`
- Das Logo ist weiß und steht nur auf blauem Grund
- Der Knopf zum Chat trägt das Grün von WhatsApp (`#25d366`) mit dunkler
  Schrift: Weiß käme nur auf 1,98:1 Kontrast, dunkel erreicht 7,46:1

Farben sind als CSS-Variablen in `src/styles.css` unter `:root` gesammelt.

## Fehleranzeige

Eine Start-Diagnose in `index.html` läuft vor der App und fängt ab, was das
Laden verhindert:

| Code | Bedeutung |
| --- | --- |
| `E-SCRIPT-LOAD` | Programmdatei nicht erreichbar |
| `E-RUNTIME` | Fehler beim Ausführen |
| `E-PROMISE` | fehlgeschlagene Hintergrundanfrage |
| `E-BOOT-TIMEOUT` | App meldet sich nicht innerhalb von 12 Sekunden |
| `E-MOUNT`, `E-RENDER` | React-Fehler über dieselbe Anzeige |

Fehler ohne Herkunft oder aus fremden Dateien werden ignoriert – Safari meldet
Fehler aus Erweiterungen als bloßes „Script error.". Läuft die App bereits,
übernimmt die Diagnose nicht mehr; dann fängt die ErrorBoundary in React.

## Migrationen

Die Migrationen liegen unter `supabase/migrations/` und laufen der Reihe nach.
Die jüngeren (ab `0016`) sind **wiederholbar**: Bricht eine im SQL-Editor ab,
lässt sie sich erneut ausführen, ohne dass etwas doppelt verarbeitet wird. Die
älteren bis `0015` sind nur einmal ausführbar.
