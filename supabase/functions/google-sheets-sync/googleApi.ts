import { createErrorPayload } from "../_shared/errors.ts";

type Fetcher = typeof fetch;
type GridRange = {
  sheetId?: number;
  startRowIndex?: number;
  endRowIndex?: number;
  startColumnIndex?: number;
  endColumnIndex?: number;
};
type Sheet = {
  properties?: {
    sheetId?: number;
    title?: string;
    hidden?: boolean;
    gridProperties?: { rowCount?: number; columnCount?: number };
  };
  merges?: GridRange[];
  charts?: Array<{ chartId?: number }>;
  bandedRanges?: Array<{ bandedRangeId?: number }>;
  conditionalFormats?: unknown[];
};
const SUPPORT_SHEET = "_qwadrat_finance_tracker_data";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function googleFetch(
  url: string,
  init: RequestInit,
  fetcher: Fetcher = fetch,
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetcher(url, init);
      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        await sleep(300 * 2 ** attempt);
        continue;
      }
      return response;
    } catch (error) {
      if (attempt === 2) throw error;
      await sleep(300 * 2 ** attempt);
    }
  }
  throw new Error("GOOGLE_API_ERROR");
}

export async function refreshGoogleAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
  fetcher: Fetcher = fetch,
) {
  const response = await googleFetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  }, fetcher);
  const data = await response.json().catch(() => ({})) as {
    access_token?: string;
    error?: string;
  };
  if (!response.ok || !data.access_token) {
    if (data.error === "invalid_grant") {
      throw createErrorPayload(
        "GOOGLE_REAUTHORIZATION_REQUIRED",
        "Требуется повторно подключить Google Sheets",
      );
    }
    throw createErrorPayload(
      response.status === 429 ? "GOOGLE_RATE_LIMIT" : "GOOGLE_ACCESS_REVOKED",
      "Доступ Google был отозван",
    );
  }
  return data.access_token;
}

const auth = (accessToken: string) => ({
  Authorization: `Bearer ${accessToken}`,
  "Content-Type": "application/json",
});

export async function getSpreadsheet(
  spreadsheetId: string,
  accessToken: string,
  fetcher: Fetcher = fetch,
) {
  const response = await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${
      encodeURIComponent(spreadsheetId)
    }?fields=spreadsheetId,sheets(properties(sheetId,title,hidden,gridProperties(rowCount,columnCount)),merges,charts(chartId),bandedRanges(bandedRangeId),conditionalFormats)`,
    { headers: auth(accessToken) },
    fetcher,
  );
  if (response.status === 404) {
    throw createErrorPayload(
      "SPREADSHEET_NOT_FOUND",
      "Google-таблица не найдена",
    );
  }
  if (response.status === 401) {
    throw createErrorPayload(
      "GOOGLE_REAUTHORIZATION_REQUIRED",
      "Требуется повторно подключить Google Sheets",
    );
  }
  if (response.status === 403) {
    throw createErrorPayload(
      "GOOGLE_SPREADSHEET_ACCESS_DENIED",
      "Нет доступа к Google-таблице",
    );
  }
  if (!response.ok) {
    throw createErrorPayload(
      response.status === 429 ? "GOOGLE_RATE_LIMIT" : "GOOGLE_API_ERROR",
      "Google Sheets API временно недоступен",
    );
  }
  return await response.json() as { spreadsheetId: string; sheets?: Sheet[] };
}

export async function clearManagedValues(
  spreadsheetId: string,
  accessToken: string,
  fetcher: Fetcher = fetch,
) {
  const ranges = [
    "Обзор!A:L",
    "Операции!A:R",
    "Счета!A:I",
    "Категории!A:I",
    `${SUPPORT_SHEET}!A:K`,
  ];
  const response = await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${
      encodeURIComponent(spreadsheetId)
    }/values:batchClear`,
    {
      method: "POST",
      headers: auth(accessToken),
      body: JSON.stringify({ ranges }),
    },
    fetcher,
  );
  if (!response.ok) {
    throw createErrorPayload(
      response.status === 429 ? "GOOGLE_RATE_LIMIT" : "GOOGLE_API_ERROR",
      "Не удалось очистить управляемые диапазоны",
    );
  }
}

export async function writeManagedValues(
  spreadsheetId: string,
  accessToken: string,
  values: {
    overview: unknown[][];
    support: unknown[][];
    operations: unknown[][];
    accounts: unknown[][];
    categories: unknown[][];
  },
  fetcher: Fetcher = fetch,
) {
  const data = [
    { range: "Обзор!A1", values: values.overview },
    { range: "Операции!A1", values: values.operations },
    { range: "Счета!A1", values: values.accounts },
    { range: "Категории!A1", values: values.categories },
    { range: `${SUPPORT_SHEET}!A1`, values: values.support },
  ];
  const response = await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${
      encodeURIComponent(spreadsheetId)
    }/values:batchUpdate`,
    {
      method: "POST",
      headers: auth(accessToken),
      body: JSON.stringify({ valueInputOption: "USER_ENTERED", data }),
    },
    fetcher,
  );
  if (!response.ok) {
    throw createErrorPayload(
      response.status === 429 ? "GOOGLE_RATE_LIMIT" : "GOOGLE_API_ERROR",
      "Не удалось записать данные в Google Sheets",
    );
  }
}

export async function ensureManagedStructure(
  spreadsheetId: string,
  accessToken: string,
  metadata: { spreadsheetId: string; sheets?: Sheet[] },
  rowCounts: {
    overview: number;
    support: number;
    operations: number;
    accounts: number;
    categories: number;
  },
  fetcher: Fetcher = fetch,
) {
  const columns: Record<string, number> = {
    "Обзор": 12,
    "Операции": 18,
    "Счета": 9,
    "Категории": 9,
    [SUPPORT_SHEET]: 11,
  };
  const rows: Record<string, number> = {
    "Обзор": Math.max(60, rowCounts.overview + 10),
    "Операции": Math.max(100, rowCounts.operations + 25),
    "Счета": Math.max(100, rowCounts.accounts + 25),
    "Категории": Math.max(100, rowCounts.categories + 25),
    [SUPPORT_SHEET]: Math.max(100, rowCounts.support + 25),
  };
  const sheets = [...(metadata.sheets ?? [])],
    support = sheets.find((sheet) => sheet.properties?.title === SUPPORT_SHEET);
  const requests: Record<string, unknown>[] = [];
  if (!support) {
    requests.push({
      addSheet: {
        properties: {
          title: SUPPORT_SHEET,
          hidden: true,
          gridProperties: {
            rowCount: rows[SUPPORT_SHEET],
            columnCount: columns[SUPPORT_SHEET],
          },
        },
      },
    });
  }
  for (
    const sheet of sheets.filter((item) =>
      columns[item.properties?.title ?? ""]
    )
  ) {
    requests.push({
      updateSheetProperties: {
        properties: {
          sheetId: sheet.properties!.sheetId,
          hidden: sheet.properties!.title === SUPPORT_SHEET
            ? true
            : sheet.properties!.hidden,
          gridProperties: {
            rowCount: rows[sheet.properties!.title!],
            columnCount: columns[sheet.properties!.title!],
          },
        },
        fields: sheet.properties!.title === SUPPORT_SHEET
          ? "hidden,gridProperties(rowCount,columnCount)"
          : "gridProperties(rowCount,columnCount)",
      },
    });
  }
  if (
    sheets.filter((sheet) =>
      ["Обзор", "Операции", "Счета", "Категории"].includes(
        sheet.properties?.title ?? "",
      )
    ).length !== 4
  ) {
    throw createErrorPayload(
      "GOOGLE_API_ERROR",
      "В таблице отсутствует один из управляемых листов",
    );
  }
  const response = await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${
      encodeURIComponent(spreadsheetId)
    }:batchUpdate`,
    {
      method: "POST",
      headers: auth(accessToken),
      body: JSON.stringify({ requests }),
    },
    fetcher,
  );
  if (!response.ok) {
    throw createErrorPayload(
      response.status === 429 ? "GOOGLE_RATE_LIMIT" : "GOOGLE_API_ERROR",
      "Не удалось подготовить листы к синхронизации",
    );
  }
  if (!support) {
    const body = await response.json() as {
      replies?: Array<
        {
          addSheet?: {
            properties?: { sheetId?: number; title?: string; hidden?: boolean };
          };
        }
      >;
    };
    const properties = body.replies?.find((reply) => reply.addSheet)?.addSheet
      ?.properties;
    if (typeof properties?.sheetId !== "number") {
      throw createErrorPayload(
        "GOOGLE_API_ERROR",
        "Не удалось создать служебный лист",
      );
    }
    sheets.push({ properties });
  }
  for (const sheet of sheets) {
    const title = sheet.properties?.title ?? "";
    if (columns[title] && sheet.properties) {
      sheet.properties.gridProperties = {
        rowCount: rows[title],
        columnCount: columns[title],
      };
    }
  }
  return { ...metadata, sheets };
}

