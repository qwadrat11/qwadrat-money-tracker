import { createCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { createErrorPayload, logServerError } from "../_shared/errors.ts";
import { requireAuthenticatedUser } from "../_shared/auth.ts";
import { getSupabaseAdminClient } from "../_shared/supabaseAdmin.ts";
import { encryptGoogleRefreshToken } from "../_shared/googleTokenCrypto.ts";
import {
  assertFinanceTrackerEmailMatchesGoogle,
  assertSameGoogleAccount,
  buildInitialFormattingRequests,
  buildSafeConnectSuccess,
  buildSpreadsheetTemplate,
  chooseStoredRefreshToken,
  hasRequiredScopes,
  parseConnectRequestBody,
  type ExistingGoogleSheetsConnection,
  type GoogleIdentityClaims,
  type GoogleTokenExchangeResponse,
} from "./logic.ts";

type ExistingConnectionRow = ExistingGoogleSheetsConnection;

function jsonResponse(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...Object.fromEntries(createCorsHeaders(request)),
      "Content-Type": "application/json",
    },
  });
}

function getRequiredClientId() {
  const value = Deno.env.get("GOOGLE_CLIENT_ID")?.trim();
  if (!value) {
    throw createErrorPayload(
      "GOOGLE_CLIENT_ID_MISSING",
      "Google Client ID is not configured"
    );
  }
  return value;
}

function getRequiredClientSecret() {
  const value = Deno.env.get("GOOGLE_CLIENT_SECRET")?.trim();
  if (!value) {
    throw createErrorPayload(
      "GOOGLE_OAUTH_NOT_CONFIGURED",
      "Google Client Secret is not configured"
    );
  }
  return value;
}

function getRedirectUri(request: Request) {
  return (
    Deno.env.get("GOOGLE_REDIRECT_URI")?.trim() ||
    request.headers.get("origin")?.trim() ||
    ""
  );
}

async function fetchJson<T>(
  url: string,
  init: RequestInit,
  timeoutMs = 25_000
): Promise<{ ok: boolean; status: number; data: T | null; text: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), timeoutMs);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let data: T | null = null;
    if (text) {
      try {
        data = JSON.parse(text) as T;
      } catch {
        data = null;
      }
    }
    return { ok: response.ok, status: response.status, data, text };
  } finally {
    clearTimeout(timeout);
  }
}

async function exchangeAuthorizationCode(params: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}) {
  const body = new URLSearchParams({
    code: params.code,
    client_id: params.clientId,
    client_secret: params.clientSecret,
    grant_type: "authorization_code",
    redirect_uri: params.redirectUri,
  });

  const response = await fetchJson<GoogleTokenExchangeResponse>(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    }
  );

  if (!response.ok || !response.data?.access_token) {
    throw createErrorPayload(
      "GOOGLE_CODE_EXCHANGE_FAILED",
      "Не удалось обменять authorization code на токены Google"
    );
  }

  return response.data;
}

