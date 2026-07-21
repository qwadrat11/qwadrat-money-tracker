const DEFAULT_ALLOWED_HEADERS = 'authorization, x-client-info, apikey, content-type'
const DEFAULT_ALLOWED_METHODS = 'POST, OPTIONS'

function parseAllowedOrigins() {
  const raw = Deno.env.get('ALLOWED_ORIGINS') ?? ''
  return raw
    .split(/[,;]+/)
    .map((origin) => origin.trim())
    .filter(Boolean)
}

export function isAllowedOrigin(origin: string | null | undefined) {
  if (!origin) return false
  const allowedOrigins = parseAllowedOrigins()

  // ALLOWED_ORIGINS is an optional deployment hardening setting. An empty
  // allowlist must not make every browser invocation fail at the preflight
  // stage; the functions still require and verify the caller's JWT.
  return allowedOrigins.length === 0 || allowedOrigins.includes(origin)
}

export function createCorsHeaders(request: Request) {
  const origin = request.headers.get('origin')
  const headers = new Headers()

  if (isAllowedOrigin(origin)) {
    headers.set('Access-Control-Allow-Origin', origin!)
    headers.set('Access-Control-Allow-Credentials', 'true')
    headers.set('Vary', 'Origin')
  }

  headers.set('Access-Control-Allow-Headers', DEFAULT_ALLOWED_HEADERS)
  headers.set('Access-Control-Allow-Methods', DEFAULT_ALLOWED_METHODS)
  headers.set('Access-Control-Max-Age', '86400')

  return headers
}

export function handleCorsPreflight(request: Request) {
  const origin = request.headers.get('origin')
  if (origin && !isAllowedOrigin(origin)) {
    return new Response('Origin not allowed', { status: 403 })
  }

  return new Response(null, {
    status: 204,
    headers: createCorsHeaders(request),
  })
}
