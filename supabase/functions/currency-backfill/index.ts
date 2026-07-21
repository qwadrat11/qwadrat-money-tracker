import { createCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { requireAuthenticatedUser } from "../_shared/auth.ts";
import { createErrorPayload, logServerError } from "../_shared/errors.ts";
import { getSupabaseAdminClient } from "../_shared/supabaseAdmin.ts";
import {
  createRateSnapshot,
  normalizeCurrency,
} from "../_shared/currencyConversion.ts";
import { decodeTransactionNote } from "../_shared/transactionCodec.ts";

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
  try {
    const { user } = await requireAuthenticatedUser(request);
    const body = await request.json().catch(() => ({})) as { confirm?: string };
    const apply = body.confirm === "BACKFILL_EXISTING_TRANSACTIONS";
    const admin = getSupabaseAdminClient();
    const [
      { data: settings },
      { data: transactions, error },
      { data: accounts, error: accountsError },
    ] = await Promise.all([
      admin.from("app_settings").select("data").eq("user_id", user.id)
        .maybeSingle(),
      admin.from("transactions").select(
        "id,account_id,to_account_id,type,amount,currency,note,date,converted_amount",
      ).eq("user_id", user.id).is("converted_amount", null),
      admin.from("accounts").select("id,currency").eq("user_id", user.id),
    ]);
    if (error || accountsError) throw error ?? accountsError;
    const baseCurrency = normalizeCurrency(
      settings?.data?.baseCurrency ?? "USD",
    );
    const accountMap = new Map(
      (accounts ?? []).map((
        account,
      ) => [account.id, normalizeCurrency(account.currency)]),
    );
    const currencies = new Set<string>(),
      failures: Array<{ id: string; reason: string }> = [];
    let ready = 0, updated = 0;
    for (const row of transactions ?? []) {
      const originalCurrency = normalizeCurrency(
        row.currency ?? decodeTransactionNote(row.note).currency,
      );
      currencies.add(originalCurrency);
      try {
        const snapshot = await createRateSnapshot(
          admin,
          row.amount,
          originalCurrency,
          baseCurrency,
          String(row.date).slice(0, 10),
        );
        const accountCurrency = accountMap.get(row.account_id);
        if (!accountCurrency) {
          throw createErrorPayload(
            "INVALID_REQUEST",
            "Счёт операции не найден",
          );
        }
        const accountSnapshot = await createRateSnapshot(
          admin,
          row.amount,
          originalCurrency,
          accountCurrency,
          String(row.date).slice(0, 10),
        );
        const destinationCurrency = row.type === "transfer"
          ? accountMap.get(row.to_account_id)
          : undefined;
        const destinationSnapshot = destinationCurrency
          ? await createRateSnapshot(
            admin,
            row.amount,
            originalCurrency,
            destinationCurrency,
            String(row.date).slice(0, 10),
          )
          : null;
        ready++;
        if (apply) {
          const { error: updateError } = await admin.from("transactions")
            .update({
              currency: snapshot.originalCurrency,
              base_currency: snapshot.baseCurrency,
              exchange_rate: snapshot.exchangeRate,
              converted_amount: snapshot.convertedAmount,
              exchange_rate_date: snapshot.exchangeRateDate,
              exchange_rate_source: snapshot.exchangeRateSource,
              account_amount: accountSnapshot.convertedAmount,
              account_currency: accountSnapshot.baseCurrency,
              destination_amount: destinationSnapshot?.convertedAmount ?? null,
              destination_currency: destinationSnapshot?.baseCurrency ?? null,
            }).eq("id", row.id).eq("user_id", user.id).is(
              "converted_amount",
              null,
            );
          if (updateError) throw updateError;
          updated++;
        }
      } catch (error) {
        failures.push({
          id: row.id,
          reason: (error as { error?: { code?: string } }).error?.code ??
            "CONVERSION_FAILED",
        });
      }
    }
    return json(request, {
      success: true,
      data: {
        dryRun: !apply,
        candidates: transactions?.length ?? 0,
        ready,
        updated,
        currencies: [...currencies].sort(),
        failures,
      },
    });
  } catch (error) {
    logServerError("currency-backfill", error);
    return json(
      request,
      createErrorPayload(
        "INTERNAL_ERROR",
        "Не удалось проверить старые операции",
      ),
      500,
    );
  }
});
