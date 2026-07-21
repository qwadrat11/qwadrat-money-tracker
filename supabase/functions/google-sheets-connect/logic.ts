import { createErrorPayload } from "../_shared/errors.ts";

export type GoogleTokenExchangeResponse = {
  access_token: string;
  expires_in?: number;
  scope?: string;
  refresh_token?: string;
  id_token?: string;
  token_type?: string;
};

export type GoogleIdentityClaims = {
  sub: string;
  email: string;
  email_verified: boolean;
  aud?: string;
  iss?: string;
  exp?: number;
};

export type ExistingGoogleSheetsConnection = {
  google_account_id: string | null;
  google_email: string | null;
  spreadsheet_id: string | null;
  spreadsheet_url: string | null;
  encrypted_refresh_token: string | null;
  token_iv: string | null;
  token_auth_tag: string | null;
  connection_status: string | null;
  sync_status: string | null;
  last_sync_error: string | null;
  last_synced_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type SpreadsheetTemplate = {
  properties: {
    title: string;
  };
  sheets: Array<{
    properties: {
      title: string;
      gridProperties: {
        rowCount: number;
        columnCount: number;
        frozenRowCount: number;
      };
    };
  }>;
};

export type InitialFormattingRequest = {
  requests: Array<Record<string, unknown>>;
};

export function normalizeEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

export function emailsMatch(
  left: string | null | undefined,
  right: string | null | undefined
) {
  return normalizeEmail(left) === normalizeEmail(right);
}

export function parseConnectRequestBody(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw createErrorPayload("INVALID_REQUEST", "Некорректный запрос");
  }

  const code =
    typeof (body as { code?: unknown }).code === "string"
      ? (body as { code: string }).code.trim()
      : "";
  if (!code || code.length < 8 || code.length > 4096) {
    throw createErrorPayload(
      "INVALID_REQUEST",
      "Некорректный authorization code"
    );
  }

  return { code };
}

export function assertSameGoogleAccount(
  existingGoogleAccountId: string | null | undefined,
  currentGoogleAccountId: string
) {
  if (
    existingGoogleAccountId &&
    existingGoogleAccountId !== currentGoogleAccountId
  ) {
    throw createErrorPayload(
      "GOOGLE_ACCOUNT_MISMATCH",
      "Этот Google-аккаунт уже связан с другим подключением"
    );
  }
}

export function assertFinanceTrackerEmailMatchesGoogle(
  financeTrackerEmail: string | null | undefined,
  googleEmail: string
) {
  if (!emailsMatch(financeTrackerEmail, googleEmail)) {
    throw createErrorPayload(
      "GOOGLE_ACCOUNT_EMAIL_MISMATCH",
      "Подключите тот же Google-аккаунт, который используется для входа в qwadrat Finance Tracker"
    );
  }
}

export function hasRequiredScopes(scope: string | null | undefined) {
  const granted = new Set(
    (scope ?? "")
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean)
  );
  return (
    granted.has("https://www.googleapis.com/auth/spreadsheets") ||
    granted.has("https://www.googleapis.com/auth/drive.file")
  );
}

export function chooseStoredRefreshToken(
  existingEncrypted: string | null | undefined,
  newRefreshToken: string | null | undefined
) {
  if (newRefreshToken && newRefreshToken.trim()) {
    return { refreshToken: newRefreshToken.trim(), source: "new" as const };
  }

  if (existingEncrypted) {
    return { refreshToken: null, source: "existing" as const };
  }

  return { refreshToken: null, source: "missing" as const };
}

export function buildSpreadsheetTemplate(
  title = "qwadrat Finance Tracker — Мои финансы"
): SpreadsheetTemplate {
  return {
    properties: {
      title,
    },
    sheets: [
      sheetTemplate("Обзор", 2),
      sheetTemplate("Операции", 13),
      sheetTemplate("Счета", 9),
      sheetTemplate("Категории", 6),
    ],
  };
}

function sheetTemplate(title: string, columnCount: number) {
  return {
    properties: {
      title,
      gridProperties: {
        rowCount: 1000,
        columnCount,
        frozenRowCount: 1,
      },
    },
  };
}

export function buildInitialFormattingRequests(
  sheetIdByTitle: Record<string, number>
) {
  const requests: Array<Record<string, unknown>> = [];

  for (const [title, sheetId] of Object.entries(sheetIdByTitle)) {
    requests.push({
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: {
            frozenRowCount: 1,
          },
        },
        fields: "gridProperties.frozenRowCount",
      },
    });

    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
        },
        cell: {
          userEnteredFormat: {
            textFormat: {
              bold: true,
            },
            backgroundColor: {
              red: 0.95,
              green: 0.95,
              blue: 0.96,
            },
          },
        },
        fields: "userEnteredFormat(textFormat,backgroundColor)",
      },
    });

    requests.push({
      updateDimensionProperties: {
        range: {
          sheetId,
          dimension: "COLUMNS",
          startIndex: 0,
          endIndex:
            title === "Операции"
              ? 13
              : title === "Счета"
              ? 9
              : title === "Категории"
              ? 6
              : 2,
        },
        properties: {
          pixelSize: title === "Операции" ? 140 : 180,
        },
        fields: "pixelSize",
      },
    });
  }

  return { requests };
}

export function buildSafeConnectSuccess(data: {
  googleEmail: string;
  spreadsheetUrl: string;
  connectionStatus: "connected";
  syncStatus: "idle";
  createdNewSpreadsheet: boolean;
}) {
  return {
    success: true as const,
    data: {
      googleEmail: data.googleEmail,
      spreadsheetUrl: data.spreadsheetUrl,
      connectionStatus: data.connectionStatus,
      syncStatus: data.syncStatus,
      createdNewSpreadsheet: data.createdNewSpreadsheet,
    },
  };
}
