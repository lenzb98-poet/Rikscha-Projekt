import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Hält die aktuelle Ansicht im Browserverlauf fest.
 *
 * Ohne das verlässt die Zurück-Geste auf dem Handy die ganze Seite, statt nur
 * die geöffnete Ansicht zu schließen – der Browser landet auf der vorher
 * besuchten Seite und die App muss neu geladen werden.
 *
 * Jede Unteransicht legt einen Verlaufseintrag an. Zurück – ob über die Geste,
 * die Gerätetaste oder den Knopf in der App – nimmt ihn wieder zurück.
 */
export function useAnsicht<T extends string>(start: T) {
  const [ansicht, setAnsicht] = useState<T>(start)

  // Für den Vergleich beim Umschalten, ohne die Funktion neu zu erzeugen
  const aktuell = useRef(ansicht)
  aktuell.current = ansicht

  useEffect(() => {
    // Den Ausgangszustand kennzeichnen, damit er beim Zurückgehen erkannt wird
    if (!(history.state as { rikschaAnsicht?: T } | null)?.rikschaAnsicht) {
      history.replaceState({ ...history.state, rikschaAnsicht: start }, '')
    }

    function beiZurueck(e: PopStateEvent) {
      const ziel = (e.state as { rikschaAnsicht?: T } | null)?.rikschaAnsicht
      setAnsicht(ziel ?? start)
    }

    window.addEventListener('popstate', beiZurueck)
    return () => window.removeEventListener('popstate', beiZurueck)
  }, [start])

  const zeige = useCallback(
    (neu: T) => {
      if (aktuell.current === neu) return

      if (neu === start) {
        // Zurück zum Ausgangszustand: den Eintrag abräumen statt einen neuen
        // anzulegen, sonst stapeln sie sich. popstate setzt die Ansicht.
        history.back()
        return
      }

      history.pushState({ rikschaAnsicht: neu }, '')
      setAnsicht(neu)
    },
    [start],
  )

  return [ansicht, zeige] as const
}