export function buildManagedCleanupRequests(metadata: { sheets?: Sheet[] }) {
  const managed = new Set(["Обзор", "Операции", "Счета", "Категории"]);
  const requests: Record<string, unknown>[] = [];
  for (const sheet of metadata.sheets ?? []) {
    const title = sheet.properties?.title ?? "";
    const sheetId = sheet.properties?.sheetId;
    if (!managed.has(title) || typeof sheetId !== "number") continue;
    for (const chart of title === "Обзор" ? sheet.charts ?? [] : []) {
      if (chart.chartId != null) {
        requests.push({ deleteEmbeddedObject: { objectId: chart.chartId } });
      }
    }
    for (const band of sheet.bandedRanges ?? []) {
      if (band.bandedRangeId != null) {
        requests.push({ deleteBanding: { bandedRangeId: band.bandedRangeId } });
      }
    }
    for (
      let index = (sheet.conditionalFormats?.length ?? 0) - 1;
      index >= 0;
      index--
    ) requests.push({ deleteConditionalFormatRule: { sheetId, index } });
    requests.push({ clearBasicFilter: { sheetId } });
    for (const merge of sheet.merges ?? []) {
      requests.push({ unmergeCells: { range: { ...merge, sheetId } } });
    }
    const rowCount = sheet.properties?.gridProperties?.rowCount ?? 100;
    const columnCount = sheet.properties?.gridProperties?.columnCount ?? 13;
    requests.push(
      {
        repeatCell: {
          range: range(sheetId, 0, rowCount, 0, columnCount),
          cell: { userEnteredFormat: {} },
          fields: "userEnteredFormat",
        },
      },
      {
        updateDimensionProperties: {
          range: {
            sheetId,
            dimension: "ROWS",
            startIndex: 0,
            endIndex: rowCount,
          },
          properties: { pixelSize: 21 },
          fields: "pixelSize",
        },
      },
      {
        updateDimensionProperties: {
          range: {
            sheetId,
            dimension: "COLUMNS",
            startIndex: 0,
            endIndex: columnCount,
          },
          properties: { pixelSize: 100 },
          fields: "pixelSize",
        },
      },
    );
  }
  return requests;
}

const rgb = (red: number, green: number, blue: number) => ({
  red,
  green,
  blue,
});
const range = (
  sheetId: number,
  startRowIndex: number,
  endRowIndex: number,
  startColumnIndex = 0,
  endColumnIndex = 20,
) => ({
  sheetId,
  startRowIndex,
  endRowIndex,
  startColumnIndex,
  endColumnIndex,
});

