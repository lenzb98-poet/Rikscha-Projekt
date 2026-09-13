/**
 * Jede Person bekommt im Chat ihre eigene Farbe - wie in einer
 * WhatsApp-Gruppe. Gefärbt wird der Name über der Nachricht, nicht die
 * Blase: So bleibt der Text überall gleich gut lesbar und man erkennt
 * trotzdem beim Überfliegen, wer schreibt.
 *
 * Die Farbe wird aus dem Namen berechnet und nicht gespeichert. Damit ist
 * sie auf jedem Gerät dieselbe, ohne dass es dafür eine Spalte in der
 * Datenbank braucht. Der Name eignet sich hier als Schlüssel, weil er in
 * dieser App eindeutig ist - er ist zugleich die Anmeldung. Nebenbei
 * bekommt ein Zitat dieselbe Farbe wie die Person, von der es stammt; dort
 * ist nur der Name bekannt, keine Kennung.
 *
 * Alle Farben erreichen auf dem Blasenhintergrund (#eef2f7) mindestens
 * 4,4:1 Kontrast und sind damit auch in kleiner Schrift gut lesbar.
 */
const FARBEN = [
  '#1d4ed8', // Blau
  '#be123c', // Rot
  '#0f766e', // Petrol
  '#b45309', // Orange
  '#7c3aed', // Violett
  '#15803d', // Grün
  '#a21caf', // Magenta
  '#0e7490', // Cyan
  '#9a3412', // Braun
  '#4d7c0f', // Oliv
  '#86198f', // Lila
  '#374fa0', // Indigo
  '#065f46', // Tannengrün
  '#c2410c', // Ziegelrot
  '#8a5a2b', // Karamell
  '#4338ca', // Königsblau
  '#155e75', // Stahlblau
  '#9f1239', // Weinrot
]

export function farbeFuerName(name: string | null | undefined): string {
  const text = (name ?? '').trim()
  if (text === '') return FARBEN[0]

  // FNV-1a: kurz, ohne Fremdbibliothek, und streut auch ähnliche Namen
  // ("Anna" / "Anne") zuverlässig auf verschiedene Farben.
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }

  return FARBEN[Math.abs(hash) % FARBEN.length]
}
