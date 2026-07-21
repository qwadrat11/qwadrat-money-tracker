import { supabase } from "../lib/supabase";
import type {
  GoogleSheetsApiError,
  GoogleSheetsConnectionStatus,
  GoogleSheetsErrorCode,
  GoogleSheetsSyncLog,
} from "../types";

type RpcConnectionRow = {
  google_email: string | null;
  spreadsheet_url: string | null;
  connection_status: GoogleSheetsConnectionStatus["connectionStatus"];
  sync_status: GoogleSheetsConnectionStatus["syncStatus"];
  last_synced_at: string | null;
  last_sync_error: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type RpcSyncLogRow = {
  id: string;
  status: GoogleSheetsSyncLog["status"];
  trigger_type: GoogleSheetsSyncLog["triggerType"];
  rows_written: number | string;
  error_code: GoogleSheetsErrorCode | string | null;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
  created_at: string;
};

type EdgeFunctionSuccess<T> = {
  success: true;
  data: T;
};

type EdgeFunctionError = {
  success: false;
  error?: {
    code?: string;
    message?: string;
  };
};

type FunctionErrorLike = {
  message?: string;
  error?: string;
  code?: string;
  status?: number;
  details?: string;
  context?: Response;
  response?: Response;
};

export type GoogleSheetsConnectResult = {
  googleEmail: string | null;
  spreadsheetUrl: string | null;
  connectionStatus: GoogleSheetsConnectionStatus["connectionStatus"];
  syncStatus: GoogleSheetsConnectionStatus["syncStatus"];
  createdNewSpreadsheet: boolean;
};

export type GoogleSheetsConnectionActionResult = {
  connection?: GoogleSheetsConnectResult;
};

export type GoogleSheetsSyncResult = {
  syncStatus: "success";
  lastSyncedAt: string;
  rowsWritten: number;
  sheetsUpdated: string[];
};

function assertSupabase() {
  if (!supabase) {
    throw new Error("Supabase client недоступен");
  }
  return supabase;
}

function normalizeStatusRow(
  row: Partial<RpcConnectionRow> | null | undefined
): GoogleSheetsConnectionStatus {
  return {
    googleEmail: row?.google_email ?? null,
    spreadsheetUrl: row?.spreadsheet_url ?? null,
    connectionStatus:
      row?.connection_status === "connecting" ||
      row?.connection_status === "connected" ||
      row?.connection_status === "disconnected" ||
      row?.connection_status === "error" ||
      row?.connection_status === "reauthorization_required"
        ? row.connection_status
        : "not_connected",
    syncStatus:
      row?.sync_status === "syncing" ||
      row?.sync_status === "success" ||
      row?.sync_status === "error"
        ? row.sync_status
        : "idle",
    lastSyncedAt: row?.last_synced_at ?? null,
    lastSyncError: row?.last_sync_error ?? null,
    createdAt: row?.created_at ?? null,
    updatedAt: row?.updated_at ?? null,
  };
}

function normalizeLogRow(row: RpcSyncLogRow): GoogleSheetsSyncLog {
  return {
    id: row.id,
    status: row.status,
    triggerType: row.trigger_type,
    rowsWritten: Number(row.rows_written ?? 0),
    errorCode: (row.error_code ?? null) as GoogleSheetsErrorCode | null,
    errorMessage: row.error_message ?? null,
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? null,
    createdAt: row.created_at,
  };
}

function mapErrorCode(raw: string): GoogleSheetsErrorCode {
  const text = raw.toLowerCase();
  if (text.includes("unauthorized") || text.includes("not authenticated"))
    return "UNAUTHORIZED";
  if (text.includes("client id missing")) return "GOOGLE_CLIENT_ID_MISSING";
  if (text.includes("oauth not configured"))
    return "GOOGLE_OAUTH_NOT_CONFIGURED";
  if (text.includes("oauth popup closed")) return "GOOGLE_OAUTH_POPUP_CLOSED";
  if (text.includes("popup failed to open"))
    return "GOOGLE_OAUTH_POPUP_FAILED_TO_OPEN";
  if (text.includes("access denied")) return "GOOGLE_OAUTH_ACCESS_DENIED";
  if (text.includes("script failed")) return "GOOGLE_OAUTH_SCRIPT_FAILED";
  if (text.includes("invalid request")) return "INVALID_REQUEST";
  if (text.includes("code exchange failed"))
    return "GOOGLE_CODE_EXCHANGE_FAILED";
  if (text.includes("required scope")) return "GOOGLE_REQUIRED_SCOPE_MISSING";
  if (text.includes("identity verification"))
    return "GOOGLE_IDENTITY_VERIFICATION_FAILED";
  if (text.includes("email not verified")) return "GOOGLE_EMAIL_NOT_VERIFIED";
  if (text.includes("account email mismatch"))
    return "GOOGLE_ACCOUNT_EMAIL_MISMATCH";
  if (text.includes("account mismatch")) return "GOOGLE_ACCOUNT_MISMATCH";
  if (text.includes("spreadsheet create failed"))
    return "GOOGLE_SPREADSHEET_CREATE_FAILED";
  if (text.includes("spreadsheet check failed"))
    return "GOOGLE_SPREADSHEET_CHECK_FAILED";
  if (text.includes("spreadsheet access denied"))
    return "GOOGLE_SPREADSHEET_ACCESS_DENIED";
  if (text.includes("database connection save failed"))
    return "DATABASE_CONNECTION_SAVE_FAILED";
  if (text.includes("not connected")) return "GOOGLE_NOT_CONNECTED";
  if (text.includes("sync not implemented"))
    return "GOOGLE_SYNC_NOT_IMPLEMENTED";
  if (text.includes("access revoked")) return "GOOGLE_ACCESS_REVOKED";
  if (text.includes("reauthorization required"))
    return "GOOGLE_REAUTHORIZATION_REQUIRED";
  if (text.includes("refresh token missing"))
    return "GOOGLE_REFRESH_TOKEN_MISSING";
  if (text.includes("spreadsheet not found")) return "SPREADSHEET_NOT_FOUND";
  if (text.includes("sync already running")) return "SYNC_ALREADY_RUNNING";
  if (text.includes("rate limit")) return "GOOGLE_RATE_LIMIT";
  if (text.includes("google api")) return "GOOGLE_API_ERROR";
  if (text.includes("invalid finance data")) return "INVALID_FINANCE_DATA";
  if (text.includes("network")) return "NETWORK_ERROR";
  return "INTERNAL_ERROR";
}

function readableGoogleSheetsMessage(
  code: GoogleSheetsErrorCode,
  fallback: string
) {
  switch (code) {
    case "UNAUTHORIZED":
      return "Сначала войдите в аккаунт";
    case "GOOGLE_NOT_CONNECTED":
      return "Google Sheets еще не подключен";
    case "GOOGLE_OAUTH_NOT_CONFIGURED":
      return "Подключение Google OAuth пока не настроено";
    case "GOOGLE_CLIENT_ID_MISSING":
      return "Не задан Google Client ID";
    case "GOOGLE_OAUTH_SCRIPT_FAILED":
      return "Не удалось запустить Google OAuth";
    case "GOOGLE_OAUTH_POPUP_CLOSED":
      return "Окно подключения Google было закрыто";
    case "GOOGLE_OAUTH_POPUP_FAILED_TO_OPEN":
      return "Не удалось открыть окно Google. Попробуйте в браузере";
    case "GOOGLE_OAUTH_ACCESS_DENIED":
      return "Доступ к Google Sheets был отменен";
    case "INVALID_REQUEST":
      return "Некорректный запрос";
    case "GOOGLE_CODE_EXCHANGE_FAILED":
      return "Не удалось обменять authorization code";
    case "GOOGLE_REQUIRED_SCOPE_MISSING":
      return "Google не выдал нужные разрешения";
    case "GOOGLE_IDENTITY_VERIFICATION_FAILED":
      return "Не удалось проверить Google-аккаунт";
    case "GOOGLE_EMAIL_NOT_VERIFIED":
      return "Google-аккаунт должен быть подтвержден";
    case "GOOGLE_ACCOUNT_EMAIL_MISMATCH":
      return "Подключите тот же Google-аккаунт, что и для входа в qwadrat Finance Tracker";
    case "GOOGLE_ACCOUNT_MISMATCH":
      return "Этот Google-аккаунт уже связан с другим подключением";
    case "GOOGLE_SPREADSHEET_CREATE_FAILED":
      return "Не удалось создать таблицу Google Sheets";
    case "GOOGLE_SPREADSHEET_CHECK_FAILED":
      return "Не удалось проверить существующую таблицу";
    case "GOOGLE_SPREADSHEET_ACCESS_DENIED":
      return "Нет доступа к уже созданной таблице";
    case "DATABASE_CONNECTION_SAVE_FAILED":
      return "Не удалось сохранить подключение в базе";
    case "GOOGLE_SYNC_NOT_IMPLEMENTED":
      return "Синхронизация Google Sheets пока не реализована";
    case "GOOGLE_ACCESS_REVOKED":
      return "Доступ к Google Sheets был отозван";
    case "GOOGLE_REAUTHORIZATION_REQUIRED":
      return "Переподключите Google Sheets, чтобы продолжить";
    case "GOOGLE_REFRESH_TOKEN_MISSING":
      return "Сервер не получил refresh token от Google";
    case "SPREADSHEET_NOT_FOUND":
      return "Google-таблица не найдена";
    case "SYNC_ALREADY_RUNNING":
      return "Синхронизация уже выполняется";
    case "GOOGLE_RATE_LIMIT":
      return "Слишком много запросов к Google";
    case "GOOGLE_API_ERROR":
      return "Google Sheets временно недоступен";
    case "INVALID_FINANCE_DATA":
      return "Некоторые финансовые данные повреждены";
    case "NETWORK_ERROR":
      return "Проблема с сетью";
    case "INTERNAL_ERROR":
    default:
      return fallback || "Не удалось выполнить запрос";
  }
}

async function mapInvokeError(error: unknown): Promise<GoogleSheetsApiError> {
  const source = error as FunctionErrorLike;
  let message = source.message ?? source.error ?? "Не удалось выполнить запрос";
  let code = mapErrorCode(
    `${source.code ?? ""} ${source.message ?? ""} ${
      source.details ?? ""
    }`.toLowerCase()
  );

  const response = source.context ?? source.response;
  if (response) {
    try {
      const body = (await response.clone().json()) as EdgeFunctionError;
      if (body?.error) {
        code = mapErrorCode(`${body.error.code ?? ""}`.toLowerCase());
        message = body.error.message ?? message;
      }
    } catch {
      // Keep the SDK message fallback.
    }
  }

  return {
    success: false,
    error: {
      code,
      message: readableGoogleSheetsMessage(code, message),
    },
  };
}

async function getJsonBody<T>(data: unknown, fallback: string): Promise<T> {
  if (!data || typeof data !== "object") {
    throw {
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: fallback,
      },
    } satisfies GoogleSheetsApiError;
  }

  return data as T;
}