export function buildFormattingRequests(
  metadata: { sheets?: Sheet[] },
  rowCounts: { operations: number; accounts: number; categories: number },
  chartRows: { monthly: number; categories: number; accounts: number },
) {
  const byTitle = new Map(
    (metadata.sheets ?? []).map((s) => [s.properties?.title, s]),
  );
  const required = ["Обзор", "Операции", "Счета", "Категории", SUPPORT_SHEET];
  for (const title of required) {
    if (typeof byTitle.get(title)?.properties?.sheetId !== "number") {
      throw createErrorPayload(
        "GOOGLE_API_ERROR",
        `В таблице отсутствует управляемый лист «${title}»`,
      );
    }
  }
  const requests: Record<string, unknown>[] = [];
  const overview = byTitle.get("Обзор")!.properties!.sheetId!,
    operations = byTitle.get("Операции")!.properties!.sheetId!,
    accounts = byTitle.get("Счета")!.properties!.sheetId!,
    categories = byTitle.get("Категории")!.properties!.sheetId!,
    support = byTitle.get(SUPPORT_SHEET)!.properties!.sheetId!;
  const mainSheets = [
    ["Обзор", overview, 60, 12],
    ["Операции", operations, Math.max(6, rowCounts.operations + 5), 13],
    ["Счета", accounts, Math.max(9, rowCounts.accounts + 8), 9],
    ["Категории", categories, Math.max(6, rowCounts.categories + 4), 9],
  ] as const;
  for (const [title, id, endRow, endColumn] of mainSheets) {
    const sheet = byTitle.get(title)!;
    if (title === "Обзор") {
      for (const chart of sheet.charts ?? []) {
        if (chart.chartId != null) {
          requests.push({ deleteEmbeddedObject: { objectId: chart.chartId } });
        }
      }
    }
    for (const band of sheet.bandedRanges ?? []) {
      if (band.bandedRangeId != null) {
        requests.push({ deleteBanding: { bandedRangeId: band.bandedRangeId } });
      }
    }
    for (
      let index = (sheet.conditionalFormats?.length ?? 0) - 1;
      index >= 0;
      index--
    ) requests.push({ deleteConditionalFormatRule: { sheetId: id, index } });
    requests.push({
      unmergeCells: {
        range: range(
          id,
          0,
          title === "Обзор" ? 60 : title === "Счета" ? 6 : 3,
          0,
          endColumn,
        ),
      },
    }, {
      updateSheetProperties: {
        properties: {
          sheetId: id,
          gridProperties: {
            frozenRowCount: title === "Операции"
              ? 4
              : title === "Счета"
              ? 7
              : title === "Категории"
              ? 4
              : 0,
            hideGridlines: true,
          },
        },
        fields: "gridProperties(frozenRowCount,hideGridlines)",
      },
    }, {
      repeatCell: {
        range: range(id, 0, endRow, 0, endColumn),
        cell: {
          userEnteredFormat: {
            backgroundColor: rgb(.973, .98, .988),
            textFormat: {
              foregroundColor: rgb(.067, .094, .153),
              fontFamily: "Arial",
              fontSize: 10,
              bold: false,
            },
            verticalAlignment: "MIDDLE",
            wrapStrategy: "CLIP",
          },
        },
        fields: "userEnteredFormat",
      },
    });
  }
  requests.push(
    ...[0, 1, 2, 3, 13].map((row) => ({
      mergeCells: {
        range: range(overview, row, row + 1, 0, 12),
        mergeType: "MERGE_ALL",
      },
    })),
    ...[5, 6, 7, 9, 10, 11].flatMap((row) =>
      [[0, 3], [3, 6], [6, 9], [9, 12]].map(([start, end]) => ({
        mergeCells: {
          range: range(overview, row, row + 1, start, end),
          mergeType: "MERGE_ALL",
        },
      }))
    ),
    ...[15, 32].flatMap((row) =>
      [[0, 6], [6, 12]].map(([start, end]) => ({
        mergeCells: {
          range: range(overview, row, row + 1, start, end),
          mergeType: "MERGE_ALL",
        },
      }))
    ),
    {
      repeatCell: {
        range: range(overview, 0, 1, 0, 12),
        cell: {
          userEnteredFormat: {
            backgroundColor: rgb(.973, .98, .988),
            textFormat: {
              foregroundColor: rgb(.067, .094, .153),
              fontFamily: "Arial",
              fontSize: 20,
              bold: true,
            },
            horizontalAlignment: "LEFT",
          },
        },
        fields: "userEnteredFormat",
      },
    },
    {
      repeatCell: {
        range: range(overview, 1, 4, 0, 12),
        cell: {
          userEnteredFormat: {
            textFormat: {
              foregroundColor: rgb(.39, .45, .55),
              fontFamily: "Arial",
              fontSize: 10,
            },
            horizontalAlignment: "LEFT",
          },
        },
        fields: "userEnteredFormat",
      },
    },
    {
      repeatCell: {
        range: range(overview, 13, 14, 0, 12),
        cell: {
          userEnteredFormat: {
            textFormat: {
              foregroundColor: rgb(.067, .094, .153),
              fontFamily: "Arial",
              fontSize: 14,
              bold: true,
            },
          },
        },
        fields: "userEnteredFormat",
      },
    },
    ...[15, 32].map((row) => ({
      repeatCell: {
        range: range(overview, row, row + 1, 0, 12),
        cell: {
          userEnteredFormat: {
            backgroundColor: rgb(1, 1, 1),
            textFormat: { foregroundColor: rgb(.55, .58, .63), fontSize: 10 },
            horizontalAlignment: "CENTER",
          },
        },
        fields: "userEnteredFormat",
      },
    })),
    ...[[0, 3], [3, 6], [6, 9], [9, 12]].flatMap(([start, end], index) => [
      {
        repeatCell: {
          range: range(overview, 5, 8, start, end),
          cell: {
            userEnteredFormat: {
              backgroundColor: rgb(1, 1, 1),
              borders: {
                top: { style: "SOLID", color: rgb(.9, .91, .93) },
                bottom: { style: "SOLID", color: rgb(.9, .91, .93) },
                left: { style: "SOLID", color: rgb(.9, .91, .93) },
                right: { style: "SOLID", color: rgb(.9, .91, .93) },
              },
              wrapStrategy: "WRAP",
            },
          },
          fields: "userEnteredFormat",
        },
      },
      {
        repeatCell: {
          range: range(overview, 9, 12, start, end),
          cell: {
            userEnteredFormat: {
              backgroundColor: rgb(1, 1, 1),
              borders: {
                top: { style: "SOLID", color: rgb(.9, .91, .93) },
                bottom: { style: "SOLID", color: rgb(.9, .91, .93) },
                left: { style: "SOLID", color: rgb(.9, .91, .93) },
                right: { style: "SOLID", color: rgb(.9, .91, .93) },
              },
              wrapStrategy: "WRAP",
            },
          },
          fields: "userEnteredFormat",
        },
      },
      {
        repeatCell: {
          range: range(overview, 5, 6, start, end),
          cell: {
            userEnteredFormat: {
              textFormat: {
                foregroundColor: index === 1
                  ? rgb(.09, .45, .25)
                  : index === 2
                  ? rgb(.72, .18, .2)
                  : rgb(.39, .45, .55),
                fontSize: 10,
                bold: true,
              },
            },
          },
          fields: "userEnteredFormat.textFormat",
        },
      },
      {
        repeatCell: {
          range: range(overview, 6, 7, start, end),
          cell: {
            userEnteredFormat: {
              textFormat: {
                foregroundColor: index === 1
                  ? rgb(.09, .45, .25)
                  : index === 2
                  ? rgb(.72, .18, .2)
                  : rgb(.067, .094, .153),
                fontSize: 16,
                bold: true,
              },
              wrapStrategy: "WRAP",
            },
          },
          fields: "userEnteredFormat",
        },
      },
      {
        repeatCell: {
          range: range(overview, 10, 11, start, end),
          cell: {
            userEnteredFormat: {
              textFormat: {
                foregroundColor: rgb(.067, .094, .153),
                fontSize: 16,
                bold: true,
              },
              wrapStrategy: "WRAP",
            },
          },
          fields: "userEnteredFormat",
        },
      },
    ]),
    ...[[operations, 3, 13], [accounts, 6, 9], [categories, 3, 9]].map((
      [id, row, end],
    ) => ({
      repeatCell: {
        range: range(id, row, row + 1, 0, end),
        cell: {
          userEnteredFormat: {
            backgroundColor: rgb(.067, .094, .153),
            textFormat: {
              foregroundColor: rgb(1, 1, 1),
              fontFamily: "Arial",
              fontSize: 10,
              bold: true,
            },
            horizontalAlignment: "CENTER",
            wrapStrategy: "WRAP",
          },
        },
        fields: "userEnteredFormat",
      },
    })),
    ...[[operations, 0, 13], [accounts, 0, 9], [categories, 0, 9]].flatMap((
      [id, , end],
    ) => [
      {
        mergeCells: { range: range(id, 0, 1, 0, end), mergeType: "MERGE_ALL" },
      },
      {
        mergeCells: { range: range(id, 1, 2, 0, end), mergeType: "MERGE_ALL" },
      },
      {
        repeatCell: {
          range: range(id, 0, 1, 0, end),
          cell: {
            userEnteredFormat: {
              textFormat: {
                foregroundColor: rgb(.067, .094, .153),
                fontSize: 18,
                bold: true,
              },
            },
          },
          fields: "userEnteredFormat.textFormat",
        },
      },
      {
        repeatCell: {
          range: range(id, 1, 2, 0, end),
          cell: {
            userEnteredFormat: {
              textFormat: { foregroundColor: rgb(.39, .45, .55), fontSize: 9 },
            },
          },
          fields: "userEnteredFormat.textFormat",
        },
      },
    ]),
    ...[3, 4].flatMap((row) =>
      [[0, 3], [3, 6], [6, 9]].map(([start, end]) => ({
        mergeCells: {
          range: range(accounts, row, row + 1, start, end),
          mergeType: "MERGE_ALL",
        },
      }))
    ),
    {
      repeatCell: {
        range: range(accounts, 3, 5, 0, 9),
        cell: {
          userEnteredFormat: {
            backgroundColor: rgb(1, 1, 1),
            borders: {
              top: { style: "SOLID", color: rgb(.9, .91, .93) },
              bottom: { style: "SOLID", color: rgb(.9, .91, .93) },
              left: { style: "SOLID", color: rgb(.9, .91, .93) },
              right: { style: "SOLID", color: rgb(.9, .91, .93) },
            },
            wrapStrategy: "WRAP",
          },
        },
        fields: "userEnteredFormat",
      },
    },
    {
      repeatCell: {
        range: range(accounts, 3, 4, 0, 9),
        cell: {
          userEnteredFormat: {
            textFormat: {
              foregroundColor: rgb(.39, .45, .55),
              fontSize: 9,
              bold: true,
            },
          },
        },
        fields: "userEnteredFormat.textFormat",
      },
    },
    {
      repeatCell: {
        range: range(accounts, 4, 5, 0, 9),
        cell: {
          userEnteredFormat: {
            textFormat: {
              foregroundColor: rgb(.067, .094, .153),
              fontSize: 14,
              bold: true,
            },
            wrapStrategy: "WRAP",
          },
        },
        fields: "userEnteredFormat",
      },
    },
    {
      repeatCell: {
        range: range(
          operations,
          4,
          Math.max(6, rowCounts.operations + 5),
          7,
          8,
        ),
        cell: {
          userEnteredFormat: {
            numberFormat: { type: "NUMBER", pattern: "#,##0.00" },
            horizontalAlignment: "RIGHT",
          },
        },
        fields: "userEnteredFormat(numberFormat,horizontalAlignment)",
      },
    },
    {
      repeatCell: {
        range: range(accounts, 7, Math.max(9, rowCounts.accounts + 8), 3, 4),
        cell: {
          userEnteredFormat: {
            numberFormat: { type: "NUMBER", pattern: "#,##0.00" },
            horizontalAlignment: "RIGHT",
          },
        },
        fields: "userEnteredFormat(numberFormat,horizontalAlignment)",
      },
    },
    {
      addBanding: {
        bandedRange: {
          range: range(
            operations,
            3,
            Math.max(6, rowCounts.operations + 5),
            0,
            13,
          ),
          rowProperties: {
            headerColor: rgb(.067, .094, .153),
            firstBandColor: rgb(1, 1, 1),
            secondBandColor: rgb(.973, .98, .988),
          },
        },
      },
    },
    {
      setBasicFilter: {
        filter: {
          range: range(
            operations,
            3,
            Math.max(6, rowCounts.operations + 5),
            0,
            13,
          ),
        },
      },
    },
    {
      setBasicFilter: {
        filter: {
          range: range(accounts, 6, Math.max(9, rowCounts.accounts + 8), 0, 9),
        },
      },
    },
    {
      setBasicFilter: {
        filter: {
          range: range(
            categories,
            3,
            Math.max(5, rowCounts.categories + 4),
            0,
            9,
          ),
        },
      },
    },
    ...[["Доход", rgb(.09, .45, .25), rgb(.91, .97, .93)], [
      "Расход",
      rgb(.72, .18, .2),
      rgb(.99, .93, .93),
    ], ["Перевод", rgb(.16, .35, .62), rgb(.92, .95, .99)]].map((
      [label, color, background],
    ) => ({
      addConditionalFormatRule: {
        rule: {
          ranges: [
            range(operations, 4, Math.max(6, rowCounts.operations + 5), 3, 4),
          ],
          booleanRule: {
            condition: {
              type: "TEXT_EQ",
              values: [{ userEnteredValue: label }],
            },
            format: {
              backgroundColor: background,
              textFormat: { foregroundColor: color, bold: true },
            },
          },
        },
        index: 0,
      },
    })),
    {
      addConditionalFormatRule: {
        rule: {
          ranges: [
            range(accounts, 7, Math.max(9, rowCounts.accounts + 8), 3, 4),
          ],
          booleanRule: {
            condition: {
              type: "NUMBER_LESS",
              values: [{ userEnteredValue: "0" }],
            },
            format: {
              textFormat: { foregroundColor: rgb(.72, .18, .2), bold: true },
            },
          },
        },
        index: 0,
      },
    },
    {
      addConditionalFormatRule: {
        rule: {
          ranges: [
            range(accounts, 7, Math.max(9, rowCounts.accounts + 8), 0, 9),
          ],
          booleanRule: {
            condition: {
              type: "CUSTOM_FORMULA",
              values: [{ userEnteredValue: '=$F8="Да"' }],
            },
            format: {
              backgroundColor: rgb(.94, .95, .96),
              textFormat: { foregroundColor: rgb(.55, .58, .63) },
            },
          },
        },
        index: 0,
      },
    },
    ...[["Расход", rgb(.72, .18, .2), rgb(.99, .94, .94)], [
      "Доход",
      rgb(.09, .45, .25),
      rgb(.93, .98, .94),
    ]].map(([label, color, background]) => ({
      addConditionalFormatRule: {
        rule: {
          ranges: [
            range(categories, 4, Math.max(6, rowCounts.categories + 4), 2, 3),
          ],
          booleanRule: {
            condition: {
              type: "TEXT_EQ",
              values: [{ userEnteredValue: label }],
            },
            format: {
              backgroundColor: background,
              textFormat: { foregroundColor: color, bold: true },
            },
          },
        },
        index: 0,
      },
    })),
    {
      repeatCell: {
        range: range(
          operations,
          4,
          Math.max(6, rowCounts.operations + 5),
          1,
          2,
        ),
        cell: {
          userEnteredFormat: {
            numberFormat: { type: "DATE", pattern: "dd.mm.yyyy" },
          },
        },
        fields: "userEnteredFormat.numberFormat",
      },
    },
    {
      repeatCell: {
        range: range(
          operations,
          4,
          Math.max(6, rowCounts.operations + 5),
          2,
          3,
        ),
        cell: {
          userEnteredFormat: {
            numberFormat: { type: "TIME", pattern: "hh:mm" },
          },
        },
        fields: "userEnteredFormat.numberFormat",
      },
    },
    {
      repeatCell: {
        range: range(
          operations,
          4,
          Math.max(6, rowCounts.operations + 5),
          9,
          10,
        ),
        cell: { userEnteredFormat: { wrapStrategy: "WRAP" } },
        fields: "userEnteredFormat.wrapStrategy",
      },
    },
    {
      repeatCell: {
        range: range(
          operations,
          4,
          Math.max(6, rowCounts.operations + 5),
          11,
          13,
        ),
        cell: {
          userEnteredFormat: {
            numberFormat: { type: "DATE_TIME", pattern: "dd.mm.yyyy hh:mm" },
          },
        },
        fields: "userEnteredFormat.numberFormat",
      },
    },
  );
  for (
    const [id, widths] of [
      [overview, Array(12).fill(92)],
      [operations, [
        70,
        90,
        65,
        90,
        140,
        140,
        140,
        105,
        70,
        240,
        125,
        145,
        145,
      ]],
      [accounts, [70, 175, 115, 110, 75, 85, 135, 145, 145]],
      [categories, [65, 175, 95, 110, 110, 105, 145, 145, 70]],
    ] as Array<[number, number[]]>
  ) {
    widths.forEach((pixelSize, index) =>
      requests.push({
        updateDimensionProperties: {
          range: {
            sheetId: id,
            dimension: "COLUMNS",
            startIndex: index,
            endIndex: index + 1,
          },
          properties: { pixelSize },
          fields: "pixelSize",
        },
      })
    );
  }
  for (
    const [id, rows] of [
      [overview, [
        [0, 34],
        [1, 22],
        [2, 20],
        [3, 20],
        [5, 24],
        [6, 42],
        [7, 24],
        [9, 24],
        [10, 38],
        [11, 24],
        [13, 28],
      ]],
      [operations, [[0, 30], [1, 20], [3, 34]]],
      [accounts, [[0, 30], [1, 20], [3, 34], [6, 34]]],
      [categories, [[0, 30], [1, 20], [3, 34]]],
    ] as Array<[number, number[][]]>
  ) {
    for (const [row, pixelSize] of rows) {
      requests.push({
        updateDimensionProperties: {
          range: {
            sheetId: id,
            dimension: "ROWS",
            startIndex: row,
            endIndex: row + 1,
          },
          properties: { pixelSize },
          fields: "pixelSize",
        },
      });
    }
  }
  requests.push({
    updateSheetProperties: {
      properties: {
        sheetId: support,
        hidden: true,
        gridProperties: { hideGridlines: true },
      },
      fields: "hidden,gridProperties.hideGridlines",
    },
  });
  const addChart = (
    title: string,
    type: string,
    startCol: number,
    endCol: number,
    rows: number,
    anchorRow: number,
    anchorCol: number,
    seriesStart = startCol + 1,
  ) => {
    if (rows < 1) return;
    requests.push({
      addChart: {
        chart: {
          spec: {
            title,
            titleTextFormat: {
              foregroundColor: rgb(.067, .094, .153),
              fontFamily: "Arial",
              fontSize: 12,
              bold: true,
            },
            backgroundColorStyle: { rgbColor: rgb(1, 1, 1) },
            basicChart: {
              chartType: type,
              legendPosition: type === "COLUMN" ? "BOTTOM_LEGEND" : "NO_LEGEND",
              axis: [{ position: "BOTTOM_AXIS" }, { position: "LEFT_AXIS" }],
              domains: [{
                domain: {
                  sourceRange: {
                    sources: [
                      range(support, 0, 1 + rows, startCol, startCol + 1),
                    ],
                  },
                },
              }],
              series: Array.from(
                { length: endCol - seriesStart },
                (_, index) => ({
                  series: {
                    sourceRange: {
                      sources: [
                        range(
                          support,
                          0,
                          1 + rows,
                          seriesStart + index,
                          seriesStart + 1 + index,
                        ),
                      ],
                    },
                  },
                  targetAxis: type === "BAR" ? "BOTTOM_AXIS" : "LEFT_AXIS",
                }),
              ),
              headerCount: 1,
            },
          },
          position: {
            overlayPosition: {
              anchorCell: {
                sheetId: overview,
                rowIndex: anchorRow,
                columnIndex: anchorCol,
              },
              widthPixels: 520,
              heightPixels: 250,
            },
          },
        },
      },
    });
  };
  addChart(
    "Доходы и расходы по месяцам",
    "COLUMN",
    0,
    3,
    chartRows.monthly,
    15,
    0,
  );
  addChart("Расходы по категориям", "BAR", 5, 7, chartRows.categories, 15, 6);
  addChart(
    "Динамика чистого результата",
    "LINE",
    0,
    4,
    chartRows.monthly,
    31,
    0,
    3,
  );
  addChart("Средства по счетам", "BAR", 8, 10, chartRows.accounts, 31, 6);
  return requests;
}

