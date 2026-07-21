import { createCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import {
  type ApiErrorPayload,
  createErrorPayload,
  logServerError,
} from "../_shared/errors.ts";
import { requireAuthenticatedUser } from "../_shared/auth.ts";
import { getSupabaseAdminClient } from "../_shared/supabaseAdmin.ts";
import { decryptGoogleRefreshToken } from "../_shared/googleTokenCrypto.ts";
import {
  createRateSnapshot,
  normalizeCurrency,
} from "../_shared/currencyConversion.ts";
import {
  applyFormatting,
  buildAccountingFormattingRequests,
  buildManagedCleanupRequests,
  clearManagedValues,
  ensureManagedStructure,
  getSpreadsheet,
  refreshGoogleAccessToken,
  validateAccountingLayout,
  writeManagedValues,
} from "./googleApi.ts";
import {
  buildSheetValues,
  type FinanceData,
  isFreshSync,
  safeSyncResponse,
} from "./logic.ts";

type ConnectionRow = {
  user_id: string;
  spreadsheet_id: string | null;
  encrypted_refresh_token: string | null;
  token_iv: string | null;
  token_auth_tag: string | null;
  connection_status: string;
  sync_status: string;
  sync_started_at: string | null;
};
type StructuredError = ApiErrorPayload & { httpStatus?: number };
const LOCK_TIMEOUT_MS = 10 * 60 * 1000;

function jsonResponse(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...Object.fromEntries(createCorsHeaders(request)),
      "Content-Type": "application/json",
    },
  });
}
function requiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}
function errorInfo(error: unknown) {
  const payload = (error as StructuredError)?.error;
  if (payload?.code) {
    return {
      code: payload.code,
      message: payload.message,
      status:
        (error as StructuredError).httpStatus ??
        (payload.code === "SYNC_ALREADY_RUNNING"
          ? 409
          : payload.code === "GOOGLE_RATE_LIMIT"
          ? 429
          : 400),
    };
  }
  return {
    code: "INTERNAL_ERROR",
    message: "Не удалось синхронизировать Google Sheets",
    status: 500,
  };
}

async function loadConnection(userId: string) {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("google_sheets_connections")
    .select(
      "user_id,spreadsheet_id,encrypted_refresh_token,token_iv,token_auth_tag,connection_status,sync_status,sync_started_at"
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as ConnectionRow | null;
}

async function acquireLock(userId: string, connection: ConnectionRow) {
  if (isFreshSync(connection.sync_status, connection.sync_started_at)) {
    throw createErrorPayload(
      "SYNC_ALREADY_RUNNING",
      "Синхронизация уже выполняется"
    );
  }
  const cutoff = new Date(Date.now() - LOCK_TIMEOUT_MS).toISOString(),
    startedAt = new Date().toISOString();
  const { data, error } = await getSupabaseAdminClient()
    .from("google_sheets_connections")
    .update({
      sync_status: "syncing",
      sync_started_at: startedAt,
      last_sync_error: null,
    })
    .eq("user_id", userId)
    .eq("connection_status", "connected")
    .or(
      `sync_status.neq.syncing,sync_started_at.lt.${cutoff},sync_started_at.is.null`
    )
    .select("user_id")
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw createErrorPayload(
      "SYNC_ALREADY_RUNNING",
      "Синхронизация уже выполняется"
    );
  }
  return startedAt;
}

