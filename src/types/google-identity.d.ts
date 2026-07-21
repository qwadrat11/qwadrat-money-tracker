export {}

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initCodeClient(config: GoogleCodeClientConfig): GoogleCodeClient
        }
      }
    }
  }
}

type GoogleCodeClient = {
  requestCode: () => void
}

type GoogleCodeClientConfig = {
  client_id: string
  scope: string
  ux_mode: 'popup' | 'redirect'
  callback?: (response: GoogleCodeResponse) => void
  error_callback?: (error: GoogleCodeClientError) => void
  redirect_uri?: string
  login_hint?: string
  state?: string
  select_account?: boolean
}

type GoogleCodeResponse = {
  code?: string
  scope?: string
  error?: string
  error_description?: string
  error_uri?: string
}

type GoogleCodeClientError = {
  type?: 'popup_closed' | 'popup_failed_to_open' | string
  message?: string
}
