/** Übersetzt Supabase-Fehlermeldungen in verständliches Deutsch. */
export function toGermanError(error: unknown): string {
  const message =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : 'Unbekannter Fehler'

  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) return 'E-Mail oder Passwort ist falsch.'
  if (m.includes('email not confirmed')) return 'Bitte bestätige zuerst die E-Mail aus deinem Postfach.'
  if (m.includes('user already registered')) return 'Für diese E-Mail gibt es bereits ein Passwort. Bitte melde dich an.'
  if (m.includes('password should be at least')) return 'Das Passwort ist zu kurz (mindestens 8 Zeichen).'
  if (m.includes('rate limit') || m.includes('too many')) return 'Zu viele Versuche. Bitte warte einen Moment.'
  if (m.includes('failed to fetch') || m.includes('networkerror'))
    return 'Keine Verbindung zum Server. Bitte Internetverbindung prüfen.'
  return message
}