async function loadFinanceData(userId: string): Promise<FinanceData> {
  const admin = getSupabaseAdminClient();
  const [profile, accounts, categories, transactions, budgets, settings] =
    await Promise.all([
      admin
        .from("profiles")
        .select("id,email,display_name")
        .eq("id", userId)
        .maybeSingle(),
      admin
        .from("accounts")
        .select(
          "id,user_id,name,type,balance,currency,icon,is_archived,include_in_total,created_at,updated_at"
        )
        .eq("user_id", userId),
      admin
        .from("categories")
        .select("id,user_id,name,type,icon,created_at,updated_at")
        .eq("user_id", userId),
      admin
        .from("transactions")
        .select(
          "id,user_id,account_id,to_account_id,category_id,type,amount,currency,base_currency,exchange_rate,converted_amount,exchange_rate_date,exchange_rate_source,title,note,date,created_at,updated_at"
        )
        .eq("user_id", userId)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false }),
      admin
        .from("budgets")
        .select("month,limit_amount")
        .eq("user_id", userId)
        .order("month", { ascending: false })
        .limit(24),
      admin
        .from("app_settings")
        .select("data")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);
  for (const result of [
    profile,
    accounts,
    categories,
    transactions,
    budgets,
    settings,
  ])
    if (result.error) throw result.error;
  return {
    profile: profile.data,
    accounts: accounts.data ?? [],
    categories: categories.data ?? [],
    transactions: transactions.data ?? [],
    budgets: budgets.data ?? [],
    settings: (settings.data?.data && typeof settings.data.data === "object"
      ? settings.data.data
      : {}) as Record<string, unknown>,
  };
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
  let userId = "",
    logId: string | null = null,
    lockAcquired = false,
    spreadsheetId: string | null = null;
  try {
    const { user } = await requireAuthenticatedUser(request);
    userId = user.id;
    const connection = await loadConnection(user.id);
    if (!connection || connection.connection_status !== "connected") {
      throw createErrorPayload(
        "GOOGLE_NOT_CONNECTED",
        "Google Sheets еще не подключен"
      );
    }
    if (!connection.spreadsheet_id) {
      throw createErrorPayload(
        "SPREADSHEET_NOT_FOUND",
        "Google-таблица не найдена"
      );
    }
    if (!connection.encrypted_refresh_token || !connection.token_iv) {
      throw createErrorPayload(
        "GOOGLE_REFRESH_TOKEN_MISSING",
        "Refresh token отсутствует"
      );
    }
    spreadsheetId = connection.spreadsheet_id;
    const startedAt = await acquireLock(user.id, connection);
    lockAcquired = true;
    const { data: log, error: logError } = await getSupabaseAdminClient()
      .from("google_sheets_sync_logs")
      .insert({
        user_id: user.id,
        spreadsheet_id: spreadsheetId,
        status: "started",
        trigger_type: "manual",
        rows_written: 0,
        started_at: startedAt,
      })
      .select("id")
      .single();
    if (logError) throw logError;
    logId = log.id;
    const refreshToken = await decryptGoogleRefreshToken({
      encryptedRefreshToken: connection.encrypted_refresh_token,
      tokenIv: connection.token_iv,
      tokenAuthTag: connection.token_auth_tag,
    });
    const accessToken = await refreshGoogleAccessToken(
      refreshToken,
      requiredEnv("GOOGLE_CLIENT_ID"),
      requiredEnv("GOOGLE_CLIENT_SECRET")
    );
    const spreadsheet = await getSpreadsheet(spreadsheetId, accessToken);
    const finance = await loadFinanceData(user.id),
      finishedAt = new Date().toISOString();
    const baseCurrency = normalizeCurrency(
      finance.settings.baseCurrency ?? finance.settings.currency ?? "USD"
    );
    let currentBalanceBase = 0;
    for (const account of finance.accounts.filter(
      (item) => !item.is_archived && item.include_in_total !== false
    )) {
      const balance = Number(account.balance ?? 0);
      if (!balance) continue;
      const snapshot = await createRateSnapshot(
        getSupabaseAdminClient(),
        Math.abs(balance),
        account.currency ?? "USD",
        baseCurrency,
        finishedAt.slice(0, 10)
      );
      currentBalanceBase +=
        balance < 0 ? -snapshot.convertedAmount : snapshot.convertedAmount;
    }
    finance.settings.currentBalanceBase = currentBalanceBase;
    finance.settings.baseCurrency = baseCurrency;
    const sheetValues = buildSheetValues(finance, finishedAt);
    const metadata = await ensureManagedStructure(
      spreadsheetId,
      accessToken,
      spreadsheet,
      {
        overview: sheetValues.overview.length,
        support: sheetValues.support.length,
        operations: sheetValues.operations.length,
        accounts: sheetValues.accounts.length,
        categories: sheetValues.categories.length,
      }
    );
    await applyFormatting(
      spreadsheetId,
      accessToken,
      buildManagedCleanupRequests(metadata)
    );
    await clearManagedValues(spreadsheetId, accessToken);
    await writeManagedValues(spreadsheetId, accessToken, sheetValues);
    const formatting = buildAccountingFormattingRequests(
      metadata,
      sheetValues,
      sheetValues.layout
    );
    await applyFormatting(spreadsheetId, accessToken, formatting);
    const appliedMetadata = await getSpreadsheet(spreadsheetId, accessToken);
    validateAccountingLayout(appliedMetadata, sheetValues, sheetValues.layout);
    const { error: updateError } = await getSupabaseAdminClient()
      .from("google_sheets_connections")
      .update({
        sync_status: "success",
        last_synced_at: finishedAt,
        sync_started_at: null,
        last_sync_error: null,
      })
      .eq("user_id", user.id);
    if (updateError) throw updateError;
    if (logId) {
      await getSupabaseAdminClient()
        .from("google_sheets_sync_logs")
        .update({
          status: "success",
          rows_written: sheetValues.rowsWritten,
          finished_at: finishedAt,
        })
        .eq("id", logId)
        .eq("user_id", user.id);
    }
    return jsonResponse(
      request,
      safeSyncResponse(finishedAt, sheetValues.rowsWritten)
    );
  } catch (error) {
    const info = errorInfo(error),
      finishedAt = new Date().toISOString();
    if (userId && lockAcquired) {
      await getSupabaseAdminClient()
        .from("google_sheets_connections")
        .update({
          sync_status: "error",
          sync_started_at: null,
          last_sync_error: info.message,
          connection_status: [
            "GOOGLE_ACCESS_REVOKED",
            "GOOGLE_REAUTHORIZATION_REQUIRED",
          ].includes(info.code)
            ? "reauthorization_required"
            : undefined,
        })
        .eq("user_id", userId);
      if (logId) {
        await getSupabaseAdminClient()
          .from("google_sheets_sync_logs")
          .update({
            status: "error",
            error_code: info.code,
            error_message: info.message,
            finished_at: finishedAt,
          })
          .eq("id", logId)
          .eq("user_id", userId);
      }
    }
    if (info.code === "INTERNAL_ERROR") {
      logServerError("google-sheets-sync", error, {
        userId: userId || undefined,
        spreadsheetConfigured: Boolean(spreadsheetId),
      });
    }
    return jsonResponse(
      request,
      createErrorPayload(info.code, info.message),
      info.status
    );
  }
});
