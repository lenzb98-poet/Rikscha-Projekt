import { useCallback, useEffect, useState } from 'react'
import { supabase, watchMessages } from './supabase'

/**
 * Ungelesene Chatnachrichten.
 *
 * Der Lesestand steht in der Datenbank bei der Person selbst
 * (app_users.chat_gesehen_bis) und gilt damit auf allen Geräten: Wer am
 * Handy liest, sieht die Nachrichten am Rechner nicht mehr als ungelesen.
 *
 * Zeitstempel kommen ausschließlich vom Server. Die Uhr des Geräts spielt
 * keine Rolle, und die Datenbank lässt den Stand ohnehin nur vorwärts und
 * nie in die Zukunft wandern.
 */

/**
 * Hält fest, bis wohin gelesen wurde. Ohne Angabe gilt der Moment des
 * Aufrufs. Gibt den tatsächlich gespeicherten Stand zurück.
 */
export async function chatGesehen(bis?: string): Promise<string> {
  const { data, error } = await supabase.rpc('chat_gesehen', { p_bis: bis ?? null })
  if (error) throw error
  return data as string
}

/** Zahl der ungelesenen Nachrichten; eigene zählen nicht mit. */
export async function ungeleseneAnzahl(): Promise<number> {
  const { data, error } = await supabase.rpc('chat_ungelesen')
  if (error) throw error
  return (data as number) ?? 0
}

/**
 * Zähler für den Chat-Knopf, hält sich selbst aktuell.
 *
 * `anlass` neu zu zählen: Ändert sich der Wert, wird sofort nachgezählt.
 * Gedacht für die angezeigte Ansicht – wer aus dem Chat zurückkommt, soll
 * den Zähler augenblicklich verschwinden sehen und nicht erst beim
 * nächsten Takt.
 */
export function useUngelesen(angemeldet: boolean, anlass?: unknown): number {
  const [anzahl, setAnzahl] = useState(0)

  const zaehlen = useCallback(() => {
    if (!angemeldet) return
    ungeleseneAnzahl()
      .then(setAnzahl)
      .catch(() => {
        // Ein fehlgeschlagener Zähler darf die Startseite nicht stören
      })
  }, [angemeldet])

  useEffect(() => {
    zaehlen()
    return watchMessages(zaehlen)
  }, [zaehlen, anlass])

  return anzahl
}
