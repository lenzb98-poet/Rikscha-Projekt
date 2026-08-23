import logo from '../assets/logo.png'
import moewe from '../assets/moewe.png'

/** Wortmarke des Vereins. Weiß, daher nur auf blauem Grund einsetzen. */
export function Logo({ className }: { className?: string }) {
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