async function verifyGoogleIdentity(
  tokenResponse: GoogleTokenExchangeResponse,
  clientId: string
): Promise<GoogleIdentityClaims> {
  if (tokenResponse.id_token) {
    const tokenInfoResponse = await fetchJson<Record<string, string>>(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(
        tokenResponse.id_token
      )}`,
      { method: "GET" }
    );

    if (
      !tokenInfoResponse.ok ||
      !tokenInfoResponse.data?.sub ||
      !tokenInfoResponse.data?.email
    ) {
      throw createErrorPayload(
        "GOOGLE_IDENTITY_VERIFICATION_FAILED",
        "Не удалось проверить Google-аккаунт"
      );
    }

    const claims = tokenInfoResponse.data;
    const aud = claims.aud ?? "";
    const iss = claims.iss ?? "";
    const exp = Number(claims.exp ?? "0");
    const emailVerified =
      String(claims.email_verified ?? "").toLowerCase() === "true";

    if (
      aud !== clientId ||
      !iss.includes("accounts.google.com") ||
      !emailVerified
    ) {
      throw createErrorPayload(
        emailVerified
          ? "GOOGLE_IDENTITY_VERIFICATION_FAILED"
          : "GOOGLE_EMAIL_NOT_VERIFIED",
        emailVerified
          ? "Не удалось проверить Google-аккаунт"
          : "Подтвердите email в Google перед подключением Google Sheets"
      );
    }

    if (!Number.isFinite(exp) || exp * 1000 <= Date.now()) {
      throw createErrorPayload(
        "GOOGLE_IDENTITY_VERIFICATION_FAILED",
        "Google identity token истек"
      );
    }

    return {
      sub: claims.sub,
      email: claims.email,
      email_verified: emailVerified,
      aud,
      iss,
      exp,
    };
  }

  const userInfoResponse = await fetchJson<Record<string, string>>(
    "https://openidconnect.googleapis.com/v1/userinfo",
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${tokenResponse.access_token}`,
      },
    }
  );

  if (
    !userInfoResponse.ok ||
    !userInfoResponse.data?.sub ||
    !userInfoResponse.data?.email
  ) {
    throw createErrorPayload(
      "GOOGLE_IDENTITY_VERIFICATION_FAILED",
      "Не удалось проверить Google-аккаунт"
    );
  }

  const emailVerified =
    String(userInfoResponse.data.email_verified ?? "").toLowerCase() === "true";
  if (!emailVerified) {
    throw createErrorPayload(
      "GOOGLE_EMAIL_NOT_VERIFIED",
      "Подтвердите email в Google перед подключением Google Sheets"
    );
  }

  return {
    sub: userInfoResponse.data.sub,
    email: userInfoResponse.data.email,
    email_verified: true,
  };
}

async function getTrustedFinanceTrackerEmail(
  admin: ReturnType<typeof getSupabaseAdminClient>,
  userId: string,
  fallbackEmail: string | null
) {
  const { data: profile, error } = await admin
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    throw error;
  }

  const profileEmail =
    typeof profile?.email === "string" && profile.email.trim()
      ? profile.email.trim()
      : "";
  return profileEmail || (fallbackEmail?.trim() ?? "");
}

