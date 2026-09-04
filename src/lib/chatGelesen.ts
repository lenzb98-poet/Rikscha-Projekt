import { useCallback, useEffect, useState } from 'react'
import { supabase, watchMessages } from './supabase'

/**
 * Ungelesene Chatnachrichten.
 *
 * Wann jemand zuletzt in den Chat geschaut hat, steht nur im Browser
 * (localStorage) – die Datenbank kennt keinen Lesestand. Das genügt für
 * einen Zähler am Knopf und spart eine Tabelle samt Schreibzugriffen.
 *
 * Folge davon: Der Stand gilt je Gerät. Wer am Handy liest, sieht die
 * Nachrichten am Rechner weiterhin als ungelesen.
 */
const SCHLUESSEL = 'rikscha.chat-zuletzt-gesehen'

/**
 * Zeitpunkt des letzten Blicks in den Chat.
 *
 * Beim allerersten Mal gilt der jetzige Moment als gesehen. Sonst stünden
 * beim ersten Öffnen der App alle je geschriebenen Nachrichten als
 * ungelesen am Knopf – das wäre kein Hinweis, sondern nur Lärm.
 */
export function zuletztGesehen(): string {
  try {
    const wert = localStorage.getItem(SCHLUESSEL)
    if (wert) return wert
  } catch {
    // Kein Speicher (privater Modus): dann gibt es eben keinen Zähler
  }
  const jetzt = new Date().toISOString()
  merkeGesehen(jetzt)
  return jetzt
}

/** Hält fest, bis wohin gelesen wurde. */
export function merkeGesehen(zeitpunkt: string): void {
  try {
    localStorage.setItem(SCHLUESSEL, zeitpunkt)
  } catch {
    // Ohne Speicher bleibt der Zähler bei 0 – besser als eine falsche Zahl
  }
}

/**
 * Zählt Nachrichten, die nach dem letzten Blick geschrieben wurden.
 * Eigene zählen nicht mit – für sie braucht niemand einen Hinweis.
 *
 * Gezählt wird in der Datenbank (head: true holt keine Zeilen), damit für
 * den Zähler nicht der ganze Verlauf über die Leitung geht.
 */
export async function ungeleseneAnzahl(meineId: string): Promise<number> {
  const { count, error } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .gt('created_at', zuletztGesehen())
    .neq('author_id', meineId)

  if (error) throw error
  return count ?? 0
}

/**
 * Zähler für den Chat-Knopf, hält sich selbst aktuell.
 *
 * `anlass` neu zu zählen: Ändert sich der Wert, wird sofort nachgezählt.
 * Gedacht für die angezeigte Ansicht – wer aus dem Chat zurückkommt, soll
 * den Zähler augenblicklich verschwinden sehen und nicht erst beim
 * nächsten Takt.
 */
export function useUngelesen(meineId: string | undefined, anlass?: unknown): number {
  const [anzahl, setAnzahl] = useState(0)

  const zaehlen = useCallback(() => {
    if (!meineId) return
    ungeleseneAnzahl(meineId)
      .then(setAnzahl)
      .catch(() => {
        // Ein fehlgeschlagener Zähler darf die Startseite nicht stören
      })
  }, [meineId])

  useEffect(() => {
    zaehlen()
    return watchMessages(zaehlen)
  }, [zaehlen, anlass])

  return anzahl
}
