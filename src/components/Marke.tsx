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

/** Logo der Aktion „Radeln ohne Alter“, Standort Melle. */
export function RadelnLogo({ className }: { className?: string }) {
  return <img src={radeln} className={className} alt="Radeln ohne Alter – Melle" />
}