async function getExistingConnection(
  admin: ReturnType<typeof getSupabaseAdminClient>,
  userId: string
) {
  const { data, error } = await admin
    .from("google_sheets_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data as ExistingConnectionRow | null;
}

async function checkSpreadsheetAccess(
  accessToken: string,
  spreadsheetId: string
) {
  const response = await fetchJson<{
    spreadsheetId?: string;
    spreadsheetUrl?: string;
  }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}?fields=spreadsheetId,spreadsheetUrl`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (response.ok && response.data?.spreadsheetId) {
    return {
      exists: true as const,
      spreadsheetUrl: response.data.spreadsheetUrl ?? null,
    };
  }

  if (response.status === 404) {
    return { exists: false as const, reason: "not_found" as const };
  }

  if (response.status === 403) {
    throw createErrorPayload(
      "GOOGLE_SPREADSHEET_ACCESS_DENIED",
      "Нет доступа к уже созданной таблице"
    );
  }

  throw createErrorPayload(
    "GOOGLE_SPREADSHEET_CHECK_FAILED",
    "Не удалось проверить существующую таблицу Google Sheets"
  );
}

async function createSpreadsheet(accessToken: string) {
  const template = buildSpreadsheetTemplate();
  const response = await fetchJson<{
    spreadsheetId?: string;
    spreadsheetUrl?: string;
    sheets?: Array<{ properties?: { sheetId?: number; title?: string } }>;
  }>("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(template),
  });

  if (!response.ok || !response.data?.spreadsheetId) {
    throw createErrorPayload(
      "GOOGLE_SPREADSHEET_CREATE_FAILED",
      "Не удалось создать таблицу Google Sheets"
    );
  }

  const spreadsheetId = response.data.spreadsheetId;
  const spreadsheetUrl =
    response.data.spreadsheetUrl ??
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
  const sheetIdByTitle = Object.fromEntries(
    (response.data.sheets ?? [])
      .filter(
        (sheet) =>
          typeof sheet.properties?.sheetId === "number" &&
          typeof sheet.properties?.title === "string"
      )
      .map((sheet) => [sheet.properties!.title!, sheet.properties!.sheetId!])
  );

  if (Object.keys(sheetIdByTitle).length > 0) {
    const formatting = buildInitialFormattingRequests(sheetIdByTitle);
    await fetchJson(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}:batchUpdate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formatting),
      }
    );
  }

  return { spreadsheetId, spreadsheetUrl };
}

function toSafeConnectionRow(
  connection: ExistingConnectionRow | null,
  fallback: {
    googleEmail: string;
    spreadsheetUrl: string;
    createdNewSpreadsheet: boolean;
  }
) {
  return buildSafeConnectSuccess({
    googleEmail: connection?.google_email ?? fallback.googleEmail,
    spreadsheetUrl: connection?.spreadsheet_url ?? fallback.spreadsheetUrl,
    connectionStatus: "connected",
    syncStatus: "idle",
    createdNewSpreadsheet: fallback.createdNewSpreadsheet,
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return handleCorsPreflight(request);
  if (request.method !== "POST") {
    return jsonResponse(
      request,
      createErrorPayload("INVALID_REQUEST", "Method not allowed"),
      405
    );
  }

  let verifiedUserId = "";

  try {
    const { user } = await requireAuthenticatedUser(request);
    verifiedUserId = user.id;
    const admin = getSupabaseAdminClient();
    const body = await request.json().catch(() => null);
    const { code } = parseConnectRequestBody(body);
    const clientId = getRequiredClientId();
    const clientSecret = getRequiredClientSecret();
    const redirectUri = getRedirectUri(request);

    if (!redirectUri) {
      throw createErrorPayload(
        "INVALID_REQUEST",
        "Не удалось определить redirect_uri для Google OAuth"
      );
    }

    const tokenResponse = await exchangeAuthorizationCode({
      code,
      clientId,
      clientSecret,
      redirectUri,
    });

    if (!hasRequiredScopes(tokenResponse.scope ?? "")) {
      throw createErrorPayload(
        "GOOGLE_REQUIRED_SCOPE_MISSING",
        "Google не выдал необходимые разрешения для работы с таблицей"
      );
    }

    const identity = await verifyGoogleIdentity(tokenResponse, clientId);
    const financeTrackerEmail = await getTrustedFinanceTrackerEmail(
      admin,
      user.id,
      user.email ?? null
    );
    assertFinanceTrackerEmailMatchesGoogle(financeTrackerEmail, identity.email);

    const existing = await getExistingConnection(admin, user.id);
    assertSameGoogleAccount(existing?.google_account_id, identity.sub);

    const refreshTokenChoice = chooseStoredRefreshToken(
      existing?.encrypted_refresh_token,
      tokenResponse.refresh_token ?? null
    );
    if (refreshTokenChoice.source === "missing") {
      throw createErrorPayload(
        "GOOGLE_REFRESH_TOKEN_MISSING",
        "Google не вернул refresh token"
      );
    }

    let spreadsheetId = existing?.spreadsheet_id ?? null;
    let spreadsheetUrl = existing?.spreadsheet_url ?? null;
    let createdNewSpreadsheet = false;

    if (spreadsheetId) {
      const accessCheck = await checkSpreadsheetAccess(
        tokenResponse.access_token,
        spreadsheetId
      );
      if (accessCheck.exists) {
        spreadsheetUrl = accessCheck.spreadsheetUrl ?? spreadsheetUrl;
      } else {
        const created = await createSpreadsheet(tokenResponse.access_token);
        spreadsheetId = created.spreadsheetId;
        spreadsheetUrl = created.spreadsheetUrl;
        createdNewSpreadsheet = true;
      }
    } else {
      const created = await createSpreadsheet(tokenResponse.access_token);
      spreadsheetId = created.spreadsheetId;
      spreadsheetUrl = created.spreadsheetUrl;
      createdNewSpreadsheet = true;
    }

    const refreshTokenToSave =
      refreshTokenChoice.source === "new"
        ? refreshTokenChoice.refreshToken
        : null;

    let encryptedRefreshToken = existing?.encrypted_refresh_token ?? null;
    let tokenIv = existing?.token_iv ?? null;
    let tokenAuthTag = existing?.token_auth_tag ?? null;

    if (refreshTokenToSave) {
      const cipher = await encryptGoogleRefreshToken(refreshTokenToSave);
      encryptedRefreshToken = cipher.encryptedRefreshToken;
      tokenIv = cipher.tokenIv;
      tokenAuthTag = cipher.tokenAuthTag;
    }

    if (!encryptedRefreshToken || !tokenIv) {
      throw createErrorPayload(
        "GOOGLE_REFRESH_TOKEN_MISSING",
        "Google не вернул refresh token"
      );
    }

    const now = new Date().toISOString();
    const { error: saveError } = await admin
      .from("google_sheets_connections")
      .upsert(
        {
          user_id: user.id,
          google_account_id: identity.sub,
          google_email: identity.email,
          spreadsheet_id: spreadsheetId,
          spreadsheet_url: spreadsheetUrl,
          encrypted_refresh_token: encryptedRefreshToken,
          token_iv: tokenIv,
          token_auth_tag: tokenAuthTag,
          connection_status: "connected",
          sync_status: "idle",
          last_synced_at: existing?.last_synced_at ?? null,
          sync_started_at: null,
          last_sync_error: null,
          updated_at: now,
        },
        { onConflict: "user_id" }
      );

    if (saveError) {
      logServerError("google-sheets-connect:save-connection", saveError, {
        userId: user.id,
        spreadsheetId,
        createdNewSpreadsheet,
      });
      throw createErrorPayload(
        "DATABASE_CONNECTION_SAVE_FAILED",
        "Не удалось сохранить подключение в базе"
      );
    }

    if (createdNewSpreadsheet) {
      const { error: logError } = await admin
        .from("google_sheets_sync_logs")
        .insert({
          user_id: user.id,
          spreadsheet_id: spreadsheetId,
          status: "success",
          trigger_type: "initial",
          rows_written: 0,
          started_at: now,
          finished_at: now,
          created_at: now,
        });

      if (logError) {
        logServerError("google-sheets-connect:initial-log", logError, {
          userId: user.id,
          spreadsheetId,
        });
      }
    }

    const safeResponse = toSafeConnectionRow(
      {
        google_account_id: identity.sub,
        google_email: identity.email,
        spreadsheet_id: spreadsheetId,
        spreadsheet_url: spreadsheetUrl,
        encrypted_refresh_token: encryptedRefreshToken,
        token_iv: tokenIv,
        token_auth_tag: tokenAuthTag,
        connection_status: "connected",
        sync_status: "idle",
        last_sync_error: null,
        last_synced_at: existing?.last_synced_at ?? null,
        created_at: existing?.created_at ?? now,
        updated_at: now,
      },
      {
        googleEmail: identity.email,
        spreadsheetUrl:
          spreadsheetUrl ??
          `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
        createdNewSpreadsheet,
      }
    );

    return jsonResponse(request, safeResponse);
  } catch (error) {
    const payload = (
      error as { success?: false; error?: { code?: string; message?: string } }
    ).error;
    if (payload?.code) {
      return jsonResponse(
        request,
        createErrorPayload(
          payload.code,
          payload.message ?? "Ошибка подключения Google Sheets"
        ),
        payload.code === "UNAUTHORIZED" ? 401 : 400
      );
    }

    logServerError("google-sheets-connect", error, {
      userId: verifiedUserId || undefined,
    });
    return jsonResponse(
      request,
      createErrorPayload("INTERNAL_ERROR", "Не удалось выполнить запрос"),
      500
    );
  }
});
