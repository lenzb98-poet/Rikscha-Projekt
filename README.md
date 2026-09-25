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

## Organisation wählen

Vor der Anmeldung steht eine **Auswahl der Organisation**: oben das Logo von
„Radeln ohne Alter", darunter alle Organisationen, die die App nutzen. Ein Tipp
führt zur Anmeldung dieser Organisation. Die Wahl merkt sich der Browser; auf
der Anmeldeseite lässt sie sich über *wechseln* ändern.

Ein Link mit `?org=kürzel` (etwa `…/?org=melle`) wählt die Organisation gleich
aus und überspringt die Liste – praktisch, um Pilot:innen den direkten Weg zur
Anmeldung zu schicken.

Die Organisationen stehen in der Tabelle `organisationen` (Migration `0036`),
gelesen vor der Anmeldung über `list_organisationen()`, die nur Name und
Kürzel herausgibt. Die erste ist die Hospiz-Initiative Melle e.V. (`melle`).

Die **Daten sind nach Organisation getrennt** (siehe *Trennung der Daten*).

## Betreiber

Der **Betreiber** steht über den Organisationen. Wer es ist, steht in der
Tabelle `betreiber` (Migration `0037`) – ohne jede Schreibregel, aus der App
lässt sich dort niemand eintragen. Eingetragen ist Lenz Becker.

Der Betreiber sieht in den **Admin Einstellungen** ganz oben das Feld
**Betreiber Einstellungen**. Dort:

- **Organisation hinzufügen** mit *Name der Organisation* und *Erster Admin und
  Benutzer*. Das Kürzel für den Anmeldelink entsteht aus dem Namen
  („Rikscha-Verein Osnabrück e.V.“ → `rikscha-verein-osnabrueck`). Die erste
  Administration meldet sich nur mit ihrem Namen an und vergibt beim ersten
  Mal selbst ein Passwort; ihre technische Kennung trägt das Kürzel
  (`…@kürzel.rikscha-fahrten.de`).
- **Bearbeiten**: Name und Kürzel.
- **Stilllegen**: nicht mehr in der Auswahl, keine Anmeldung, Daten bleiben.
- **Löschen**: mit allen Daten und Anmeldekonten, nach drei Bestätigungen
  (Unterweisung, Namen eintippen, endgültig löschen). Den Namen prüft auch die
  Datenbank.
- **Speicher**: je Organisation Personen, Fahrten, Nachrichten sowie grob der
  Speicher – Bilder im Chat und geschätzte Datenmenge (Summe der Zeilen).

Die eigene Organisation lässt sich weder stilllegen noch löschen.

Personenliste und Personenverwaltung zeigen nur die eigene Organisation,
Namen sind je Organisation eindeutig.

## Trennung der Daten

Seit Migration `0038` sieht und ändert jede Organisation nur ihre eigenen
Daten. Zwei Schichten sorgen dafür:

1. **Schreiben – ein Wächter an jeder Tabelle.** Die Trigger `org_schutz_*`
   prüfen bei jedem Anlegen, Ändern und Löschen, ob der Eintrag zur eigenen
   Organisation gehört – egal, welche Funktion schreibt. Auch Verweise werden
   geprüft: Pilot:in und Rikscha eines Platzes, die beantwortete Nachricht, die
   Nachricht einer Reaktion. Sonst: „Dieser Eintrag gehört zu einer anderen
   Organisation.“ Nur das Löschen einer ganzen Organisation durch den Betreiber
   schaltet den Wächter für diese eine Transaktion ab.
2. **Lesen – Funktionen und Zeilenregeln.** Jede Lesefunktion filtert nach
   `eigene_org_id()`, ebenso jede Zeilenregel (RLS). Die Zeilenregeln gelten
   auch für die Live-Aktualisierung der Fahrten und des Chats.

Außerdem je Organisation: **Logo, Akzentfarbe und Name** (Tabelle
`einstellungen`, eine Zeile je Organisation; vor der Anmeldung gilt die
gewählte, danach die eigene), **Rikschas und Heime** mit eigenen Namen,
**Bilder** im Speicher unter `<org_id>/…` (ältere Dateien der
Stammorganisation liegen weiter ohne Ordner). Die Grenze für Chat-Bilder gilt
dagegen für alle zusammen (siehe *Speicher-Budget*).

