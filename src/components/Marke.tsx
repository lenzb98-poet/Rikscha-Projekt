import logo from '../assets/logo.png'

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
