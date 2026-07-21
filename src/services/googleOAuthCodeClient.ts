import { Capacitor } from "@capacitor/core";
import type { GoogleSheetsErrorCode } from "../types";

const GOOGLE_GIS_SCRIPT_ID = "google-gis-client-script";
const GOOGLE_GIS_SCRIPT_SRC = "https://accounts.google.com/gsi/client";
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? "";
const GOOGLE_SHEETS_SCOPE =
  "openid email profile https://www.googleapis.com/auth/spreadsheets";

let scriptLoadPromise: Promise<void> | null = null;

export class GoogleOAuthCodeError extends Error {
  override name = "GoogleOAuthCodeError";
  code: GoogleSheetsErrorCode;

  constructor(code: GoogleSheetsErrorCode, message: string, cause?: unknown) {
    super(message);
    this.code = code;
    this.cause = cause;
  }
}

export type RequestGoogleSheetsAuthorizationCodeOptions = {
  loginHint?: string | null;
};

function isCodeClientAvailable() {
  return Boolean(window.google?.accounts?.oauth2?.initCodeClient);
}

function readablePopupError(errorType?: string) {
  switch (errorType) {
    case "popup_closed":
      return new GoogleOAuthCodeError(
        "GOOGLE_OAUTH_POPUP_CLOSED",
        "Окно подключения Google Sheets было закрыто"
      );
    case "popup_failed_to_open":
      return new GoogleOAuthCodeError(
        "GOOGLE_OAUTH_POPUP_FAILED_TO_OPEN",
        "Не удалось открыть окно Google. Откройте qwadrat Finance Tracker в браузере и попробуйте снова"
      );
    case "access_denied":
      return new GoogleOAuthCodeError(
        "GOOGLE_OAUTH_ACCESS_DENIED",
        "Доступ к Google Sheets был отменен"
      );
    default:
      return new GoogleOAuthCodeError(
        "GOOGLE_OAUTH_SCRIPT_FAILED",
        "Не удалось запустить вход через Google"
      );
  }
}

function ensureGoogleClientId() {
  if (!GOOGLE_CLIENT_ID) {
    throw new GoogleOAuthCodeError(
      "GOOGLE_CLIENT_ID_MISSING",
      "Добавьте VITE_GOOGLE_CLIENT_ID в .env.local"
    );
  }
}

async function loadGoogleIdentityScript() {
  if (typeof window === "undefined") {
    throw new GoogleOAuthCodeError(
      "GOOGLE_OAUTH_SCRIPT_FAILED",
      "Google OAuth доступен только в браузере"
    );
  }

  ensureGoogleClientId();

  if (isCodeClientAvailable()) return;
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.getElementById(
      GOOGLE_GIS_SCRIPT_ID
    ) as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener(
        "error",
        () =>
          reject(
            new GoogleOAuthCodeError(
              "GOOGLE_OAUTH_SCRIPT_FAILED",
              "Не удалось загрузить Google OAuth"
            )
          ),
        { once: true }
      );
      return;
    }

    const script = document.createElement("script");
    script.id = GOOGLE_GIS_SCRIPT_ID;
    script.src = GOOGLE_GIS_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(
        new GoogleOAuthCodeError(
          "GOOGLE_OAUTH_SCRIPT_FAILED",
          "Не удалось загрузить Google OAuth"
        )
      );
    document.head.appendChild(script);
  });

  try {
    await scriptLoadPromise;
  } finally {
    scriptLoadPromise = null;
  }

  if (!isCodeClientAvailable()) {
    throw new GoogleOAuthCodeError(
      "GOOGLE_OAUTH_SCRIPT_FAILED",
      "Google OAuth библиотека не инициализировалась"
    );
  }
}

export async function requestGoogleSheetsAuthorizationCode(
  options: RequestGoogleSheetsAuthorizationCodeOptions = {}
): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    // Pop-up based GIS flow can be fragile inside WebViews; keep the error explicit.
    // The app may still work when opened in a browser/PWA.
  }

  await loadGoogleIdentityScript();

  return await new Promise<string>((resolve, reject) => {
    const client = window.google?.accounts?.oauth2?.initCodeClient;
    if (!client) {
      reject(
        new GoogleOAuthCodeError(
          "GOOGLE_OAUTH_SCRIPT_FAILED",
          "Google OAuth библиотека не доступна"
        )
      );
      return;
    }

    const codeClient = client({
      client_id: GOOGLE_CLIENT_ID,
      scope: GOOGLE_SHEETS_SCOPE,
      ux_mode: "popup",
      login_hint: options.loginHint?.trim() || undefined,
      callback: (response) => {
        if (response.error) {
          reject(readablePopupError(response.error));
          return;
        }

        if (!response.code) {
          reject(
            new GoogleOAuthCodeError(
              "GOOGLE_OAUTH_SCRIPT_FAILED",
              "Google не вернул authorization code"
            )
          );
          return;
        }

        resolve(response.code);
      },
      error_callback: (error) => {
        reject(readablePopupError(error.type ?? error.message));
      },
    });

    try {
      codeClient.requestCode();
    } catch (error) {
      reject(
        new GoogleOAuthCodeError(
          "GOOGLE_OAUTH_SCRIPT_FAILED",
          "Не удалось открыть окно Google",
          error
        )
      );
    }
  });
}