Die technische Anmeldekennung trägt außerhalb der Stammorganisation das Kürzel
(`vorname.nachname@kürzel.rikscha-fahrten.de`), damit gleiche Namen in
verschiedenen Organisationen nicht zusammenstoßen.

Eine **stillgelegte** Organisation gilt als nicht freigeschaltet: Auch wer
schon angemeldet ist, sieht dann nichts mehr.

**Aufrufrechte** (Migration `0039`): Ohne Anmeldung lassen sich nur die vier
Funktionen aufrufen, die Auswahl- und Anmeldeseite brauchen –
`list_organisationen`, `check_login_name`, `erscheinungsbild` und (für ältere
Fassungen der App) `vereinslogo`. Neue Funktionen sind nicht mehr von selbst
für alle aufrufbar; wer eine vor der Anmeldung braucht, gibt sie ausdrücklich
frei.

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

## Pilot/-innen Liste

Die Liste steht **allen Angemeldeten** offen: Namen, Rolle und Kontaktdaten
aller Pilot:innen. Wer sie ändern darf, hängt an der Rolle.

| | Fahrer:in | Koordination | Administration |
|---|---|---|---|
| Liste sehen | ja | ja | ja |
| Deaktivierte sehen, Passwortstand | – | ja | ja |
| Anlegen, bearbeiten, deaktivieren | – | ja | ja |
| Rolle Fahrer:in / Koordination vergeben | – | ja | ja |
| Passwort zurücksetzen | – | ja | ja |
| Einträge löschen | – | ja | ja |
| **Administrationsrolle vergeben und entziehen** | – | – | ja |
| **Zugänge der Administration löschen** | – | – | ja |

Gelesen wird über `list_piloten()`: Die Policy auf `app_users` zeigt
Fahrer:innen weiterhin nur den eigenen Datensatz, direkte Abfragen bleiben also
zu. Die Funktion entscheidet auch, wer wen sieht – Deaktivierte und der
Passwortstand sind Verwaltungswissen und werden Fahrer:innen gar nicht erst
geliefert.

**Koordination und Administration sind weitgehend gleichgestellt.** Beide
dürfen Fahrten anlegen und bearbeiten, das Fahrtenbuch führen, fremde
Chatnachrichten löschen, Personen anlegen, bearbeiten, deaktivieren, löschen
und Passwörter zurücksetzen. Geprüft wird dafür überall `darf_verwalten()`.

Zwei Dinge bleiben bei der Administration, geprüft mit `is_admin()`:

- **Zugänge der Administration löschen** – Löschen ist nicht rückholbar.
- **Die Administrationsrolle vergeben *und entziehen***.

Dass auch das Entziehen gesperrt ist, hält die erste Regel dicht: Sonst könnte
die Koordination einer Administration erst die Rolle nehmen und den Zugang
danach löschen. Alles Übrige an einem Eintrag der Administration – Name,
Telefon, E-Mail, Freischaltung – darf die Koordination weiterhin ändern.

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

Der Trigger `app_users_guard_privileges` sichert denselben Rahmen an der
Tabelle ab, für den Fall, dass jemand die Funktionen umgeht: Rolle, Name und
Freischaltung ändert nur, wer verwalten darf. Ohne ihn könnte sich jede
Fahrer:in über die eigene Zeile selbst befördern – die Policy erlaubt jeder
Person Änderungen daran.

## Fahrten

Auf der Startseite führen zwei Knöpfe zu den Fahrten, für alle Rollen:

- **Offene Fahrten** – es werden noch Pilot:innen gesucht
- **Fahrtenkalender** – Monatsansicht, jede Rikscha einzeln

Koordination und Administration sehen zusätzlich **Fahrten verwalten** und
**Fahrtenbuch / Statistik**.

### Seniorenheime als Vorlage

Beim Anlegen einer Fahrt stehen über dem Feld *Wo* die Seniorenheime der
eigenen Organisation zur Auswahl. Ein Tipp darauf trägt Name und Anschrift als
Ort ein, dazu Telefonnummer und den eigenen Infotext des Hauses in den
Infotext der Fahrt; alles bleibt danach frei änderbar. Wechselt man das Haus,
werden die Zeilen der alten Vorlage ersetzt – selbst geschriebene Hinweise
bleiben stehen.

