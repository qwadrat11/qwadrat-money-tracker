const TOKEN_ENCODER = new TextEncoder()
const TOKEN_DECODER = new TextDecoder()
const AES_GCM_IV_BYTES = 12
const AES_GCM_KEY_BYTES = 32

export type GoogleRefreshTokenCipher = {
  encryptedRefreshToken: string
  tokenIv: string
  tokenAuthTag: string | null
}

function toBase64(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(base64: string) {
  const normalized = base64.trim()
  if (!normalized) return new Uint8Array()
  const padded = normalized.replace(/-/g, '+').replace(/_/g, '/')
  const remainder = padded.length % 4
  const safe = remainder === 0 ? padded : `${padded}${'='.repeat(4 - remainder)}`
  const binary = atob(safe)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function fromHex(hex: string) {
  if (hex.length % 2 !== 0) {
    throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY_INVALID')
  }
  const bytes = new Uint8Array(hex.length / 2)
  for (let index = 0; index < hex.length; index += 2) {
    bytes[index / 2] = Number.parseInt(hex.slice(index, index + 2), 16)
  }
  return bytes
}

function looksLikeHex(value: string) {
  return /^[0-9a-fA-F]+$/.test(value) && value.length === AES_GCM_KEY_BYTES * 2
}

function looksLikeBase64(value: string) {
  return value.length >= 43 && /^[A-Za-z0-9+/=_-]+$/.test(value)
}

function normalizeSecretKey(secret: string) {
  const trimmed = secret.trim()
  if (!trimmed) {
    throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY_MISSING')
  }

  let bytes: Uint8Array
  if (looksLikeHex(trimmed)) {
    bytes = fromHex(trimmed)
  } else if (looksLikeBase64(trimmed)) {
    try {
      bytes = fromBase64(trimmed)
    } catch {
      throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY_INVALID')
    }
  } else {
    bytes = TOKEN_ENCODER.encode(trimmed)
  }

  if (bytes.length !== AES_GCM_KEY_BYTES) {
    throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY_INVALID')
  }

  return bytes
}

async function importAesKey(secret: string) {
  const rawKey = normalizeSecretKey(secret)
  const keyData = rawKey.buffer.slice(rawKey.byteOffset, rawKey.byteOffset + rawKey.byteLength) as ArrayBuffer
  return crypto.subtle.importKey('raw', keyData, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function encryptGoogleRefreshToken(refreshToken: string, secret = Deno.env.get('GOOGLE_TOKEN_ENCRYPTION_KEY') ?? ''): Promise<GoogleRefreshTokenCipher> {
  const key = await importAesKey(secret)
  const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, TOKEN_ENCODER.encode(refreshToken))

  return {
    // Web Crypto AES-GCM returns ciphertext with the auth tag appended.
    // We keep tokenAuthTag nullable and do not fake a split payload.
    encryptedRefreshToken: toBase64(new Uint8Array(ciphertext)),
    tokenIv: toBase64(iv),
    tokenAuthTag: null,
  }
}

export async function decryptGoogleRefreshToken(
  cipher: GoogleRefreshTokenCipher,
  secret = Deno.env.get('GOOGLE_TOKEN_ENCRYPTION_KEY') ?? '',
): Promise<string> {
  const key = await importAesKey(secret)
  const iv = fromBase64(cipher.tokenIv)

  if (iv.length !== AES_GCM_IV_BYTES) {
    throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY_INVALID')
  }

  const encrypted = fromBase64(cipher.encryptedRefreshToken)
  try {
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, encrypted)
    return TOKEN_DECODER.decode(plaintext)
  } catch {
    throw new Error('GOOGLE_TOKEN_DECRYPTION_FAILED')
  }
}