export function buildLegacyAccountingFormattingRequests(
  metadata: { sheets?: Sheet[] },
  rowCounts: {
    overview: number;
    operations: number;
    accounts: number;
    categories: number;
  },
  layout: {
    overviewSectionRows: number[];
    overviewHeaderRows: number[];
    accountHeaderRow: number;
    categoryDividerRows: number[];
  },
) {
  const byTitle = new Map(
    (metadata.sheets ?? []).map((sheet) => [sheet.properties?.title, sheet]),
  );
  const required = ["Обзор", "Операции", "Счета", "Категории", SUPPORT_SHEET];
  for (const title of required) {
    if (typeof byTitle.get(title)?.properties?.sheetId !== "number") {
      throw createErrorPayload(
        "GOOGLE_API_ERROR",
        `В таблице отсутствует управляемый лист «${title}»`,
      );
    }
  }
  const ids = Object.fromEntries(
    required.map((title) => [title, byTitle.get(title)!.properties!.sheetId!]),
  ) as Record<string, number>;
  const requests: Record<string, unknown>[] = [];
  const sheetRows: Record<string, number> = {
    "Обзор": rowCounts.overview,
    "Операции": Math.max(6, rowCounts.operations),
    "Счета": Math.max(layout.accountHeaderRow + 2, rowCounts.accounts),
    "Категории": Math.max(6, rowCounts.categories),
  };
  const sheetColumns: Record<string, number> = {
    "Обзор": 6,
    "Операции": 13,
    "Счета": 9,
    "Категории": 9,
  };
  const none = { style: "NONE" };
  const thin = { style: "SOLID", color: rgb(.87, .88, .9) };

  for (const title of ["Обзор", "Операции", "Счета", "Категории"]) {
    const sheet = byTitle.get(title)!,
      sheetId = ids[title],
      endRow = sheetRows[title],
      endColumn = sheetColumns[title];
    if (title === "Обзор") {
      for (const chart of sheet.charts ?? []) {
        if (chart.chartId != null) {
          requests.push({ deleteEmbeddedObject: { objectId: chart.chartId } });
        }
      }
    }
    for (const band of sheet.bandedRanges ?? []) {
      if (band.bandedRangeId != null) {
        requests.push({ deleteBanding: { bandedRangeId: band.bandedRangeId } });
      }
    }
    for (
      let index = (sheet.conditionalFormats?.length ?? 0) - 1;
      index >= 0;
      index--
    ) requests.push({ deleteConditionalFormatRule: { sheetId, index } });
    requests.push(
      { clearBasicFilter: { sheetId } },
      { unmergeCells: { range: range(sheetId, 0, endRow, 0, endColumn) } },
      {
        updateSheetProperties: {
          properties: {
            sheetId,
            gridProperties: {
              frozenRowCount: title === "Операции"
                ? 4
                : title === "Счета"
                ? layout.accountHeaderRow + 1
                : title === "Категории"
                ? 4
                : 3,
              hideGridlines: false,
            },
          },
          fields: "gridProperties(frozenRowCount,hideGridlines)",
        },
      },
      {
        repeatCell: {
          range: range(sheetId, 0, endRow, 0, endColumn),
          cell: {
            userEnteredFormat: {
              backgroundColor: rgb(1, 1, 1),
              textFormat: {
                foregroundColor: rgb(.12, .13, .15),
                fontFamily: "Arial",
                fontSize: 10,
                bold: false,
              },
              verticalAlignment: "MIDDLE",
              wrapStrategy: "CLIP",
              borders: { top: none, bottom: none, left: none, right: none },
            },
          },
          fields: "userEnteredFormat",
        },
      },
    );
  }

  for (
    const [title, columns] of [["Обзор", 6], ["Операции", 13], ["Счета", 9], [
      "Категории",
      9,
    ]] as Array<[string, number]>
  ) {
    const sheetId = ids[title];
    requests.push(
      {
        mergeCells: {
          range: range(sheetId, 0, 1, 0, columns),
          mergeType: "MERGE_ALL",
        },
      },
      {
        mergeCells: {
          range: range(sheetId, 1, 2, 0, columns),
          mergeType: "MERGE_ALL",
        },
      },
      {
        repeatCell: {
          range: range(sheetId, 0, 1, 0, columns),
          cell: {
            userEnteredFormat: {
              textFormat: {
                foregroundColor: rgb(.12, .13, .15),
                fontFamily: "Arial",
                fontSize: 14,
                bold: true,
              },
              horizontalAlignment: "LEFT",
            },
          },
          fields: "userEnteredFormat",
        },
      },
      {
        repeatCell: {
          range: range(sheetId, 1, title === "Обзор" ? 3 : 2, 0, columns),
          cell: {
            userEnteredFormat: {
              textFormat: {
                foregroundColor: rgb(.42, .45, .5),
                fontFamily: "Arial",
                fontSize: 9,
              },
              horizontalAlignment: "LEFT",
            },
          },
          fields: "userEnteredFormat",
        },
      },
    );
  }

  const headerFormat = (sheetId: number, row: number, columns: number) => ({
    repeatCell: {
      range: range(sheetId, row, row + 1, 0, columns),
      cell: {
        userEnteredFormat: {
          backgroundColor: rgb(.18, .2, .23),
          textFormat: {
            foregroundColor: rgb(1, 1, 1),
            fontFamily: "Arial",
            fontSize: 10,
            bold: true,
          },
          horizontalAlignment: "CENTER",
          verticalAlignment: "MIDDLE",
          wrapStrategy: "WRAP",
          borders: { top: thin, bottom: thin, left: thin, right: thin },
        },
      },
      fields: "userEnteredFormat",
    },
  });
  requests.push(
    headerFormat(ids["Операции"], 3, 13),
    headerFormat(ids["Счета"], layout.accountHeaderRow, 9),
    headerFormat(ids["Категории"], 3, 9),
  );
  for (const row of layout.overviewHeaderRows) {
    requests.push(
      headerFormat(
        ids["Обзор"],
        row,
        row === layout.overviewHeaderRows.at(-1)
          ? 6
          : row === layout.overviewHeaderRows[0]
          ? 3
          : 5,
      ),
    );
  }
  for (const row of layout.overviewSectionRows) {
    requests.push({
      mergeCells: {
        range: range(ids["Обзор"], row, row + 1, 0, 5),
        mergeType: "MERGE_ALL",
      },
    }, {
      repeatCell: {
        range: range(ids["Обзор"], row, row + 1, 0, 5),
        cell: {
          userEnteredFormat: {
            backgroundColor: rgb(.93, .94, .95),
            textFormat: {
              foregroundColor: rgb(.18, .2, .23),
              fontSize: 10,
              bold: true,
            },
          },
        },
        fields: "userEnteredFormat",
      },
    });
  }
  requests.push({
    repeatCell: {
      range: range(ids["Счета"], 3, 4, 0, 3),
      cell: {
        userEnteredFormat: {
          backgroundColor: rgb(.93, .94, .95),
          textFormat: { bold: true },
        },
      },
      fields: "userEnteredFormat",
    },
  }, headerFormat(ids["Счета"], 4, 3));
  for (const row of layout.categoryDividerRows) {
    requests.push({
      mergeCells: {
        range: range(ids["Категории"], row, row + 1, 0, 9),
        mergeType: "MERGE_ALL",
      },
    }, {
      repeatCell: {
        range: range(ids["Категории"], row, row + 1, 0, 9),
        cell: {
          userEnteredFormat: {
            backgroundColor: rgb(.93, .94, .95),
            textFormat: { foregroundColor: rgb(.3, .32, .36), bold: true },
          },
        },
        fields: "userEnteredFormat",
      },
    });
  }

  const tableBorder = (
    sheetId: number,
    startRowIndex: number,
    endRowIndex: number,
    endColumnIndex: number,
  ) => ({
    updateBorders: {
      range: range(sheetId, startRowIndex, endRowIndex, 0, endColumnIndex),
      top: thin,
      bottom: thin,
      left: thin,
      right: thin,
      innerHorizontal: thin,
      innerVertical: thin,
    },
  });
  requests.push(
    tableBorder(ids["Операции"], 3, Math.max(6, rowCounts.operations), 13),
    tableBorder(
      ids["Счета"],
      4,
      Math.max(layout.accountHeaderRow + 2, rowCounts.accounts),
      9,
    ),
    tableBorder(ids["Категории"], 3, Math.max(6, rowCounts.categories), 9),
  );
  for (let index = 0; index < layout.overviewHeaderRows.length; index++) {
    const start = layout.overviewHeaderRows[index],
      end = index + 1 < layout.overviewSectionRows.length
        ? layout.overviewSectionRows[index + 1]
        : rowCounts.overview;
    requests.push(
      tableBorder(
        ids["Обзор"],
        start,
        Math.max(start + 2, end),
        index === layout.overviewHeaderRows.length - 1
          ? 6
          : index === 0
          ? 3
          : 5,
      ),
    );
  }

  requests.push(
    {
      addBanding: {
        bandedRange: {
          range: range(
            ids["Операции"],
            3,
            Math.max(6, rowCounts.operations),
            0,
            13,
          ),
          rowProperties: {
            headerColor: rgb(.18, .2, .23),
            firstBandColor: rgb(1, 1, 1),
            secondBandColor: rgb(.97, .97, .975),
          },
        },
      },
    },
    {
      setBasicFilter: {
        filter: {
          range: range(
            ids["Операции"],
            3,
            Math.max(6, rowCounts.operations),
            0,
            13,
          ),
        },
      },
    },
    {
      setBasicFilter: {
        filter: {
          range: range(
            ids["Счета"],
            layout.accountHeaderRow,
            Math.max(layout.accountHeaderRow + 2, rowCounts.accounts),
            0,
            9,
          ),
        },
      },
    },
  );

  const operationEnd = Math.max(6, rowCounts.operations);
  const conditional = (
    targetRange: ReturnType<typeof range>,
    formula: string,
    color: ReturnType<typeof rgb>,
    background?: ReturnType<typeof rgb>,
  ) => ({
    addConditionalFormatRule: {
      rule: {
        ranges: [targetRange],
        booleanRule: {
          condition: {
            type: "CUSTOM_FORMULA",
            values: [{ userEnteredValue: formula }],
          },
          format: {
            backgroundColor: background,
            textFormat: { foregroundColor: color, bold: true },
          },
        },
      },
      index: 0,
    },
  });
  for (
    const [type, color, background] of [
      ["Доход", rgb(.09, .43, .22), rgb(.92, .97, .93)],
      ["Расход", rgb(.7, .16, .18), rgb(.99, .93, .93)],
      ["Перевод", rgb(.14, .32, .58), rgb(.92, .95, .99)],
    ] as const
  ) {
    requests.push(
      conditional(
        range(ids["Операции"], 4, operationEnd, 2, 3),
        `=$C5="${type}"`,
        color,
        background,
      ),
      conditional(
        range(ids["Операции"], 4, operationEnd, 7, 8),
        `=$C5="${type}"`,
        color,
      ),
    );
  }
  requests.push(
    conditional(
      range(
        ids["Счета"],
        layout.accountHeaderRow + 1,
        Math.max(layout.accountHeaderRow + 2, rowCounts.accounts),
        2,
        3,
      ),
      `=$C${layout.accountHeaderRow + 2}<0`,
      rgb(.7, .16, .18),
    ),
    conditional(
      range(
        ids["Счета"],
        layout.accountHeaderRow + 1,
        Math.max(layout.accountHeaderRow + 2, rowCounts.accounts),
        0,
        9,
      ),
      `=$E${layout.accountHeaderRow + 2}="Архивный"`,
      rgb(.5, .52, .55),
      rgb(.95, .95, .955),
    ),
  );

  requests.push(
    {
      repeatCell: {
        range: range(ids["Операции"], 4, operationEnd, 0, 1),
        cell: {
          userEnteredFormat: {
            numberFormat: { type: "DATE", pattern: "dd.mm.yyyy" },
            horizontalAlignment: "CENTER",
          },
        },
        fields: "userEnteredFormat(numberFormat,horizontalAlignment)",
      },
    },
    {
      repeatCell: {
        range: range(ids["Операции"], 4, operationEnd, 1, 2),
        cell: {
          userEnteredFormat: {
            numberFormat: { type: "TIME", pattern: "hh:mm" },
            horizontalAlignment: "CENTER",
          },
        },
        fields: "userEnteredFormat(numberFormat,horizontalAlignment)",
      },
    },
    {
      repeatCell: {
        range: range(ids["Операции"], 4, operationEnd, 6, 7),
        cell: {
          userEnteredFormat: {
            wrapStrategy: "WRAP",
            horizontalAlignment: "LEFT",
          },
        },
        fields: "userEnteredFormat(wrapStrategy,horizontalAlignment)",
      },
    },
    {
      repeatCell: {
        range: range(ids["Операции"], 4, operationEnd, 7, 8),
        cell: {
          userEnteredFormat: {
            numberFormat: { type: "NUMBER", pattern: "#,##0.00" },
            horizontalAlignment: "RIGHT",
          },
        },
        fields: "userEnteredFormat(numberFormat,horizontalAlignment)",
      },
    },
    {
      repeatCell: {
        range: range(ids["Операции"], 4, operationEnd, 10, 11),
        cell: {
          userEnteredFormat: {
            textFormat: { foregroundColor: rgb(.55, .57, .61), fontSize: 8 },
          },
        },
        fields: "userEnteredFormat.textFormat",
      },
    },
    {
      repeatCell: {
        range: range(ids["Операции"], 4, operationEnd, 11, 13),
        cell: {
          userEnteredFormat: {
            numberFormat: { type: "DATE_TIME", pattern: "dd.mm.yyyy hh:mm" },
            horizontalAlignment: "CENTER",
          },
        },
        fields: "userEnteredFormat(numberFormat,horizontalAlignment)",
      },
    },
  );

  const widths: Array<[number, number[]]> = [
    [ids["Обзор"], [210, 120, 85, 110, 90, 85]],
    [ids["Операции"], [
      95,
      70,
      90,
      150,
      150,
      140,
      290,
      110,
      75,
      130,
      200,
      150,
      150,
    ]],
    [ids["Счета"], [170, 115, 110, 75, 95, 150, 150, 150, 200]],
    [ids["Категории"], [65, 180, 95, 120, 115, 105, 150, 150, 200]],
  ];
  for (const [sheetId, values] of widths) {
    values.forEach((pixelSize, index) =>
      requests.push({
        updateDimensionProperties: {
          range: {
            sheetId,
            dimension: "COLUMNS",
            startIndex: index,
            endIndex: index + 1,
          },
          properties: { pixelSize },
          fields: "pixelSize",
        },
      })
    );
  }
  for (
    const [sheetId, headerRows] of [
      [ids["Операции"], [3]],
      [ids["Счета"], [4, layout.accountHeaderRow]],
      [ids["Категории"], [3]],
      [ids["Обзор"], layout.overviewHeaderRows],
    ] as Array<[number, number[]]>
  ) {
    for (const row of headerRows) {
      requests.push({
        updateDimensionProperties: {
          range: {
            sheetId,
            dimension: "ROWS",
            startIndex: row,
            endIndex: row + 1,
          },
          properties: { pixelSize: 34 },
          fields: "pixelSize",
        },
      });
    }
  }
  requests.push({
    updateDimensionProperties: {
      range: {
        sheetId: ids["Операции"],
        dimension: "ROWS",
        startIndex: 4,
        endIndex: operationEnd,
      },
      properties: { pixelSize: 26 },
      fields: "pixelSize",
    },
  }, {
    updateSheetProperties: {
      properties: {
        sheetId: ids[SUPPORT_SHEET],
        hidden: true,
        gridProperties: { hideGridlines: true },
      },
      fields: "hidden,gridProperties.hideGridlines",
    },
  });
  return requests;
}

