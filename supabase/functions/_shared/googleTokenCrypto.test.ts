import {
  decryptGoogleRefreshToken,
  encryptGoogleRefreshToken,
  type GoogleRefreshTokenCipher,
} from './googleTokenCrypto.ts'

const TEST_SECRET = '1234567890abcdef1234567890abcdef'
const OTHER_SECRET = 'fedcba0987654321fedcba0987654321'

Deno.test('encrypt -> decrypt restores the same refresh token', async () => {
  const cipher = await encryptGoogleRefreshToken('refresh-token-value', TEST_SECRET)
  const decrypted = await decryptGoogleRefreshToken(cipher, TEST_SECRET)
  if (decrypted !== 'refresh-token-value') {
    throw new Error('Decrypted token does not match the original value')
  }
})

Deno.test('same token is encrypted differently because IV is random', async () => {
  const first = await encryptGoogleRefreshToken('refresh-token-value', TEST_SECRET)
  const second = await encryptGoogleRefreshToken('refresh-token-value', TEST_SECRET)

  if (first.tokenIv === second.tokenIv && first.encryptedRefreshToken === second.encryptedRefreshToken) {
    throw new Error('Expected different ciphertext or IV for repeated encryption')
  }
})

Deno.test('wrong key does not decrypt token', async () => {
  const cipher = await encryptGoogleRefreshToken('refresh-token-value', TEST_SECRET)
  let failed = false

  try {
    await decryptGoogleRefreshToken(cipher, OTHER_SECRET)
  } catch {
    failed = true
  }

  if (!failed) {
    throw new Error('Expected decryption with a wrong key to fail')
  }
})

Deno.test('corrupted ciphertext throws an error', async () => {
  const cipher = await encryptGoogleRefreshToken('refresh-token-value', TEST_SECRET)
  const corrupted: GoogleRefreshTokenCipher = {
    ...cipher,
    encryptedRefreshToken: `${cipher.encryptedRefreshToken.slice(0, -4)}AAAA`,
  }

  let failed = false

  try {
    await decryptGoogleRefreshToken(corrupted, TEST_SECRET)
  } catch {
    failed = true
  }

  if (!failed) {
    throw new Error('Expected corrupted ciphertext to fail decryption')
  }
})

