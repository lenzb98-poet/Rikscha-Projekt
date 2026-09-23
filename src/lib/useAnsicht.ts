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
 * Ist die gewünschte Ansicht schon einmal auf dem Weg hierher geöffnet worden
 * (Admin Einstellungen → Betreiber Einstellungen → zurück zu den Admin
 * Einstellungen), geht es im Verlauf dorthin zurück, statt einen neuen
 * Eintrag anzulegen. Sonst läge die verlassene Ansicht noch im Verlauf, und
 * das nächste Zurück führte wieder in sie hinein.
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
  /** Die geöffneten Ansichten über dem Ausgangszustand, in Verlaufsreihenfolge. */
  const stapel = useRef<T[]>([])

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
        stapel.current = []
        setAnsicht(start)
        return
      }

      // Alles oberhalb des Ziels ist verlassen; ein Vorwärts legt es neu oben auf
      const stelle = stapel.current.lastIndexOf(ziel)
      if (ziel === start) stapel.current = []
      else if (stelle >= 0) stapel.current = stapel.current.slice(0, stelle + 1)
      else stapel.current = [...stapel.current, ziel]
      setAnsicht(ziel)
    }

    window.addEventListener('popstate', beiZurueck)
    return () => window.removeEventListener('popstate', beiZurueck)
  }, [start])

  const zeige = useCallback(
    (neu: T) => {
      if (aktuell.current === neu) return

      // Liegt das Ziel schon im Verlauf, dorthin zurückgehen statt einen
      // neuen Eintrag anzulegen - sonst stapeln sie sich. popstate setzt dann
      // die Ansicht und kürzt den Stapel.
      const stelle = neu === start ? -1 : stapel.current.indexOf(neu)
      if (neu === start || stelle >= 0) {
        const schritte = stapel.current.length - 1 - stelle
        if (schritte > 0) {
          history.go(-schritte)
          return
        }
      }

      history.pushState({ rikschaAnsicht: neu }, '')
      stapel.current = [...stapel.current, neu]
      setAnsicht(neu)
    },
    [start],
  )

  return [ansicht, zeige] as const
}
