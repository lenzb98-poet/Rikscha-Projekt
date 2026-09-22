import logo from '../assets/logo.png'
import moewe from '../assets/moewe.png'
import radeln from '../assets/radeln-ohne-alter.png'
import { useVereinslogo } from '../lib/vereinslogo'

/**
 * Logo der Organisation: das in den Admin Einstellungen hochgeladene, sonst
 * die Wortmarke des Vereins. Steht auf blauem Grund, daher helle Logos.
 */
export function Logo({ className }: { className?: string }) {
  const eigenes = useVereinslogo()

  // Solange unklar ist, ob es ein eigenes gibt, nichts zeigen - sonst blitzt
  // beim ersten Öffnen kurz das falsche auf.
  if (eigenes === undefined) {
    return <span className={className} aria-hidden="true" />
  }

  if (eigenes) {
    return <img src={eigenes} className={className} alt="Logo der Organisation" />
  }

  return (
    <img
      src={logo}
      className={className}
      alt="Hospiz-Initiative Melle e.V. – Ambulanter Hospizdienst"
    />
  )
}

/** Möwe aus dem Auftritt des Vereins. Rein schmückend, daher ohne Alternativtext. */
export function Moewe({ className }: { className?: string }) {
  return <img src={moewe} className={className} alt="" aria-hidden="true" />
}

/** Logo der Aktion „Radeln ohne Alter“, Standort Melle. */
export function RadelnLogo({ className }: { className?: string }) {
  return <img src={radeln} className={className} alt="Radeln ohne Alter – Melle" />
}