async function invokeGoogleSheetsFunction<T>(
  name:
    | "google-sheets-connect"
    | "google-sheets-sync"
    | "google-sheets-disconnect",
  body?: Record<string, unknown>
) {
  const client = assertSupabase();
  const { data, error } = await client.functions.invoke(name, {
    body: body ?? {},
  });

  if (error) {
    throw await mapInvokeError(error);
  }

  const payload = await getJsonBody<EdgeFunctionSuccess<T> | EdgeFunctionError>(
    data,
    "Пустой ответ от сервера"
  );
  if ("success" in payload && payload.success === false) {
    const code = mapErrorCode(`${payload.error?.code ?? ""}`.toLowerCase());
    throw {
      success: false,
      error: {
        code,
        message: readableGoogleSheetsMessage(
          code,
          payload.error?.message ?? "Не удалось выполнить запрос"
        ),
      },
    } satisfies GoogleSheetsApiError;
  }

  return payload as EdgeFunctionSuccess<T>;
}

export async function getGoogleSheetsConnectionStatus(): Promise<GoogleSheetsConnectionStatus> {
  const client = assertSupabase();
  const { data, error } = await client.rpc("get_my_google_sheets_connection");
  if (error) {
    throw await mapInvokeError(error);
  }

  const row = Array.isArray(data)
    ? (data[0] as Partial<RpcConnectionRow> | undefined)
    : (data as Partial<RpcConnectionRow> | null | undefined);
  return normalizeStatusRow(row ?? null);
}

