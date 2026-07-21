import { createCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { requireAuthenticatedUser } from "../_shared/auth.ts";
import { createErrorPayload, logServerError } from "../_shared/errors.ts";
import { getSupabaseAdminClient } from "../_shared/supabaseAdmin.ts";
import { createRateSnapshot } from "../_shared/currencyConversion.ts";

function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...Object.fromEntries(createCorsHeaders(request)),
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return handleCorsPreflight(request);
  if (request.method !== "POST") {
    return json(
      request,
      createErrorPayload("INVALID_REQUEST", "Method not allowed"),
      405,
    );
  }
  try {
    await requireAuthenticatedUser(request);
    const body = await request.json().catch(() => ({})) as Record<
      string,
      unknown
    >;
    const snapshot = await createRateSnapshot(
      getSupabaseAdminClient(),
      body.amount,
      body.fromCurrency,
      body.toCurrency,
      body.date,
    );
    return json(request, { success: true, data: snapshot });
  } catch (error) {
    const payload = (error as { error?: { code?: string; message?: string } })
      ?.error;
    if (!payload?.code) logServerError("currency-convert", error);
    return json(
      request,
      createErrorPayload(
        payload?.code ?? "INTERNAL_ERROR",
        payload?.message ?? "Не удалось получить курс валют",
      ),
      payload?.code === "INVALID_REQUEST" ||
        payload?.code === "UNSUPPORTED_CURRENCY"
        ? 400
        : 503,
    );
  }
});
