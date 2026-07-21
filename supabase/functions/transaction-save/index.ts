import { createCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { requireAuthenticatedUser } from "../_shared/auth.ts";
import { createErrorPayload, logServerError } from "../_shared/errors.ts";
import { getSupabaseAdminClient } from "../_shared/supabaseAdmin.ts";
import {
  createRateSnapshot,
  normalizeCurrency,
} from "../_shared/currencyConversion.ts";
import { encodeTransactionNote } from "../_shared/transactionCodec.ts";

type Payload = {
  action?: "create" | "update" | "delete";
  id?: string;
  transaction?: Record<string, unknown>;
};

function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...Object.fromEntries(createCorsHeaders(request)),
      "Content-Type": "application/json",
    },
  });
}

async function changeBalance(userId: string, accountId: string, delta: number) {
  if (!accountId || !delta) return;
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.from("accounts").select("balance").eq(
    "id",
    accountId,
  ).eq("user_id", userId).single();
  if (error) throw error;
  const { error: updateError } = await admin.from("accounts").update({
    balance: Number(data.balance ?? 0) + delta,
    updated_at: new Date().toISOString(),
  }).eq("id", accountId).eq("user_id", userId);
  if (updateError) throw updateError;
}

async function reverseRow(userId: string, row: Record<string, unknown>) {
  const amount = Number(row.account_amount ?? row.amount ?? 0);
  if (row.type === "income") {
    await changeBalance(userId, String(row.account_id ?? ""), -amount);
  }
  if (row.type === "expense") {
    await changeBalance(userId, String(row.account_id ?? ""), amount);
  }
  if (row.type === "transfer") {
    await changeBalance(userId, String(row.account_id ?? ""), amount);
    await changeBalance(
      userId,
      String(row.to_account_id ?? ""),
      -Number(row.destination_amount ?? amount),
    );
  }
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
    const { user } = await requireAuthenticatedUser(request);
    const payload = await request.json() as Payload;
    const admin = getSupabaseAdminClient();
    if (payload.action === "delete") {
      const { data: previous, error } = await admin.from("transactions").select(
        "*",
      ).eq("id", payload.id).eq("user_id", user.id).single();
      if (error) throw error;
      await reverseRow(user.id, previous);
      const { error: deleteError } = await admin.from("transactions").delete()
        .eq("id", payload.id).eq("user_id", user.id);
      if (deleteError) throw deleteError;
      return json(request, { success: true, data: { id: payload.id } });
    }
    const input = payload.transaction ?? {};
    const accountId = String(input.accountId ?? ""),
      toAccountId = input.toAccountId ? String(input.toAccountId) : null;
    const { data: account, error: accountError } = await admin.from("accounts")
      .select("id,currency").eq("id", accountId).eq("user_id", user.id)
      .single();
    if (accountError) {
      throw createErrorPayload("INVALID_REQUEST", "Счёт операции не найден");
    }
    const type = String(input.type ?? "");
    if (!["income", "expense", "transfer"].includes(type)) {
      throw createErrorPayload("INVALID_REQUEST", "Некорректный тип операции");
    }
    const { data: settings, error: settingsError } = await admin.from(
      "app_settings",
    ).select("data").eq("user_id", user.id).maybeSingle();
    if (settingsError) throw settingsError;
    const baseCurrency = normalizeCurrency(
      settings?.data?.baseCurrency ?? "USD",
    );
    const currency = normalizeCurrency(input.currency);
    const date = String(input.date ?? "").slice(0, 10);
    const baseSnapshot = await createRateSnapshot(
      admin,
      input.amount,
      currency,
      baseCurrency,
      date,
    );
    const accountSnapshot = await createRateSnapshot(
      admin,
      input.amount,
      currency,
      account.currency,
      date,
    );
    let destinationAmount: number | null = null,
      destinationCurrency: string | null = null;
    if (type === "transfer") {
      if (!toAccountId || toAccountId === accountId) {
        throw createErrorPayload(
          "INVALID_REQUEST",
          "Укажите другой счёт назначения",
        );
      }
      const { data: destination, error } = await admin.from("accounts").select(
        "id,currency",
      ).eq("id", toAccountId).eq("user_id", user.id).single();
      if (error) {
        throw createErrorPayload(
          "INVALID_REQUEST",
          "Счёт назначения не найден",
        );
      }
      const destinationSnapshot = await createRateSnapshot(
        admin,
        input.amount,
        currency,
        destination.currency,
        date,
      );
      destinationAmount = destinationSnapshot.convertedAmount;
      destinationCurrency = destinationSnapshot.baseCurrency;
    }
    const now = new Date().toISOString();
    const row = {
      user_id: user.id,
      account_id: accountId,
      to_account_id: toAccountId,
      category_id: type === "transfer"
        ? null
        : String(input.categoryId ?? "") || null,
      type,
      amount: baseSnapshot.originalAmount,
      currency,
      base_currency: baseCurrency,
      exchange_rate: baseSnapshot.exchangeRate,
      converted_amount: baseSnapshot.convertedAmount,
      exchange_rate_date: baseSnapshot.exchangeRateDate,
      exchange_rate_source: baseSnapshot.exchangeRateSource,
      account_amount: accountSnapshot.convertedAmount,
      account_currency: accountSnapshot.baseCurrency,
      destination_amount: destinationAmount,
      destination_currency: destinationCurrency,
      title: String(input.description ?? "").trim(),
      note: encodeTransactionNote(String(input.paymentMethod ?? ""), currency),
      date,
      updated_at: now,
    };
    if (!row.title) {
      throw createErrorPayload("INVALID_REQUEST", "Описание обязательно");
    }
    let saved: Record<string, unknown>;
    if (payload.action === "update") {
      const { data: previous, error } = await admin.from("transactions").select(
        "*",
      ).eq("id", payload.id).eq("user_id", user.id).single();
      if (error) throw error;
      await reverseRow(user.id, previous);
      const { data, error: updateError } = await admin.from("transactions")
        .update(row).eq("id", payload.id).eq("user_id", user.id).select("*")
        .single();
      if (updateError) throw updateError;
      saved = data;
    } else {
      const { data, error } = await admin.from("transactions").insert({
        ...row,
        created_at: now,
      }).select("*").single();
      if (error) throw error;
      saved = data;
    }
    const sourceDelta = type === "income"
      ? accountSnapshot.convertedAmount
      : -accountSnapshot.convertedAmount;
    await changeBalance(user.id, accountId, sourceDelta);
    if (type === "transfer" && toAccountId) {
      await changeBalance(user.id, toAccountId, destinationAmount ?? 0);
    }
    return json(request, { success: true, data: saved });
  } catch (error) {
    const payload =
      (error as { error?: { code?: string; message?: string } }).error;
    if (!payload?.code) logServerError("transaction-save", error);
    return json(
      request,
      createErrorPayload(
        payload?.code ?? "INTERNAL_ERROR",
        payload?.message ?? "Не удалось сохранить операцию",
      ),
      payload?.code ? 400 : 500,
    );
  }
});
