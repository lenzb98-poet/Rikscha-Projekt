// Push-Erinnerungen: "Wie war die Fahrt? Bitte Angaben eintragen."
//
// Zwei Wege hierher:
// - Der Zeitplan in der Datenbank (pg_cron) ruft jede Minute auf, sobald
//   etwas fällig ist, mit dem Geheimnis im Kopf x-geheimnis. Dann holt die
//   Funktion die fälligen Erinnerungen (push_faellige) und verschickt sie.
// - Die App ruft mit { test: true } und der Anmeldung der Person auf. Dann
//   geht eine Probenachricht an alle Geräte dieser Person.
//
// Die Schlüssel liegen im Vault der Datenbank, nicht im Code.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { bytesZuB64url, senden, type Abo } from './webpush.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (daten: unknown, status = 200) =>
  new Response(JSON.stringify(daten), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
})

type Konfig = { vapid_privat: string; vapid_oeffentlich: string; geheimnis: string; kontakt: string }
type Faellig = Abo & { abo_id: string; titel: string; nachricht: string; link: string }

async function konfig(): Promise<Konfig> {
  const { data, error } = await admin.rpc('push_konfig')
  if (error) throw error
  return (Array.isArray(data) ? data[0] : data) as Konfig
}

/** Erzeugt beim ersten Mal das VAPID-Schlüsselpaar und legt es im Vault ab. */
async function schluesselSicherstellen(k: Konfig): Promise<Konfig> {
  if (k.vapid_privat && k.vapid_oeffentlich) return k
  const paar = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const privat = await crypto.subtle.exportKey('jwk', paar.privateKey)
  const oeffentlich = bytesZuB64url(new Uint8Array(await crypto.subtle.exportKey('raw', paar.publicKey)))
  const { error } = await admin.rpc('push_schluessel_anlegen', { p_privat: JSON.stringify(privat), p_oeffentlich: oeffentlich })
  if (error) throw error
  return await konfig()
}

/** Verschickt und räumt Abos ab, die der Push-Dienst nicht mehr kennt. */
async function verschicken(liste: Faellig[], k: Konfig) {
  const vapid = { privat: JSON.parse(k.vapid_privat), oeffentlich: k.vapid_oeffentlich, kontakt: k.kontakt }
  let ok = 0
  for (const f of liste) {
    try {
      const status = await senden(f, { titel: f.titel, text: f.nachricht, url: f.link }, vapid)
      if (status === 404 || status === 410) await admin.rpc('push_abo_verfallen', { p_id: f.abo_id })
      else if (status < 300) ok++
      else console.warn('Push abgelehnt', status, new URL(f.endpoint).host)
    } catch (e) {
      console.warn('Push fehlgeschlagen', String(e))
    }
  }
  return ok
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const k = await schluesselSicherstellen(await konfig())

    // Zeitplan: alles Fällige verschicken
    if (req.headers.get('x-geheimnis')) {
      if (!k.geheimnis || req.headers.get('x-geheimnis') !== k.geheimnis) return json({ fehler: 'nicht erlaubt' }, 401)
      const { data, error } = await admin.rpc('push_faellige')
      if (error) throw error
      const liste = (data ?? []) as Faellig[]
      const ok = await verschicken(liste, k)
      return json({ faellig: liste.length, gesendet: ok })
    }

    // Probenachricht an die eigenen Geräte
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '')
    const { data: nutzer } = await admin.auth.getUser(token)
    if (!nutzer?.user) return json({ fehler: 'Bitte zuerst anmelden.' }, 401)
    const { data, error } = await admin.rpc('push_test_ziele', { p_auth_user_id: nutzer.user.id })
    if (error) throw error
    const liste = (data ?? []) as Faellig[]
    if (liste.length === 0) return json({ fehler: 'Auf diesem Konto sind noch keine Erinnerungen eingeschaltet.' }, 400)
    const ok = await verschicken(liste, k)
    return json({ gesendet: ok, geraete: liste.length })
  } catch (e) {
    console.error(e)
    return json({ fehler: 'Interner Fehler beim Senden.' }, 500)
  }
})