Gepflegt wird die Liste in den Admin Einstellungen unter *Vorlagen:
Seniorenheime*: Name, Anschrift, Telefon und ein optionaler Infotext (bis 500
Zeichen, z. B. „Treffpunkt am Haupteingang, bitte an der Pforte melden“).

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
   Rikschas gebraucht werden. Wer schon feststeht, lässt sich dabei gleich
   zuordnen – die Fahrt wird zuerst angelegt, danach werden die Plätze besetzt.
   Mehr Personen als Rikschas nimmt die Auswahl nicht an.
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
Fahrgäste dabei waren und **welche Rikscha** sie hatte.

Die **Fahrzeit wird in Stunden erfasst** (2,5 für zweieinhalb), wie im
bisherigen Fahrtenbuch. Gespeichert wird weiterhin in Minuten – die Umrechnung
passiert bei der Eingabe, sodass Auswertung und vorhandene Daten unverändert
bleiben. Zur Auswahl stehen die Rikschas im Dienst (siehe *Rikschas verwalten*).

Es genügt, **einzelne Angaben** zu machen und zu speichern – die übrigen können
später folgen. Bereits Eingetragenes bleibt stehen; ein ausgefülltes Feld
ersetzt den alten Wert, sodass sich Fehler korrigieren lassen.

Die Fahrt ist **abgeschlossen**, sobald alle belegten Plätze vollständig sind.
Bleibt der Nachtrag aus, gilt sie **zwei Tage** nach dem Termin trotzdem als
abgeschlossen. Der Dialog nennt, wie lange noch Zeit bleibt; der Zeitpunkt kommt
aus der Datenbank, damit er nicht von der Zustandsgrenze abweicht. Nach Ablauf
lässt sich weiterhin nachtragen.

### Rikschas verwalten

Die Rikschas stehen in der Tabelle `rikschas` (Migration `0034`) und werden in
den **Admin Einstellungen** gepflegt – nur von der Administration.

- **Anlegen / Bearbeiten**: Name, höchstens 40 Zeichen, jeder Name nur einmal.
- **Stilllegen**: Die Rikscha steht beim Nachtragen nicht mehr zur Wahl, alle
  bisherigen Einträge bleiben. Jederzeit mit *Wieder in Dienst* umkehrbar. Ein
  Platz, der schon eine stillgelegte Rikscha trägt, behält sie.
- **Löschen**: endgültig, mit drei Bestätigungen – die Unterweisung mit den
  Zahlen dieser Rikscha lesen und abhaken, den Namen eintippen, zuletzt
  *Endgültig löschen*. Den Namen prüft auch die Datenbank
  (`rikscha_loeschen`). Die betroffenen Einträge behalten Kilometer, Dauer und
  Fahrgäste, stehen im Fahrtenbuch unter „gelöscht" und gelten weiter als
  vollständig (`ride_slots.rikscha_entfernt`) – sonst müssten Pilot:innen alte
  Fahrten erneut nachtragen.

Bis Migration `0034` waren die vier Rikschas der feste Datentyp `rikscha_name`.
Die Migration hat Fritz, Fred, Liese und Lotte samt allen Zuordnungen
übernommen und den Datentyp danach entfernt.

## Fahrtenbuch und Statistik

Der Knopf **Fahrtenbuch / Statistik** führt zu einer Tabelle im gewohnten
Aufbau:

| Nr. | Datum | Fahrer / Fahrerin | je Rikscha eine Spalte | Passagiere | Gefahrene KM | Dauer / Zeit | Wo | Infotext |

Die Rikscha-Spalten kommen aus der Datenbank, stillgelegte stehen blasser mit
dabei. Gibt es Einträge, deren Rikscha gelöscht wurde, kommt eine Spalte
**gelöscht** hinzu.

**Jede gefahrene Rikscha steht einzeln.** Fahren zwei Personen gemeinsam, gibt
es zwei Zeilen mit demselben Datum. Die gefahrene Rikscha wird mit einem **X**
in ihrer Spalte gekennzeichnet.

Die Dauer steht in **Stunden** (2,5 statt 150 Minuten), wie im bisherigen Buch;
erfasst wird sie in Minuten.

**Wo** und **Infotext** stehen in eigenen Spalten und gehören zur Fahrt, nicht
zum einzelnen Platz. Geändert werden sie deshalb unter *Fahrten verwalten* und
stehen hier nur zum Lesen – sonst änderte eine Zeile auch alle anderen Zeilen
derselben Fahrt mit.

