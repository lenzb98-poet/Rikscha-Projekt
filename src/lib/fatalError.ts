/**
 * Bruecke zur Start-Diagnose in index.html. Dort liegt die Fehleranzeige,
 * damit sie auch dann funktioniert, wenn React gar nicht erst startet.
 */

declare global {
  interface Window {
    __rikschaShowError?: (code: string, message?: string, detail?: string | null) => void
    __rikschaAppMounted?: boolean
  }
}

export type FatalCode = 'E-MOUNT' | 'E-RENDER'

export function showFatalError(code: FatalCode, error: unknown, detail?: string) {
  const message = error instanceof Error ? error.message : String(error)
  const stack = error instanceof Error ? error.stack : undefined

  console.error(`[${code}]`, error)

  if (window.__rikschaShowError) {
    window.__rikschaShowError(code, message, detail ?? stack ?? null)
  }
}

export function markAppMounted() {
  window.__rikschaAppMounted = true
}
