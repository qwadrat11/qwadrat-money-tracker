type SupabaseAuthErrorLike = {
  message?: string
  code?: string | null
  status?: number | null
  name?: string | null
  details?: string | null
  hint?: string | null
}

export class AuthRequestError extends Error {
  override name = 'AuthRequestError'
  code?: string | null
  status?: number | null
  authName?: string | null
  details?: string | null
  hint?: string | null

  constructor(error: SupabaseAuthErrorLike, message: string) {
    super(message)
    this.code = error.code ?? null
    this.status = error.status ?? null
    this.authName = error.name ?? null
    this.details = error.details ?? null
    this.hint = error.hint ?? null
    this.cause = error
  }
}
