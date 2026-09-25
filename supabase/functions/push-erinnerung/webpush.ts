// Web Push ohne Fremdbibliothek - nur mit WebCrypto, läuft in Deno und Node.
//
// Zwei Standards:
// - RFC 8291 (aes128gcm): der Inhalt wird für genau ein Gerät verschlüsselt,
//   mit dessen öffentlichem Schlüssel (p256dh) und Geheimnis (auth).
// - RFC 8292 (VAPID): der Absender weist sich beim Push-Dienst mit einem
//   signierten Token aus.

const enc = new TextEncoder()

export function b64urlZuBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  const bin = atob(b64)
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

export function bytesZuB64url(b: Uint8Array): string {
  let bin = ''
  for (const x of b) bin += String.fromCharCode(x)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function verbinden(...teile: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(teile.reduce((n, t) => n + t.length, 0))
  let pos = 0
  for (const t of teile) {
    out.set(t, pos)
    pos += t.length
  }
  return out
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, laenge: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, laenge * 8)
  return new Uint8Array(bits)
}

/** Verschlüsselt den Inhalt für ein Gerät (RFC 8291, ein einziger Datensatz). */
export async function verschluesseln(
  inhalt: Uint8Array,
  p256dh: string,
  auth: string,
): Promise<Uint8Array> {
  const uaPublic = b64urlZuBytes(p256dh)
  const authSecret = b64urlZuBytes(auth)

  const eigen = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', eigen.publicKey))
  const geraet = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: geraet }, eigen.privateKey, 256))

  const keyInfo = verbinden(enc.encode('WebPush: info\0'), uaPublic, asPublic)
  const ikm = await hkdf(authSecret, ecdh, keyInfo, 32)
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)

  // Inhalt plus Trennzeichen 0x02 für den letzten (und einzigen) Datensatz
  const klartext = verbinden(inhalt, new Uint8Array([2]))
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const geheim = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, klartext))

  const rs = new Uint8Array(4)
  new DataView(rs.buffer).setUint32(0, 4096)
  return verbinden(salt, rs, new Uint8Array([asPublic.length]), asPublic, geheim)
}

/** Signiertes VAPID-Token für den Push-Dienst des Endpunkts (RFC 8292). */
export async function vapidKopf(
  endpunkt: string,
  privatJwk: JsonWebKey,
  oeffentlich: string,
  kontakt: string,
): Promise<string> {
  const kopf = bytesZuB64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const angaben = bytesZuB64url(
    enc.encode(
      JSON.stringify({
        aud: new URL(endpunkt).origin,
        exp: Math.floor(Date.now() / 1000) + 12 * 3600,
        sub: kontakt,
      }),
    ),
  )
  const schluessel = await crypto.subtle.importKey('jwk', privatJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const unterschrift = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, schluessel, enc.encode(`${kopf}.${angaben}`)),
  )
  return `vapid t=${kopf}.${angaben}.${bytesZuB64url(unterschrift)}, k=${oeffentlich}`
}

export type Abo = { endpoint: string; p256dh: string; auth: string }
export type Vapid = { privat: JsonWebKey; oeffentlich: string; kontakt: string }

/** Schickt eine Nachricht; liefert den HTTP-Status des Push-Dienstes. */
export async function senden(abo: Abo, nachricht: unknown, vapid: Vapid): Promise<number> {
  const inhalt = await verschluesseln(enc.encode(JSON.stringify(nachricht)), abo.p256dh, abo.auth)
  const antwort = await fetch(abo.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidKopf(abo.endpoint, vapid.privat, vapid.oeffentlich, vapid.kontakt),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(24 * 3600),
      Urgency: 'high',
    },
    body: inhalt,
  })
  await antwort.body?.cancel()
  return antwort.status
}