Die Tabelle lässt sich waagerecht schieben, die Nummernspalte bleibt stehen.

**Das Neueste steht oben:** Ganz oben, gleich unter den Überschriften, fasst
eine Summenzeile alles zusammen. Darunter folgen die Fahrten von der neuesten
bis zur ersten; die Plätze einer Fahrt behalten ihre Reihenfolge. Die Nummer
zählt von der ersten Fahrt an und bleibt fest – die neueste trägt die höchste.

### Bisherige Zahlen übernehmen

Ganz unten, als ältester Teil, stehen die übernommenen Zahlen aus der Zeit vor
dieser App –
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
- **Antworten** an jeder Nachricht: Über dem Eingabefeld erscheint dann ein
  Ausschnitt der ursprünglichen Nachricht, in der gesendeten Blase steht sie
  als Zitat. Ein Tipp darauf springt zur ursprünglichen Nachricht und hebt sie
  kurz hervor.
- **Reagieren** an jeder Nachricht: öffnet eine Leiste mit sechs Zeichen
  (👍 ❤️ 😊 👏 🙏 😢). Gesetzte Reaktionen stehen als Chips unter der Nachricht,
  mit Anzahl; ein Tipp auf einen Chip nimmt die eigene wieder zurück, der
  Tooltip nennt die Namen.
- Eigene Nachrichten rechts in Blau, fremde links in Grau
- Eigene Nachrichten löschbar, Administratoren auch fremde
- Deaktivierte Zugänge können weder lesen noch schreiben

Die Auswahl der Zeichen ist bewusst klein und fest (`REAKTIONEN` im Programm,
derselbe Check an `message_reactions`): auf jedem Gerät gleich, ohne
Fremdbibliothek, mit einem Griff bedienbar. `message_reagieren()` schaltet um –
dasselbe Zeichen erneut zu wählen nimmt es zurück. Wird eine Nachricht
gelöscht, verschwinden ihre Reaktionen mit ihr.

Der Bezug einer Antwort steht in `messages.reply_to`. Wird die ursprüngliche
Nachricht gelöscht, fällt er still weg (`on delete set null`) und die Antwort
bleibt als gewöhnliche Nachricht stehen – eine Kopie des Textes aufzubewahren
wäre bequemer, würde aber das Löschen unterlaufen.

Der Absender wird serverseitig aus der Anmeldung bestimmt und lässt sich nicht
fälschen. Gelesen wird über `list_messages`, weil die Policy auf `app_users`
Nicht-Administratoren nur den eigenen Datensatz zeigt.

### Ungelesene Nachrichten

Am Chat-Knopf steht die Zahl der ungelesenen Nachrichten in einer roten Pille,
wie am App-Symbol auf dem Handy; ab 100 als „99+“. Eigene Nachrichten zählen
nicht mit.

Der Lesestand steht **in der Datenbank** bei der Person selbst
(`app_users.chat_gesehen_bis`) und gilt damit auf allen Geräten: Wer am Handy
liest, sieht dieselben Nachrichten am Rechner nicht mehr als ungelesen. Ein
Zeitstempel je Person genügt, deshalb eine Spalte statt einer eigenen Tabelle.

- `chat_gesehen(p_bis)` – hält fest, bis wohin gelesen wurde
- `chat_ungelesen()` – zählt, was danach von anderen kam

Zwei Regeln schützen den Stand vor kaputten Uhren und mehreren Geräten:

- Er wandert **nur vorwärts** (`greatest`). Sonst zöge ein zweites Gerät, das
  noch einen älteren Verlauf anzeigt, schon Gelesenes wieder auf ungelesen.
- Er wandert **nie in die Zukunft** (`least(…, now())`). Ein vorgehendes Gerät
  würde sonst künftige Nachrichten im Voraus abhaken.

Beim Öffnen des Chats wird der Stand einmal gemeldet, danach nur, wenn
tatsächlich eine neuere Nachricht dazugekommen ist – der Verlauf lädt alle
20 Sekunden nach, sonst ginge bei jedem Durchlauf ein Schreibzugriff hinaus.

