import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  FileJson,
  Sheet,
  ExternalLink,
  RefreshCw,
  Unlink,
  Loader2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth/useAuth";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardDescription, CardTitle } from "../components/ui/Card";
import { useToast } from "../components/ui/toastContext";
import {
  prepareGoogleSheetsExport,
  toCsv,
  type GoogleSheetsPayload,
} from "../services/googleSheetsExport";
import {
  connectGoogleSheets,
  disconnectGoogleSheets,
  getGoogleSheetsConnectionStatus,
  getGoogleSheetsSyncLogs,
  readableGoogleSheetsErrorMessage,
  syncGoogleSheets,
} from "../services/googleSheetsConnection";
import { requestGoogleSheetsAuthorizationCode } from "../services/googleOAuthCodeClient";
import { tapHaptic } from "../services/haptics";
import type {
  Account,
  Category,
  ExportRow,
  GoogleSheetsConnectionStatus,
  Transaction,
} from "../types";
import { downloadFile } from "../utils/export";

export function ExportPage({
  transactions,
  categories,
  accounts,
}: {
  transactions: Transaction[];
  categories: Category[];
  accounts: Account[];
}) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [payload, setPayload] = useState<GoogleSheetsPayload | null>(null);
  const [disconnectConfirmOpen, setDisconnectConfirmOpen] = useState(false);

  const rows: ExportRow[] = useMemo(
    () =>
      transactions.map((item) => ({
        date: item.date,
        type: typeLabel(item.type),
        account:
          accounts.find((account) => account.id === item.accountId)?.name ??
          "Счет",
        category:
          categories.find((category) => category.id === item.categoryId)
            ?.name ?? "Другое",
        description: item.description,
        paymentMethod: item.paymentMethod,
        amount: item.amount,
        currency: item.currency,
      })),
    [transactions, categories, accounts]
  );

  const connectionQuery = useQuery({
    queryKey: ["google-sheets-connection", user?.id ?? "guest"],
    queryFn: getGoogleSheetsConnectionStatus,
    enabled: Boolean(user?.id),
    staleTime: 20_000,
  });

  useQuery({
    queryKey: ["google-sheets-sync-logs", user?.id ?? "guest"],
    queryFn: () => getGoogleSheetsSyncLogs(5),
    enabled: Boolean(user?.id),
    staleTime: 20_000,
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const code = await requestGoogleSheetsAuthorizationCode({
        loginHint: user?.email ?? null,
      });
      return connectGoogleSheets(code);
    },
    onSuccess: async () => {
      void tapHaptic("success");
      notify("Google Sheets подключён");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["google-sheets-connection", user?.id ?? "guest"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["google-sheets-sync-logs", user?.id ?? "guest"],
        }),
      ]);
    },
    onError: (error) => {
      notify(readableGoogleSheetsErrorMessage(error));
    },
  });

  const syncMutation = useMutation({
    mutationFn: syncGoogleSheets,
    onSuccess: async () => {
      void tapHaptic("success");
      notify("Google Sheets синхронизирован");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["google-sheets-connection", user?.id ?? "guest"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["google-sheets-sync-logs", user?.id ?? "guest"],
        }),
      ]);
    },
    onError: (error) => {
      notify(readableGoogleSheetsErrorMessage(error));
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: disconnectGoogleSheets,
    onSuccess: async () => {
      void tapHaptic("success");
      notify("Google Sheets отключён");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["google-sheets-connection", user?.id ?? "guest"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["google-sheets-sync-logs", user?.id ?? "guest"],
        }),
      ]);
    },
    onError: (error) => {
      notify(readableGoogleSheetsErrorMessage(error));
    },
  });

  const connection = connectionQuery.data ?? defaultConnectionStatus();
  const isLoadingConnection =
    connectionQuery.isLoading || connectionQuery.isFetching;
  const connectionLoadError = connectionQuery.isError
    ? readableGoogleSheetsErrorMessage(connectionQuery.error)
    : null;
  const isConnected = connection.connectionStatus === "connected";
  const isConnecting = connectMutation.isPending;
  const isSyncing = syncMutation.isPending;
  const isDisconnecting = disconnectMutation.isPending;

  return (
    <>
      <PageHeader
        title={t("pages.export")}
        description={t("pages.exportDescription")}
      />
      <div className="mb-4 grid gap-4 xl:grid-cols-[1fr_360px]">
        <Card>
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => {
                downloadFile(
                  "operations.csv",
                  toCsv(rows),
                  "text/csv;charset=utf-8"
                );
                void tapHaptic("success");
                notify("CSV экспортирован");
              }}
            >
              <Download className="h-4 w-4" />
              Экспорт CSV
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                downloadFile(
                  "operations.json",
                  JSON.stringify(rows, null, 2),
                  "application/json"
                );
                void tapHaptic("success");
                notify("JSON экспортирован");
              }}
            >
              <FileJson className="h-4 w-4" />
              Экспорт JSON
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                const next = prepareGoogleSheetsExport(rows);
                setPayload(next);
                void tapHaptic("selection");
                notify("Данные для Google Sheets подготовлены");
              }}
            >
              <Sheet className="h-4 w-4" />
              Подготовить Google Sheets
            </Button>
          </div>
          <p className="mt-3 text-[13px] leading-5 text-zinc-500">
            Файл выгружается локально, без сервера и без потери данных.
          </p>
        </Card>
        <Card>
          <p className="text-[13px] font-medium text-zinc-500">Строк готово</p>
          <p className="mt-2 text-3xl font-semibold">{rows.length}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge>Дата</Badge>
            <Badge>Тип</Badge>
            <Badge>Счет</Badge>
            <Badge>Категория</Badge>
            <Badge>Сумма</Badge>
          </div>
        </Card>
      </div>

      <Card className="mb-5 p-5 sm:mb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[14px] font-medium text-zinc-500">
              Google Sheets
            </p>
            <CardTitle className="mt-1">Персональная таблица</CardTitle>
            <CardDescription>
              Подключите Google-аккаунт, чтобы создать персональную таблицу для
              данных qwadrat Finance Tracker.
            </CardDescription>
          </div>
          <Badge>{connectionLabel(connection.connectionStatus)}</Badge>
        </div>

        <div className="mt-5 rounded-[1.6rem] bg-zinc-50/80 p-4 dark:bg-zinc-900/50 sm:p-5">
          {isLoadingConnection ? (
            <GoogleSheetsSkeleton />
          ) : connectionLoadError ? (
            <div className="space-y-4">
              <div className="rounded-[1.35rem] border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] leading-5 text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-200">
                {connectionLoadError}
              </div>
              <Button
                className="h-12 w-full sm:w-auto"
                variant="secondary"
                onClick={() => void connectionQuery.refetch()}
              >
                <RefreshCw className="h-4 w-4" />
                Повторить
              </Button>
            </div>
          ) : !isConnected ? (
            <div className="space-y-4">
              <p className="text-[14px] leading-6 text-zinc-600 dark:text-zinc-300">
                Подключите Google Sheets, чтобы создать одну постоянную таблицу
                для этого аккаунта qwadrat Finance Tracker.
              </p>
              <Button
                className="h-12 w-full sm:w-auto"
                disabled={isConnecting}
                onClick={() => void handleConnect()}
              >
                {isConnecting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sheet className="h-4 w-4" />
                )}
                {isConnecting
                  ? "Подключаем Google Sheets…"
                  : "Подключить Google Sheets"}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <InfoPill
                  label="Google email"
                  value={connection.googleEmail ?? "—"}
                />
                <InfoPill
                  label="Статус"
                  value={connectionLabel(connection.connectionStatus)}
                />
                <InfoPill
                  label="Обновлено"
                  value={
                    connection.updatedAt
                      ? formatDateTime(connection.updatedAt)
                      : connection.createdAt
                      ? formatDateTime(connection.createdAt)
                      : "—"
                  }
                />
                <InfoPill
                  label="Синхронизация"
                  value={syncStatusLabel(connection.syncStatus)}
                />
              </div>

              {connection.lastSyncError ? (
                <div className="rounded-[1.35rem] border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] leading-5 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
                  {connection.lastSyncError}
                </div>
              ) : null}

              <div className="flex flex-col gap-3 pt-1 sm:flex-row">
                <Button
                  className="h-14 flex-1 text-[16px] sm:h-12 sm:text-[14px]"
                  variant="secondary"
                  onClick={() => {
                    if (connection.spreadsheetUrl) {
                      window.open(
                        connection.spreadsheetUrl,
                        "_blank",
                        "noopener,noreferrer"
                      );
                    }
                  }}
                  disabled={!connection.spreadsheetUrl}
                >
                  <ExternalLink className="h-4 w-4" />
                  Открыть таблицу
                </Button>
                <Button
                  className="h-14 flex-1 text-[16px] sm:h-12 sm:text-[14px]"
                  variant="secondary"
                  onClick={() => {
                    void syncMutation.mutateAsync().catch(() => undefined);
                  }}
                  disabled={isSyncing}
                >
                  {isSyncing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  {isSyncing ? "Синхронизация…" : "Синхронизировать сейчас"}
                </Button>
                <Button
                  className="h-14 flex-1 text-[16px] sm:h-12 sm:text-[14px]"
                  variant="danger"
                  onClick={() => setDisconnectConfirmOpen(true)}
                  disabled={isDisconnecting}
                >
                  <Unlink className="h-4 w-4" />
                  Отключить
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      {payload && (
        <Card className="mb-4">
          <CardTitle>Пакет Google Sheets</CardTitle>
          <CardDescription>
            {payload.spreadsheetTitle} · {payload.range} ·{" "}
            {new Date(payload.preparedAt).toLocaleString()}
          </CardDescription>
          <pre className="mt-4 max-h-48 overflow-auto rounded-2xl bg-zinc-950 p-4 text-[12px] text-zinc-100">
            {JSON.stringify(payload, null, 2)}
          </pre>
        </Card>
      )}

      <Card>
        <CardTitle>Предпросмотр</CardTitle>
        <CardDescription>Проверьте строки перед экспортом.</CardDescription>
        {rows.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="Нет данных для экспорта"
              description="Добавьте хотя бы одну операцию, чтобы собрать CSV, JSON или пакет для Google Sheets."
              icon={Sheet}
            />
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="text-xs uppercase text-zinc-400">
                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                  <th className="py-3 font-medium">Дата</th>
                  <th className="font-medium">Тип</th>
                  <th className="font-medium">Счет</th>
                  <th className="font-medium">Категория</th>
                  <th className="font-medium">Описание</th>
                  <th className="font-medium">Оплата</th>
                  <th className="font-medium">Сумма</th>
                  <th className="font-medium">Валюта</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr
                    key={`${row.date}-${index}`}
                    className="border-b border-zinc-100 last:border-0 dark:border-zinc-900"
                  >
                    <td className="py-3">{row.date}</td>
                    <td>{row.type}</td>
                    <td>{row.account}</td>
                    <td>{row.category}</td>
                    <td>{row.description}</td>
                    <td>{row.paymentMethod}</td>
                    <td>{row.amount}</td>
                    <td>{row.currency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={disconnectConfirmOpen}
        title="Отключить Google Sheets?"
        description="Уже созданная таблица не будет удалена, но перестанет обновляться."
        confirmLabel={isDisconnecting ? "Отключаем..." : "Отключить"}
        onClose={() => {
          if (!isDisconnecting) setDisconnectConfirmOpen(false);
        }}
        onConfirm={() => {
          if (isDisconnecting) return;
          void handleDisconnect();
        }}
      />
    </>
  );

  async function handleConnect() {
    try {
      await connectMutation.mutateAsync();
    } catch {
      // error already handled by onError
    }
  }

  async function handleDisconnect() {
    try {
      await disconnectMutation.mutateAsync();
      setDisconnectConfirmOpen(false);
    } catch {
      // error already handled by onError
    }
  }
}

function typeLabel(type: Transaction["type"]) {
  if (type === "income") return "Доход";
  if (type === "expense") return "Расход";
  return "Перевод";
}

function defaultConnectionStatus(): GoogleSheetsConnectionStatus {
  return {
    googleEmail: null,
    spreadsheetUrl: null,
    connectionStatus: "not_connected",
    syncStatus: "idle",
    lastSyncedAt: null,
    lastSyncError: null,
    createdAt: null,
    updatedAt: null,
  };
}

function connectionLabel(
  status: GoogleSheetsConnectionStatus["connectionStatus"]
) {
  switch (status) {
    case "connected":
      return "Подключено";
    case "connecting":
      return "Подключаем...";
    case "disconnected":
      return "Отключено";
    case "error":
      return "Ошибка";
    case "reauthorization_required":
      return "Нужно переподключение";
    case "not_connected":
    default:
      return "Не подключено";
  }
}

function syncStatusLabel(status: GoogleSheetsConnectionStatus["syncStatus"]) {
  switch (status) {
    case "syncing":
      return "Синхронизация";
    case "success":
      return "Успешно";
    case "error":
      return "Ошибка";
    case "idle":
    default:
      return "Ожидание";
  }
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-h-[82px] rounded-[1.35rem] bg-white px-4 py-4 shadow-[0_10px_24px_rgba(24,24,27,0.05)] dark:bg-zinc-950">
      <p className="text-[12px] uppercase tracking-[0.14em] text-zinc-400">
        {label}
      </p>
      <p className="mt-2 break-words text-[16px] font-medium leading-snug text-zinc-950 dark:text-zinc-50 sm:text-[14px]">
        {value}
      </p>
    </div>
  );
}

function GoogleSheetsSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="rounded-[1.35rem] bg-white px-4 py-4 dark:bg-zinc-950"
          >
            <div className="h-3 w-24 rounded-full bg-zinc-200 dark:bg-zinc-800" />
            <div className="mt-3 h-4 w-36 rounded-full bg-zinc-100 dark:bg-zinc-900" />
          </div>
        ))}
      </div>
      <div className="h-12 w-48 rounded-[1.2rem] bg-white dark:bg-zinc-950" />
    </div>
  );
}
