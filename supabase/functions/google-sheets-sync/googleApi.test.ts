import {
  buildAccountingFormattingRequests,
  buildManagedCleanupRequests,
  ensureManagedStructure,
  googleFetch,
  refreshGoogleAccessToken,
} from "./googleApi.ts";

Deno.test("retries 429 and succeeds", async () => {
  let calls = 0;
  const fetcher = (async () => {
    calls++;
    return new Response(calls < 2 ? "rate" : "{}", {
      status: calls < 2 ? 429 : 200,
    });
  }) as typeof fetch;
  const result = await googleFetch("https://example.test", {}, fetcher);
  if (!result.ok || calls !== 2) throw new Error("429 retry failed");
});
Deno.test("retries 500 with a bounded retry count", async () => {
  let calls = 0;
  const fetcher = (async () => {
    calls++;
    return new Response("{}", { status: 500 });
  }) as typeof fetch;
  const result = await googleFetch("https://example.test", {}, fetcher);
  if (result.status !== 500 || calls !== 3) throw new Error("500 retry failed");
});
Deno.test("maps revoked refresh token to reauthorization", async () => {
  const fetcher =
    (async () =>
      new Response(JSON.stringify({ error: "invalid_grant" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;
  let code = "";
  try {
    await refreshGoogleAccessToken("r", "id", "secret", fetcher);
  } catch (error) {
    code = String((error as { error?: { code?: string } }).error?.code);
  }
  if (code !== "GOOGLE_REAUTHORIZATION_REQUIRED") {
    throw new Error("revoked token mapping failed");
  }
});

Deno.test("support sheet is created once and remains hidden", async () => {
  let requestBody = "";
  const fetcher = (async (_url: string | URL | Request, init?: RequestInit) => {
    requestBody = String(init?.body ?? "");
    return new Response(
      JSON.stringify({
        replies: [{
          addSheet: {
            properties: { sheetId: 5, title: "_qwadrat_finance_tracker_data", hidden: true },
          },
        }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;
  const sheets = ["Обзор", "Операции", "Счета", "Категории"].map((
    title,
    index,
  ) => ({ properties: { sheetId: index + 1, title } }));
  const result = await ensureManagedStructure(
    "sheet",
    "token",
    { spreadsheetId: "sheet", sheets },
    { overview: 46, support: 2, operations: 5, accounts: 8, categories: 5 },
    fetcher,
  );
  if (
    !requestBody.includes("addSheet") ||
    !result.sheets?.some((sheet) => sheet.properties?.title === "_qwadrat_finance_tracker_data")
  ) throw new Error("support sheet creation failed");

  await ensureManagedStructure("sheet", "token", result, {
    overview: 46,
    support: 2,
    operations: 5,
    accounts: 8,
    categories: 5,
  }, fetcher);
  if (requestBody.includes("addSheet")) {
    throw new Error("support sheet was duplicated");
  }
});

Deno.test("accounting formatting removes old charts and creates no dashboard charts", () => {
  const sheets: Array<{
    properties: {
      sheetId: number;
      title: string;
      gridProperties: { rowCount: number; columnCount: number };
    };
    charts: Array<{ chartId: number }>;
    bandedRanges: Array<{ bandedRangeId?: number }>;
    conditionalFormats: unknown[];
  }> = [
    "Обзор",
    "Операции",
    "Счета",
    "Категории",
    "_qwadrat_finance_tracker_data",
  ].map((title, index) => ({
    properties: {
      sheetId: index + 1,
      title,
      gridProperties: { rowCount: 100, columnCount: 18 },
    },
    charts: [],
    bandedRanges: [],
    conditionalFormats: [],
  }));
  sheets[0].charts = [{ chartId: 99 }];
  const values = {
    overview: Array.from({ length: 12 }, () => [] as unknown[]),
    operations: [["ОПЕРАЦИИ"], [], [], Array(18).fill("H"), ["row"]],
    accounts: [["СЧЕТА"], [], [], Array(9).fill("H"), ["row"], [], ["Валюта"]],
    categories: [["КАТЕГОРИИ"], [], [], Array(9).fill("H"), ["РАСХОДЫ"], [
      "row",
    ]],
  };
  values.overview[0] = ["title"];
  values.overview[4] = ["left", "", "", "", "right"];
  values.overview[5] = Array(7).fill("H");
  values.overview[8] = ["dynamic", "", "", "", "categories"];
  values.overview[9] = Array(7).fill("H");
  values.overview[10] = ["latest"];
  values.overview[11] = Array(7).fill("H");
  const layout = {
    overviewMerges: [[0, 1, 0, 7], [4, 5, 0, 3], [4, 5, 4, 7], [8, 9, 0, 3], [
      8,
      9,
      4,
      7,
    ], [10, 11, 0, 7]] as Array<[number, number, number, number]>,
    dynamicsSectionRow: 8,
    latestSectionRow: 10,
    accountHeaderRow: 3,
    categoryDividerRows: [4],
    emptyOperations: false,
    emptyAccounts: false,
    emptyCategories: false,
  };
  const cleanup = buildManagedCleanupRequests({ sheets });
  const requests = buildAccountingFormattingRequests(
    { sheets },
    values,
    layout,
  );
  if (
    !cleanup.some((request) => "deleteEmbeddedObject" in request) ||
    requests.some((request) => "addChart" in request)
  ) throw new Error("dashboard charts were not removed");
  if (
    !cleanup.some((request) => "clearBasicFilter" in request) ||
    !requests.some((request) => "updateBorders" in request)
  ) throw new Error("accounting cleanup requests are incomplete");
});