Wer neu angelegt wird und alle, die es zum Zeitpunkt der Migration schon gab,
starten mit „jetzt gelesen“. Sonst stünde der gesamte bisherige Verlauf als
ungelesen am Knopf.

### Bilder

Über das Kamerasymbol lassen sich Fotos anhängen. Vor dem Hochladen verkleinert
die App sie auf höchstens 1600 px – ein Handyfoto schrumpft dadurch von mehreren
Megabyte auf unter 100 KB.

Wie viel Platz Bilder haben, legt der Betreiber im **Speicher-Budget** fest
(siehe unten). Wird die Grenze überschritten, verschwinden die **ältesten Bilder
zuerst** – über alle Organisationen hinweg; der Text bleibt stehen, an der
Stelle des Bildes erscheint ein Hinweis.

### Speicher-Budget

In den **Betreiber Einstellungen** stehen zwei Grenzen für alle Organisationen
zusammen (Migration `0040`, Tabelle `speicher_budget`):

- **Gesamtbudget**, Vorgabe **1 GB** (1024 MB), mindestens 100 MB
- **Bildspeicher**: höchstens so viel für Chat-Bilder, Vorgabe 750 MB

Für Bilder gilt stets die **kleinere** der beiden: der eingestellte
Bildspeicher oder das, was das Gesamtbudget nach den **übrigen Daten** lässt –
der ganzen Datenbank (auch Anmeldekonten und Verwaltung) und den Logos.
Wachsen die übrigen Daten, schrumpft der Platz für Bilder mit, und die ältesten
verschwinden (FIFO über alle Organisationen).

Geräumt wird in zwei Schritten, weil eine Datenbankfunktion Dateien im
Speicher nicht selbst löschen kann:

1. `speicher_aufraeumen()` markiert die ältesten Bilder, bis die Grenze
   eingehalten ist, und setzt sie auf die **Löschliste** (`bild_loeschliste`).
   Auch Dateien ohne Nachricht (etwa nach abgebrochenem Senden, älter als zehn
   Minuten) kommen darauf.
2. Die App entfernt die Dateien auf der Liste aus dem Speicher und meldet sie
   mit `bilder_entfernt()`. Dateien auf der Liste darf **jede** angemeldete
   Person löschen, auch aus dem Ordner einer anderen Organisation – nur diese.

Die App räumt **bei jedem Start** und **nach jedem Hochladen** auf, außerdem
beim Speichern eines neuen Budgets und über *Bildspeicher aufräumen* in den
Admin Einstellungen. Wer das Budget senkt, sieht vorher, wie viel weichen muss.

## Als App auf dem Handy

Die Seite lässt sich zum Startbildschirm hinzufügen und startet dann ohne
Browserleiste, unter dem Namen **Rikscha-Fahrten** und mit dem Logo des
Projekts „Radeln ohne Alter" als Symbol (ohne Ortsnamen, für alle Standorte
gleich). Auf der
Startseite steht dafür der Knopf **App auf dem Handy einrichten** mit einer
Anleitung für iPhone und Android (direkt unter **Kurzanleitung ansehen**).

Zwei Feinheiten: Das Symbol für iOS hat **keinen Alphakanal** – bei Transparenz
füllt iOS den Hintergrund schwarz. Für Android gibt es zusätzlich ein
`maskable`-Symbol mit größerem Rand.

Als App verlässt die Zurück-Geste auf der Startseite die App nicht mehr – dort
gibt es keine vorher besuchte Seite, das Zurück führte sonst auf eine weiße
Fläche. Im Browser bleibt es beim gewohnten Verhalten.

Offline funktioniert die App nicht – dafür wäre ein Service Worker nötig.

## Kurzanleitung (Video)

Beim **ersten Login** öffnet sich ein Video von knapp fünf Minuten, das alles
zeigt, was Pilotinnen und Piloten brauchen: Startseite, App aufs Handy,
Fahrt finden, Kalender, Absagen (auch die ganze Fahrt wegen Regen), Angaben
nach der Fahrt, Chat und Team. Die Anmeldung selbst und die Funktionen der
Koordination kommen darin nicht vor.

Ganz unten auf der Startseite steht der Knopf **Kurzanleitung ansehen** – dort
lässt sich das Video jederzeit wieder aufrufen.