export async function getGoogleSheetsSyncLogs(
  limit = 10
): Promise<GoogleSheetsSyncLog[]> {
  const client = assertSupabase();
  const safeLimit = Math.max(1, Math.min(50, Math.floor(limit || 10)));
  const { data, error } = await client.rpc("get_my_google_sheets_sync_logs", {
    p_limit: safeLimit,
  });
  if (error) {
    throw await mapInvokeError(error);
  }

  return Array.isArray(data)
    ? data.map((row) => normalizeLogRow(row as RpcSyncLogRow))
    : [];
}

export async function connectGoogleSheets(
  code: string
): Promise<GoogleSheetsConnectResult> {
  const result = await invokeGoogleSheetsFunction<GoogleSheetsConnectResult>(
    "google-sheets-connect",
    { code }
  );
  return result.data;
}

export async function syncGoogleSheets() {
  const result = await invokeGoogleSheetsFunction<GoogleSheetsSyncResult>(
    "google-sheets-sync"
  );
  return result.data;
}

export async function disconnectGoogleSheets() {
  const result = await invokeGoogleSheetsFunction<{
    connection?: GoogleSheetsConnectionStatus;
  }>("google-sheets-disconnect");
  return result.data;
}

export function isGoogleSheetsApiError(
  error: unknown
): error is GoogleSheetsApiError {
  return Boolean(
    error &&
      typeof error === "object" &&
      "success" in error &&
      (error as GoogleSheetsApiError).success === false &&
      "error" in error
  );
}

export function readableGoogleSheetsErrorMessage(error: unknown) {
  if (isGoogleSheetsApiError(error)) {
    return error.error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Не удалось выполнить запрос";
}
