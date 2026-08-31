import { useCallback, useEffect, useRef, useState } from 'react'

/** Läuft die Seite als App vom Startbildschirm? */
function laeuftAlsApp(): boolean {
  const alsApp = window.matchMedia?.('(display-mode: standalone)').matches
  // Safari auf dem iPhone nutzt eine eigene Kennzeichnung
  const iosApp = (navigator as { standalone?: boolean }).standalone === true
  return Boolean(alsApp || iosApp)
}

type Zustand<T> = { rikschaAnsicht?: T; wache?: boolean }

/**
 * Hält die aktuelle Ansicht im Browserverlauf fest.
 *
 * Ohne das verlässt die Zurück-Geste auf dem Handy die ganze Seite, statt nur
 * die geöffnete Ansicht zu schließen – der Browser landet auf der vorher
 * besuchten Seite und die App muss neu geladen werden.
 *
 * Jede Unteransicht legt einen Verlaufseintrag an. Zurück – ob über die Geste,
 * die Gerätetaste oder den Knopf in der App – nimmt ihn wieder zurück.
 *
 * Als App vom Startbildschirm kommt ein Wächter-Eintrag dazu: Dort gibt es
 * keine vorher besuchte Seite, ein Zurück von der Startseite führte deshalb ins
 * Leere und zeigte eine weiße Fläche. Der Wächter fängt das ab, indem er sich
 * selbst wiederherstellt. Im Browser bleibt es beim gewohnten Verhalten – dort
 * soll ein Zurück die Seite verlassen können.
 */
export function useAnsicht<T extends string>(start: T) {
  const [ansicht, setAnsicht] = useState<T>(start)

  // Für den Vergleich beim Umschalten, ohne die Funktion neu zu erzeugen
  const aktuell = useRef(ansicht)
  aktuell.current = ansicht

  useEffect(() => {
    const alsApp = laeuftAlsApp()

    // Den Ausgangszustand kennzeichnen, damit er beim Zurückgehen erkannt wird
    if (!(history.state as Zustand<T> | null)?.rikschaAnsicht) {
      history.replaceState({ ...history.state, rikschaAnsicht: start }, '')
    }

    // Wächter anlegen, auf dem die App dann steht
    if (alsApp && !(history.state as Zustand<T> | null)?.wache) {
      history.pushState({ rikschaAnsicht: start, wache: true }, '')
    }

    function beiZurueck(e: PopStateEvent) {
      const zustand = e.state as Zustand<T> | null
      const ziel = zustand?.rikschaAnsicht ?? start

      // Unter den Wächter gerutscht? Dann wollte jemand die App verlassen –
      // in der installierten App gibt es dahinter nichts, also zurückholen.
      if (alsApp && ziel === start && !zustand?.wache) {
        history.pushState({ rikschaAnsicht: start, wache: true }, '')
        setAnsicht(start)
        return
      }

      setAnsicht(ziel)
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