Das Video erscheint im **Vollbild**: Die Ebene füllt den ganzen Bildschirm,
mit Kopfzeile (Titel und ✕) und einem Knopf darunter. Wo der Browser es
erlaubt, schaltet die App zusätzlich ins echte Vollbild – beim Knopf sofort,
beim ersten Login mit dem Tipp auf Abspielen (Browser verlangen dafür einen
Tipp). Beim Schließen geht es zurück.

Ob jemand das Video schon gesehen hat, steht in `app_users.tutorial_gesehen_am`
und gilt damit auf allen Geräten. Gesetzt wird es beim Schließen des Fensters
(`tutorial_gesehen()`). Wer beim Einführen der Funktion schon ein
Anmeldekonto hatte, gilt als „gesehen“ und bekommt das Video nicht mehr
ungefragt – nur über den Knopf.

Das Video liegt in `public/tutorial/` als MP4 (H.264, spielen praktisch alle
Handys) und als WebM für Browser ohne H.264; der Browser nimmt das erste, das
er abspielen kann. Die Aufnahme zeigt Beispieldaten („Maria Muster“), keine
echten Personen.

## Gestaltung

Die Oberfläche folgt dem Auftritt des Vereins:

- Markenfarbe `#245892`, aus dem Hintergrundbild der Website entnommen
- Die weiße Wortmarke des Vereins liegt als Vorlage unter `src/assets/logo.png`;
  angezeigt wird sie nur, wenn sie in den Admin Einstellungen hochgeladen ist
- Der Knopf zum Chat trägt das Grün von WhatsApp (`#25d366`) mit dunkler
  Schrift: Weiß käme nur auf 1,98:1 Kontrast, dunkel erreicht 7,46:1

Farben sind als CSS-Variablen in `src/styles.css` unter `:root` gesammelt.

### Eigenes Logo

In den **Admin Einstellungen** lädt die Administration das Logo der
Organisation hoch (PNG, JPG oder WebP, höchstens 2 MB). Es erscheint oben
links in der Leiste und auf der Anmeldeseite. **Ohne hochgeladenes Logo bleibt
der Platz leer** – die App bringt kein eigenes mit. „Logo entfernen" löscht es
wieder.

Das Logo liegt im Speicherort `vereinslogo`, der Pfad in der Tabelle
`einstellungen` (Migration `0032`). Beides ist öffentlich lesbar, weil die
Anmeldeseite das Logo vor der Anmeldung zeigt; hochladen und ändern darf nur
die Administration. SVG ist ausgeschlossen, weil solche Dateien Skripte
enthalten können.

### Name der App

Ebenfalls in den **Admin Einstellungen** legt die Administration den Namen der
App fest (höchstens 40 Zeichen). Er steht als Überschrift auf der
Anmeldeseite und im Titel des Browser-Tabs; ohne eigenen Namen bleibt
„Rikscha-Fahrten“. Gespeichert in `einstellungen.app_name` (Migration `0035`),
gelesen über `erscheinungsbild()`.

Der Name unter dem Symbol auf dem Startbildschirm kommt aus
`manifest.webmanifest` und bleibt „Rikscha-Fahrten“: Das Handy liest ihn beim
Installieren, bevor die App läuft.

### Akzentfarbe

Ebenfalls in den **Admin Einstellungen** wählt die Administration die
Akzentfarbe (Farbrad oder Farbcode `#rrggbb`, mit Vorschau). Sie ersetzt das
Blau in Leiste, Anmeldeseite, Knöpfen und Überschriften; die dunklere und die
hellere Abstufung berechnet die App selbst (`src/lib/erscheinungsbild.ts`).
Ohne eigene Farbe setzt die App nichts, dann gelten genau die Töne aus
`src/styles.css`.

- Weiße Schrift muss auf der Farbe lesbar bleiben: Unter einem Kontrast von
  4,5 : 1 lässt sie sich nicht speichern.
- Die Zustandsfarben der Fahrten (offen, besetzt, abgesagt) bleiben fest,
  damit sie bei jeder Akzentfarbe unterscheidbar sind.
- Die Farbe liegt in `einstellungen.akzentfarbe` (Migration `0033`) und kommt
  zusammen mit dem Logo aus `erscheinungsbild()`, auch vor der Anmeldung.
- Das Symbol und die Farbe beim Installieren als App (`manifest.webmanifest`)
  bleiben blau; sie stehen fest in der Datei.

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
