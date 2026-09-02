/**
 * Die Seniorenheime in Melle, zu denen regelmäßig gefahren wird.
 *
 * Feste Liste im Programm statt in der Datenbank: Es sind vier Häuser vor
 * Ort, sie ändern sich so gut wie nie, und so braucht es keine eigene
 * Verwaltung dafür. Ändert sich doch etwas, wird es hier angepasst.
 */
export type Heim = {
  name: string
  anschrift: string
  telefon: string
}

export const SENIORENHEIME: Heim[] = [
  {
    name: 'Seniorenzentrum im Else-Quartier',
    anschrift: 'Am Elseufer 2, 49324 Melle',
    telefon: '05422 / 70 00 – 700',
  },
  {
    name: 'DRK Hardach-Stift',
    anschrift: 'Henri-Dunant-Straße 1, 49324 Melle',
    telefon: '05422 / 94 62 – 0',
  },
  {
    name: 'Lavendio Seniorenresidenz Melle',
    anschrift: 'Kosakenallee 11, 49324 Melle',
    telefon: '05422 / 92 72 50',
  },
  {
    name: 'Christliches Seniorenstift Melle',
    anschrift: 'Johann-Uttinger-Straße 1, 49324 Melle',
    telefon: '05422 / 603 – 0',
  },
]

/** Was im Feld „Wo“ steht: Name und Anschrift. */
export function heimOrt(h: Heim): string {
  return `${h.name}, ${h.anschrift}`
}

/** Die Telefonzeile für den Infotext. */
export function heimTelefonzeile(h: Heim): string {
  return `Tel. ${h.name}: ${h.telefon}`
}

/**
 * Setzt die Telefonzeile des gewählten Hauses in den Infotext.
 *
 * Selbst geschriebene Hinweise bleiben stehen; nur eine Telefonzeile, die
 * von einem anderen Haus stammt, wird ersetzt. Sonst sammelten sich beim
 * Umwählen alte Nummern an.
 */
export function infoMitTelefon(info: string, h: Heim): string {
  const bekannt = new Set(SENIORENHEIME.map(heimTelefonzeile))
  const rest = info
    .split('\n')
    .filter((zeile) => !bekannt.has(zeile.trim()))
    .join('\n')
    .trim()

  return rest === '' ? heimTelefonzeile(h) : `${heimTelefonzeile(h)}\n${rest}`
}