type MergeSpec = [number, number, number, number];
type AccountingValues = {
  overview: unknown[][];
  operations: unknown[][];
  accounts: unknown[][];
  categories: unknown[][];
};
type AccountingLayout = {
  overviewMerges: MergeSpec[];
  dynamicsSectionRow: number;
  latestSectionRow: number;
  accountHeaderRow: number;
  categoryDividerRows: number[];
  emptyOperations: boolean;
  emptyAccounts: boolean;
  emptyCategories: boolean;
};

export function validateAccountingLayout(
  metadata: { sheets?: Sheet[] },
  values: AccountingValues,
  layout: AccountingLayout,
) {
  const columns = { overview: 7, operations: 18, accounts: 9, categories: 9 };
  const titles = {
    overview: "Обзор",
    operations: "Операции",
    accounts: "Счета",
    categories: "Категории",
  } as const;
  const errors: string[] = [];
  for (const key of Object.keys(columns) as Array<keyof typeof columns>) {
    const sheet = metadata.sheets?.find((item) =>
      item.properties?.title === titles[key]
    );
    const grid = sheet?.properties?.gridProperties;
    if (!sheet || typeof sheet.properties?.sheetId !== "number") {
      errors.push(`${titles[key]}: лист отсутствует`);
    }
    values[key].forEach((row, index) => {
      if (row.length > columns[key]) {
        errors.push(
          `${titles[key]}!${index + 1}: ${row.length} значений при ${
            columns[key]
          } колонках`,
        );
      }
    });
    if (
      (grid?.rowCount ?? 0) < values[key].length ||
      (grid?.columnCount ?? 0) < columns[key]
    ) {
      errors.push(`${titles[key]}: диапазон выходит за grid`);
    }
  }
  const mergeSets: Record<keyof AccountingValues, MergeSpec[]> = {
    overview: layout.overviewMerges,
    operations: [
      [0, 1, 0, 18],
      [1, 2, 0, 6],
      [1, 2, 7, 18],
      ...(layout.emptyOperations ? [[4, 5, 0, 18] as MergeSpec] : []),
    ],
    accounts: [
      [0, 1, 0, 9],
      [1, 2, 0, 4],
      [1, 2, 5, 9],
      ...(layout.emptyAccounts ? [[4, 5, 0, 9] as MergeSpec] : []),
    ],
    categories: [
      [0, 1, 0, 9],
      [1, 2, 0, 4],
      ...layout.categoryDividerRows.map((row) =>
        [row, row + 1, 0, 9] as MergeSpec
      ),
      ...(layout.emptyCategories ? [[4, 5, 0, 9] as MergeSpec] : []),
    ],
  };
  for (const key of Object.keys(mergeSets) as Array<keyof AccountingValues>) {
    const merges = mergeSets[key];
    merges.forEach(([sr, er, sc, ec], index) => {
      if (
        er <= sr || ec <= sc || sr < 0 || sc < 0 || er > values[key].length ||
        ec > columns[key]
      ) errors.push(`${titles[key]}: invalid merge ${index}`);
      for (let row = sr; row < er; row++) {
        for (let col = sc; col < ec; col++) {
          if (
            (row !== sr || col !== sc) &&
            values[key][row]?.[col] !== undefined &&
            values[key][row]?.[col] !== ""
          ) {
            errors.push(
              `${titles[key]}!R${row + 1}C${col + 1}: значение внутри merge`,
            );
          }
        }
      }
      for (let other = 0; other < index; other++) {
        const [osr, oer, osc, oec] = merges[other];
        if (sr < oer && er > osr && sc < oec && ec > osc) {
          errors.push(
            `${titles[key]}: merge ${index} пересекает merge ${other}`,
          );
        }
      }
    });
  }
  if (errors.length) {
    throw createErrorPayload(
      "GOOGLE_API_ERROR",
      `Некорректная модель оформления: ${errors.join("; ")}`,
    );
  }
  return {
    valid: true as const,
    sheets: 4,
    rows: Object.values(values).reduce((sum, rows) => sum + rows.length, 0),
  };
}

