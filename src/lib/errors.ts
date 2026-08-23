/** Übersetzt Supabase-Fehlermeldungen in verständliches Deutsch. */
export function toGermanError(error: unknown): string {
  // Achtung: Fehler aus supabase.rpc() sind einfache Objekte mit .message,
  // keine Error-Instanzen. Ohne diesen Zweig landet jede Datenbankmeldung
  // bei "Unbekannter Fehler".
  const message =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message: unknown }).message)
          : 'Unbekannter Fehler'

  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) return 'Das Passwort ist falsch.'
  if (m.includes('email not confirmed')) return 'Das Konto ist noch nicht freigeschaltet. Bitte wende dich an die Koordination.'
  if (m.includes('user already registered')) return 'Für diesen Namen gibt es bereits ein Passwort. Bitte melde dich an.'
  if (m.includes('password should be at least')) return 'Das Passwort ist zu kurz (mindestens 8 Zeichen).'
  if (m.includes('rate limit') || m.includes('too many')) return 'Zu viele Versuche. Bitte warte einen Moment.'
  if (m.includes('failed to fetch') || m.includes('networkerror'))
    return 'Keine Verbindung zum Server. Bitte Internetverbindung prüfen.'
  return message
}
