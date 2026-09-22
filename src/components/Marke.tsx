import radeln from '../assets/radeln-ohne-alter.png'
import { useVereinslogo } from '../lib/erscheinungsbild'

/**
 * Logo der Organisation, in den Admin Einstellungen hochgeladen. Ohne eigenes
 * Logo bleibt der Platz leer. Steht auf der Akzentfarbe, daher helle Logos.
 */
export function Logo({ className }: { className?: string }) {
  const eigenes = useVereinslogo()
  if (!eigenes) return null
  return <img src={eigenes} className={className} alt="Logo der Organisation" />
}

/** Logo des Projekts „Radeln ohne Alter“, für alle Standorte gleich. */
export function RadelnLogo({ className }: { className?: string }) {
  return <img src={radeln} className={className} alt="Radeln ohne Alter" />
}