export function buildAccountingFormattingRequests(
  metadata: { sheets?: Sheet[] },
  values: AccountingValues,
  layout: AccountingLayout,
) {
  validateAccountingLayout(metadata, values, layout);
  const byTitle = new Map(
    (metadata.sheets ?? []).map((sheet) => [sheet.properties?.title, sheet]),
  );
  const id = (title: string) => byTitle.get(title)!.properties!.sheetId!;
  const ids = {
    overview: id("Обзор"),
    operations: id("Операции"),
    accounts: id("Счета"),
    categories: id("Категории"),
  };
  const requests: Record<string, unknown>[] = [];
  const colors = {
    text: rgb(.125, .13, .14),
    secondary: rgb(.373, .388, .408),
    light: rgb(.973, .976, .98),
    header: rgb(.216, .255, .318),
    border: rgb(.855, .863, .878),
    white: rgb(1, 1, 1),
    income: rgb(.094, .502, .22),
    expense: rgb(.851, .188, .145),
    transfer: rgb(.098, .404, .824),
  };
  const thin = { style: "SOLID", color: colors.border };
  const counts = {
    overview: values.overview.length,
    operations: values.operations.length,
    accounts: values.accounts.length,
    categories: values.categories.length,
  };
  const cols = { overview: 7, operations: 18, accounts: 9, categories: 9 };
  for (const key of Object.keys(ids) as Array<keyof typeof ids>) {
    requests.push({
      repeatCell: {
        range: range(ids[key], 0, counts[key], 0, cols[key]),
        cell: {
          userEnteredFormat: {
            backgroundColor: colors.white,
            textFormat: {
              foregroundColor: colors.text,
              fontFamily: "Arial",
              fontSize: 10,
              bold: false,
            },
            verticalAlignment: "MIDDLE",
            horizontalAlignment: "LEFT",
            wrapStrategy: "WRAP",
          },
        },
        fields: "userEnteredFormat",
      },
    });
  }
  const merges: Array<[number, MergeSpec[]]> = [
    [ids.overview, layout.overviewMerges],
    [ids.operations, [
      [0, 1, 0, 18],
      [1, 2, 0, 6],
      [1, 2, 7, 18],
      ...(layout.emptyOperations ? [[4, 5, 0, 18] as MergeSpec] : []),
    ]],
    [ids.accounts, [
      [0, 1, 0, 9],
      [1, 2, 0, 4],
      [1, 2, 5, 9],
      ...(layout.emptyAccounts ? [[4, 5, 0, 9] as MergeSpec] : []),
    ]],
    [ids.categories, [
      [0, 1, 0, 9],
      [1, 2, 0, 4],
      ...layout.categoryDividerRows.map((row) =>
        [row, row + 1, 0, 9] as MergeSpec
      ),
      ...(layout.emptyCategories ? [[4, 5, 0, 9] as MergeSpec] : []),
    ]],
  ];
  for (const [sheetId, specs] of merges) {
    for (const [sr, er, sc, ec] of specs) {
      requests.push({
        mergeCells: {
          range: range(sheetId, sr, er, sc, ec),
          mergeType: "MERGE_ALL",
        },
      });
    }
  }
  for (
    const [sheetId, widthValues] of [
      [ids.overview, [170, 120, 95, 30, 170, 120, 95]],
      [ids.operations, [
        95,
        65,
        90,
        140,
        140,
        140,
        260,
        110,
        70,
        95,
        110,
        80,
        110,
        100,
        125,
        210,
        145,
        145,
      ]],
      [ids.accounts, [180, 120, 115, 75, 100, 135, 145, 145, 210]],
      [ids.categories, [65, 180, 100, 90, 120, 75, 145, 145, 210]],
    ] as Array<[number, number[]]>
  ) {
    widthValues.forEach((pixelSize, index) =>
      requests.push({
        updateDimensionProperties: {
          range: {
            sheetId,
            dimension: "COLUMNS",
            startIndex: index,
            endIndex: index + 1,
          },
          properties: { pixelSize },
          fields: "pixelSize",
        },
      })
    );
  }
  for (
    const [key, sheetId] of Object.entries(ids) as Array<
      [keyof typeof ids, number]
    >
  ) {
    requests.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: "ROWS", startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 34 },
        fields: "pixelSize",
      },
    }, {
      updateDimensionProperties: {
        range: {
          sheetId,
          dimension: "ROWS",
          startIndex: key === "overview" ? 3 : 2,
          endIndex: key === "overview" ? 4 : 3,
        },
        properties: { pixelSize: 10 },
        fields: "pixelSize",
      },
    });
  }
  requests.push({
    updateDimensionProperties: {
      range: {
        sheetId: ids.operations,
        dimension: "ROWS",
        startIndex: 4,
        endIndex: counts.operations,
      },
      properties: { pixelSize: layout.emptyOperations ? 28 : 26 },
      fields: "pixelSize",
    },
  });
  const title = (sheetId: number, columns: number) => ({
    repeatCell: {
      range: range(sheetId, 0, 1, 0, columns),
      cell: {
        userEnteredFormat: {
          backgroundColor: colors.light,
          textFormat: {
            foregroundColor: colors.text,
            fontFamily: "Arial",
            fontSize: 16,
            bold: true,
          },
          verticalAlignment: "MIDDLE",
          horizontalAlignment: "LEFT",
          wrapStrategy: "WRAP",
        },
      },
      fields: "userEnteredFormat",
    },
  });
  requests.push(
    title(ids.overview, 7),
    title(ids.operations, 18),
    title(ids.accounts, 9),
    title(ids.categories, 9),
  );
  for (
    const [sheetId, rows, pixelSize] of [
      [
        ids.overview,
        [4, layout.dynamicsSectionRow, layout.latestSectionRow],
        26,
      ],
      [ids.operations, [3], 32],
      [ids.accounts, [3], 32],
      [ids.categories, [3, ...layout.categoryDividerRows], 26],
    ] as Array<[number, number[], number]>
  ) {
    for (const row of rows) {
      requests.push({
        updateDimensionProperties: {
          range: {
            sheetId,
            dimension: "ROWS",
            startIndex: row,
            endIndex: row + 1,
          },
          properties: { pixelSize },
          fields: "pixelSize",
        },
      });
    }
  }
  const header = (
    sheetId: number,
    row: number,
    start: number,
    end: number,
  ) => ({
    repeatCell: {
      range: range(sheetId, row, row + 1, start, end),
      cell: {
        userEnteredFormat: {
          backgroundColor: colors.header,
          textFormat: {
            foregroundColor: colors.white,
            fontFamily: "Arial",
            fontSize: 10,
            bold: true,
          },
          verticalAlignment: "MIDDLE",
          horizontalAlignment: "CENTER",
          wrapStrategy: "WRAP",
          borders: { top: thin, bottom: thin, left: thin, right: thin },
        },
      },
      fields: "userEnteredFormat",
    },
  });
  requests.push(
    header(ids.overview, 5, 0, 3),
    header(ids.overview, 5, 4, 7),
    header(ids.operations, 3, 0, 18),
    header(ids.accounts, 3, 0, 9),
    header(ids.categories, 3, 0, 9),
  );
  values.overview.forEach((row, index) => {
    if (row[0] === "Месяц") {
      requests.push(
        header(ids.overview, index, 0, 3),
        header(ids.overview, index, 4, 7),
      );
    }
  });
  requests.push(header(ids.overview, layout.latestSectionRow + 1, 0, 7));
  values.accounts.forEach((row, index) => {
    if (row[0] === "Валюта" && index > 3) {
      requests.push(header(ids.accounts, index, 0, 3));
    }
  });
  const sectionRows = [4, layout.dynamicsSectionRow, layout.latestSectionRow];
  for (const row of sectionRows) {
    requests.push({
      repeatCell: {
        range: range(ids.overview, row, row + 1, 0, 7),
        cell: {
          userEnteredFormat: {
            backgroundColor: colors.header,
            textFormat: {
              foregroundColor: colors.white,
              fontSize: 11,
              bold: true,
            },
            wrapStrategy: "WRAP",
          },
        },
        fields: "userEnteredFormat",
      },
    });
  }
  for (const row of layout.categoryDividerRows) {
    requests.push({
      repeatCell: {
        range: range(ids.categories, row, row + 1, 0, 9),
        cell: {
          userEnteredFormat: {
            backgroundColor: colors.light,
            textFormat: { foregroundColor: colors.secondary, bold: true },
          },
        },
        fields: "userEnteredFormat",
      },
    });
  }
  const border = (sheetId: number, rows: number, columns: number) => ({
    updateBorders: {
      range: range(sheetId, 3, rows, 0, columns),
      top: thin,
      bottom: thin,
      left: thin,
      right: thin,
      innerHorizontal: thin,
      innerVertical: thin,
    },
  });
  requests.push(
    border(ids.overview, counts.overview, 7),
    border(ids.operations, counts.operations, 18),
    border(ids.accounts, counts.accounts, 9),
    border(ids.categories, counts.categories, 9),
  );
  requests.push({
    addBanding: {
      bandedRange: {
        range: range(ids.operations, 3, counts.operations, 0, 18),
        rowProperties: {
          headerColor: colors.header,
          firstBandColor: colors.white,
          secondBandColor: colors.light,
        },
      },
    },
  }, {
    setBasicFilter: {
      filter: { range: range(ids.operations, 3, counts.operations, 0, 18) },
    },
  }, {
    setBasicFilter: {
      filter: {
        range: range(
          ids.accounts,
          3,
          Math.max(
            5,
            values.accounts.findIndex((row, index) =>
              index > 3 && row.length === 0
            ),
          ),
          0,
          9,
        ),
      },
    },
  });
  const conditional = (
    target: ReturnType<typeof range>,
    formula: string,
    color: ReturnType<typeof rgb>,
    backgroundColor?: ReturnType<typeof rgb>,
  ) => ({
    addConditionalFormatRule: {
      rule: {
        ranges: [target],
        booleanRule: {
          condition: {
            type: "CUSTOM_FORMULA",
            values: [{ userEnteredValue: formula }],
          },
          format: {
            backgroundColor,
            textFormat: { foregroundColor: color, bold: true },
          },
        },
      },
      index: 0,
    },
  });
  for (
    const [label, color] of [["Доход", colors.income], [
      "Расход",
      colors.expense,
    ], ["Перевод", colors.transfer]] as const
  ) {
    requests.push(
      conditional(
        range(ids.operations, 4, counts.operations, 2, 3),
        `=$C5="${label}"`,
        color,
      ),
      conditional(
        range(ids.operations, 4, counts.operations, 7, 8),
        `=$C5="${label}"`,
        color,
      ),
      conditional(
        range(ids.operations, 4, counts.operations, 10, 11),
        `=$C5="${label}"`,
        color,
      ),
    );
  }
  requests.push(
    conditional(
      range(ids.accounts, 4, Math.max(5, counts.accounts), 2, 3),
      "=$C5<0",
      colors.expense,
    ),
    conditional(
      range(ids.accounts, 4, Math.max(5, counts.accounts), 0, 9),
      '=$E5="Архивный"',
      colors.secondary,
      colors.light,
    ),
    conditional(
      range(ids.categories, 4, counts.categories, 2, 3),
      '=$C5="Расход"',
      colors.expense,
    ),
    conditional(
      range(ids.categories, 4, counts.categories, 2, 3),
      '=$C5="Доход"',
      colors.income,
    ),
  );
  const formatRange = (
    sheetId: number,
    sr: number,
    er: number,
    sc: number,
    ec: number,
    userEnteredFormat: Record<string, unknown>,
  ) => ({
    repeatCell: {
      range: range(sheetId, sr, er, sc, ec),
      cell: { userEnteredFormat },
      fields: Object.keys(userEnteredFormat).map((key) =>
        `userEnteredFormat.${key}`
      ).join(","),
    },
  });
  requests.push(
    formatRange(ids.operations, 4, counts.operations, 0, 1, {
      numberFormat: { type: "DATE", pattern: "dd.mm.yyyy" },
      horizontalAlignment: "CENTER",
    }),
    formatRange(ids.operations, 4, counts.operations, 1, 2, {
      numberFormat: { type: "TIME", pattern: "hh:mm" },
      horizontalAlignment: "CENTER",
    }),
    formatRange(ids.operations, 4, counts.operations, 6, 7, {
      wrapStrategy: "WRAP",
    }),
    formatRange(ids.operations, 4, counts.operations, 7, 8, {
      numberFormat: { type: "NUMBER", pattern: "#,##0.00" },
      horizontalAlignment: "RIGHT",
    }),
    formatRange(ids.operations, 4, counts.operations, 9, 10, {
      numberFormat: { type: "NUMBER", pattern: "0.000000" },
      horizontalAlignment: "RIGHT",
    }),
    formatRange(ids.operations, 4, counts.operations, 10, 11, {
      numberFormat: { type: "NUMBER", pattern: "#,##0.00" },
      horizontalAlignment: "RIGHT",
    }),
    formatRange(ids.operations, 4, counts.operations, 13, 14, {
      numberFormat: { type: "DATE", pattern: "dd.mm.yyyy" },
      horizontalAlignment: "CENTER",
    }),
    formatRange(ids.operations, 4, counts.operations, 15, 16, {
      textFormat: {
        foregroundColor: colors.secondary,
        fontFamily: "Arial",
        fontSize: 9,
      },
    }),
    formatRange(ids.operations, 4, counts.operations, 16, 18, {
      numberFormat: { type: "DATE_TIME", pattern: "dd.mm.yyyy hh:mm" },
      horizontalAlignment: "CENTER",
    }),
    formatRange(ids.accounts, 4, counts.accounts, 2, 3, {
      numberFormat: { type: "NUMBER", pattern: "#,##0.00" },
      horizontalAlignment: "RIGHT",
    }),
    formatRange(ids.accounts, 4, counts.accounts, 6, 8, {
      numberFormat: { type: "DATE_TIME", pattern: "dd.mm.yyyy hh:mm" },
      horizontalAlignment: "CENTER",
    }),
    formatRange(ids.categories, 4, counts.categories, 4, 5, {
      numberFormat: { type: "NUMBER", pattern: "#,##0.00" },
      horizontalAlignment: "RIGHT",
    }),
    formatRange(ids.categories, 4, counts.categories, 6, 8, {
      numberFormat: { type: "DATE_TIME", pattern: "dd.mm.yyyy hh:mm" },
      horizontalAlignment: "CENTER",
    }),
    formatRange(
      ids.overview,
      layout.dynamicsSectionRow + 1,
      layout.latestSectionRow,
      1,
      3,
      {
        numberFormat: { type: "NUMBER", pattern: "#,##0.00" },
        horizontalAlignment: "RIGHT",
      },
    ),
    formatRange(
      ids.overview,
      layout.dynamicsSectionRow + 1,
      layout.latestSectionRow,
      5,
      6,
      {
        numberFormat: { type: "NUMBER", pattern: "#,##0.00" },
        horizontalAlignment: "RIGHT",
      },
    ),
    formatRange(
      ids.overview,
      layout.dynamicsSectionRow + 1,
      layout.latestSectionRow,
      6,
      7,
      {
        numberFormat: { type: "PERCENT", pattern: "0.0%" },
        horizontalAlignment: "RIGHT",
      },
    ),
    formatRange(
      ids.overview,
      layout.latestSectionRow + 2,
      counts.overview,
      0,
      1,
      {
        numberFormat: { type: "DATE", pattern: "dd.mm.yyyy" },
        horizontalAlignment: "CENTER",
      },
    ),
    formatRange(
      ids.overview,
      layout.latestSectionRow + 2,
      counts.overview,
      5,
      6,
      {
        numberFormat: { type: "NUMBER", pattern: "#,##0.00" },
        horizontalAlignment: "RIGHT",
      },
    ),
  );
  const sheetProps: Array<[number, number]> = [
    [ids.overview, 3],
    [ids.operations, 4],
    [ids.accounts, 4],
    [ids.categories, 4],
  ];
  for (const [sheetId, frozenRowCount] of sheetProps) {
    requests.push({
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: { frozenRowCount, hideGridlines: false },
        },
        fields: "gridProperties(frozenRowCount,hideGridlines)",
      },
    });
  }
  requests.push({
    updateSheetProperties: {
      properties: { sheetId: id(SUPPORT_SHEET), hidden: true },
      fields: "hidden",
    },
  });
  return requests;
}

export async function applyFormatting(
  spreadsheetId: string,
  accessToken: string,
  requests: Record<string, unknown>[],
  fetcher: Fetcher = fetch,
) {
  const response = await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${
      encodeURIComponent(spreadsheetId)
    }:batchUpdate`,
    {
      method: "POST",
      headers: auth(accessToken),
      body: JSON.stringify({ requests }),
    },
    fetcher,
  );
  if (!response.ok) {
    const errorText = await response.text().catch(() =>
      "Google API response body is unavailable"
    );
    console.error("google-sheets-sync:formatting-batch", {
      status: response.status,
      error: errorText.slice(0, 4000),
      requestTypes: requests.map((request) =>
        Object.keys(request)[0] ?? "unknown"
      ),
    });
    throw createErrorPayload(
      response.status === 429 ? "GOOGLE_RATE_LIMIT" : "GOOGLE_API_ERROR",
      "Не удалось применить оформление Google Sheets",
    );
  }
}
