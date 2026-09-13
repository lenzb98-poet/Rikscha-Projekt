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
 * Die Farben laufen einmal um den ganzen Farbkreis, in Schritten von 20
 * Grad. Ihre Helligkeit ist jeweils so weit abgesenkt, dass alle auf dem
 * Blasenhintergrund (#eef2f7) auf 4,9:1 Kontrast kommen - gut lesbar auch
 * in der kleinen Namenszeile, und untereinander gleich kräftig. Gelb und
 * Grün geraten dabei zwangsläufig dunkler als Blau und Rot: Sie sind von
 * sich aus heller und müssen weiter abgedunkelt werden, um lesbar zu
 * bleiben.
 */
const FARBEN = [
  '#d11111', // Rot
  '#b4460f', // Orangerot
  '#8b610b', // Ocker
  '#6c6c09', // Oliv
  '#507309', // Grasgrün
  '#2e780a', // Blattgrün
  '#0a7a0a', // Grün
  '#0a792f', // Smaragd
  '#0a7853', // Petrol
  '#097575', // Türkis
  '#0d6fa0', // Stahlblau
  '#155dec', // Blau
  '#5151f1', // Indigo
  '#7a40ef', // Violett
  '#a213ea', // Purpur
  '#b80fb8', // Magenta
  '#c51089', // Pink
  '#ce1150', // Himbeere
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
