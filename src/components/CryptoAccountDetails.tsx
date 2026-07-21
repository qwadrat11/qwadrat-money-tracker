import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  BarChart3,
  Bitcoin,
  Eye,
  EyeOff,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import type { AccountBalance, AppSettings, Currency } from "../types";
import {
  deleteCryptoHolding,
  loadCryptoHoldings,
  loadCryptoPortfolio,
  saveCryptoHolding,
  searchCryptoAssets,
  updateCryptoHolding,
  type CryptoAssetSearch,
  type CryptoHolding,
  type CryptoPosition,
} from "../services/cryptoPortfolio";
import { Button } from "./ui/Button";
import { Field, Input } from "./ui/Field";
import { Modal } from "./ui/Modal";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { useToast } from "./ui/toastContext";
import { formatMoney } from "../utils/format";

type PortfolioTab = "assets" | "analytics";
type SortKey = "value" | "change" | "name" | "weight" | "pnl";
const sortLabels: Record<SortKey, string> = {
  value: "По стоимости",
  change: "По изменению 24 ч.",
  name: "По названию",
  weight: "По доле",
  pnl: "По P&L",
};
const colors = ["#18181b", "#52525b", "#71717a", "#a1a1aa", "#d4d4d8"];
const quantityText = (value: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 12 }).format(value);
const percentText = (value: number) =>
  value > 0 && value < 0.01 ? "<0.01%" : `${value.toFixed(2)}%`;
const relativeTime = (iso: string) => {
  const minutes = Math.max(
    0,
    Math.round((Date.now() - Date.parse(iso)) / 60000)
  );
  return minutes < 1
    ? "только что"
    : minutes === 1
    ? "1 мин назад"
    : `${minutes} мин назад`;
};

export function CryptoAccountDetails({
  account,
  settings,
}: {
  account: AccountBalance;
  settings: AppSettings;
}) {
  const queryClient = useQueryClient(),
    { notify } = useToast();
  const [tab, setTab] = useState<PortfolioTab>("assets"),
    [hidden, setHidden] = useState(false);
  const [holdingModal, setHoldingModal] = useState(false),
    [editing, setEditing] = useState<CryptoHolding | null>(null);
  const [sortSheet, setSortSheet] = useState(false),
    [actionPosition, setActionPosition] = useState<CryptoPosition | null>(null),
    [deletePosition, setDeletePosition] = useState<CryptoPosition | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>(
    () =>
      (localStorage.getItem(
        "qwadrat-finance-tracker:crypto-sort"
      ) as SortKey) || "value"
  );
  const holdings = useQuery({
    queryKey: ["crypto-holdings", account.id],
    queryFn: () => loadCryptoHoldings(account.id),
  });
  const portfolio = useQuery({
    queryKey: ["crypto-portfolio", account.id],
    queryFn: () => loadCryptoPortfolio(account.id),
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    placeholderData: (previous) => previous,
  });
  const refetchPortfolio = portfolio.refetch;
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === "visible") void refetchPortfolio();
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [refetchPortfolio]);
  const refresh = useMutation({
    mutationFn: () => loadCryptoPortfolio(account.id, true),
    onSuccess: (data) => {
      queryClient.setQueryData(["crypto-portfolio", account.id], data);
      notify("Котировки обновлены");
    },
  });
  const remove = useMutation({
    mutationFn: deleteCryptoHolding,
    onSuccess: async () => {
      setDeletePosition(null);
      setActionPosition(null);
      await queryClient.invalidateQueries({
        queryKey: ["crypto-holdings", account.id],
      });
      await queryClient.invalidateQueries({
        queryKey: ["crypto-portfolio", account.id],
      });
    },
  });
  const positions = useMemo(
    () =>
      [...(portfolio.data?.positions ?? [])].sort((a, b) =>
        sort === "name"
          ? a.name.localeCompare(b.name, "ru")
          : sort === "change"
          ? (b.change24h ?? -Infinity) - (a.change24h ?? -Infinity)
          : sort === "weight"
          ? b.weight - a.weight
          : sort === "pnl"
          ? (b.profitLoss ?? -Infinity) - (a.profitLoss ?? -Infinity)
          : (b.positionValue ?? -1) - (a.positionValue ?? -1)
      ),
    [portfolio.data, sort]
  );
  const summary = portfolio.data?.summary;
  const lifetime = useMemo(() => {
    const comparable = positions.filter(
      (item) =>
        item.positionValue != null &&
        item.averageBuyPrice != null &&
        item.averageBuyPrice > 0 &&
        item.averageBuyCurrency === item.quoteCurrency
    );
    const invested = comparable.reduce(
      (sum, item) => sum + item.quantity * item.averageBuyPrice!,
      0
    );
    const value = comparable.reduce(
      (sum, item) => sum + item.positionValue!,
      0
    );
    return invested > 0
      ? {
          value: value - invested,
          percent: ((value - invested) / invested) * 100,
        }
      : null;
  }, [positions]);
  const dayPercent =
    summary && summary.portfolioValue - summary.portfolioChange24h > 0
      ? (summary.portfolioChange24h /
          (summary.portfolioValue - summary.portfolioChange24h)) *
        100
      : null;
  const openEdit = (position: CryptoPosition) => {
    setActionPosition(null);
    setEditing(holdings.data?.find((item) => item.id === position.id) ?? null);
    setHoldingModal(true);
  };
  const setSorting = (value: SortKey) => {
    setSort(value);
    localStorage.setItem("qwadrat-finance-tracker:crypto-sort", value);
    setSortSheet(false);
  };

  return (
    <div className="mx-auto min-w-0 max-w-6xl space-y-4 overflow-x-hidden">
      <CryptoPortfolioHeader
        summary={summary}
        lifetime={lifetime}
        dayPercent={dayPercent}
        hidden={hidden}
        refreshing={refresh.isPending}
        onToggleHidden={() => setHidden(!hidden)}
        onRefresh={() => refresh.mutate()}
        onAdd={() => {
          setEditing(null);
          setHoldingModal(true);
        }}
      />
      {summary?.stale && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <span>
            Не удалось обновить цены. Показаны последние доступные данные.
          </span>
          <button
            className="min-h-11 shrink-0 font-medium underline"
            onClick={() => refresh.mutate()}
          >
            Повторить
          </button>
        </div>
      )}
      <PortfolioTabs tab={tab} onChange={setTab} />
      {tab === "assets" ? (
        <>
          {positions.length > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-zinc-500">
                {positions.length} {positions.length === 1 ? "актив" : "актива"}
              </p>
              <button
                className="flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900 xl:hidden"
                onClick={() => setSortSheet(true)}
              >
                <SlidersHorizontal className="h-4 w-4" />
                Сортировка
              </button>
              <select
                className="hidden h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950 xl:block"
                value={sort}
                onChange={(event) => setSorting(event.target.value as SortKey)}
              >
                {Object.entries(sortLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          )}
          {portfolio.isLoading && !portfolio.data ? (
            <AssetSkeleton />
          ) : positions.length === 0 ? (
            <EmptyPortfolio onAdd={() => setHoldingModal(true)} />
          ) : (
            <>
              <div className="divide-y divide-zinc-100 overflow-hidden rounded-[1.4rem] bg-white shadow-[0_10px_30px_rgba(24,24,27,0.04)] dark:divide-zinc-900 dark:bg-zinc-950 xl:hidden">
                {positions.map((position) => (
                  <MobileCryptoAssetRow
                    key={position.id}
                    position={position}
                    expanded={expandedId === position.id}
                    onExpand={() =>
                      setExpandedId(
                        expandedId === position.id ? null : position.id
                      )
                    }
                    onActions={() => setActionPosition(position)}
                    onEdit={() => openEdit(position)}
                  />
                ))}
              </div>
              <DesktopCryptoAssetTable
                positions={positions}
                onActions={setActionPosition}
              />
            </>
          )}
        </>
      ) : (
        <CryptoAnalytics positions={positions} />
      )}
      <SortSheet
        open={sortSheet}
        value={sort}
        onClose={() => setSortSheet(false)}
        onSelect={setSorting}
      />
      <CryptoAssetActions
        position={actionPosition}
        onClose={() => setActionPosition(null)}
        onEdit={() => actionPosition && openEdit(actionPosition)}
        onDetails={() => {
          if (actionPosition) setExpandedId(actionPosition.id);
          setActionPosition(null);
        }}
        onDelete={() => {
          setDeletePosition(actionPosition);
          setActionPosition(null);
        }}
      />
      <HoldingModal
        open={holdingModal}
        accountId={account.id}
        baseCurrency={settings.baseCurrency}
        holding={editing}
        onClose={() => setHoldingModal(false)}
        onSaved={async () => {
          await queryClient.invalidateQueries({
            queryKey: ["crypto-holdings", account.id],
          });
          let priceRefreshFailed = false;
          try {
            const snapshot = await loadCryptoPortfolio(account.id, true);
            queryClient.setQueryData(
              ["crypto-portfolio", account.id],
              snapshot
            );
          } catch {
            priceRefreshFailed = true;
            await queryClient.invalidateQueries({
              queryKey: ["crypto-portfolio", account.id],
            });
          }
          setHoldingModal(false);
          notify(
            priceRefreshFailed
              ? "Монета сохранена. Котировки временно недоступны"
              : editing
              ? "Позиция успешно обновлена"
              : "Монета успешно добавлена"
          );
        }}
      />
      <ConfirmDialog
        open={Boolean(deletePosition)}
        title="Удалить монету?"
        description={
          deletePosition
            ? `${deletePosition.name} будет удалена из криптопортфеля. Финансовые операции не изменятся.`
            : ""
        }
        confirmLabel="Удалить"
        onClose={() => setDeletePosition(null)}
        onConfirm={() => {
          if (deletePosition) remove.mutate(deletePosition.id);
        }}
      />
    </div>
  );
}

function CryptoPortfolioHeader({
  summary,
  lifetime,
  dayPercent,
  hidden,
  refreshing,
  onToggleHidden,
  onRefresh,
  onAdd,
}: {
  summary?: {
    portfolioValue: number;
    portfolioChange24h: number;
    coinCount: number;
    quoteCurrency: Currency;
    fetchedAt: string;
  };
  lifetime: { value: number; percent: number } | null;
  dayPercent: number | null;
  hidden: boolean;
  refreshing: boolean;
  onToggleHidden: () => void;
  onRefresh: () => void;
  onAdd: () => void;
}) {
  const { t } = useTranslation();
  const money = (value: number) =>
    hidden ? "••••••" : formatMoney(value, summary?.quoteCurrency ?? "USD");
  return (
    <header className="rounded-[1.5rem] bg-white p-4 shadow-[0_10px_34px_rgba(24,24,27,0.05)] dark:bg-zinc-950 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">{t("pages.crypto")}</h2>
            <span className="rounded-full bg-zinc-100 px-2 py-1 text-[11px] font-medium text-zinc-500 dark:bg-zinc-900">
              {summary?.quoteCurrency ?? "USD"}
            </span>
            <button
              className="grid h-11 w-11 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
              onClick={onToggleHidden}
              aria-label={hidden ? "Показать стоимость" : "Скрыть стоимость"}
            >
              {hidden ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          <p className="mt-1 truncate text-[2.15rem] font-semibold leading-none tracking-[-0.045em] sm:text-[2.6rem]">
            {summary ? money(summary.portfolioValue) : "—"}
          </p>
          <div className="mt-3 space-y-1 text-sm">
            <p
              className={
                (summary?.portfolioChange24h ?? 0) >= 0
                  ? "text-emerald-600"
                  : "text-rose-600"
              }
            >
              <span className="text-zinc-500">24 ч.:</span>{" "}
              {summary
                ? `${summary.portfolioChange24h >= 0 ? "+" : ""}${money(
                    summary.portfolioChange24h
                  )}${
                    dayPercent == null
                      ? ""
                      : ` · ${dayPercent >= 0 ? "+" : ""}${dayPercent.toFixed(
                          2
                        )}%`
                  }`
                : "получаем котировки"}
            </p>
            <p
              className={
                lifetime && lifetime.value < 0
                  ? "text-rose-600"
                  : "text-emerald-600"
              }
            >
              <span className="text-zinc-500">За всё время:</span>{" "}
              {lifetime
                ? `${lifetime.value >= 0 ? "+" : ""}${money(
                    lifetime.value
                  )} · ${
                    lifetime.percent >= 0 ? "+" : ""
                  }${lifetime.percent.toFixed(2)}%`
                : "—"}
            </p>
          </div>
          {summary && (
            <p className="mt-2 text-xs text-zinc-500">
              {summary.coinCount} {summary.coinCount === 1 ? "актив" : "актива"}{" "}
              · обновлено {relativeTime(summary.fetchedAt)}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            size="icon"
            variant="secondary"
            aria-label="Обновить котировки"
            disabled={refreshing}
            onClick={onRefresh}
          >
            <RefreshCw
              className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`}
            />
          </Button>
          <Button className="min-w-0 flex-1 sm:flex-none" onClick={onAdd}>
            <Plus className="h-5 w-5" />
            Добавить монету
          </Button>
        </div>
      </div>
    </header>
  );
}
function PortfolioTabs({
  tab,
  onChange,
}: {
  tab: PortfolioTab;
  onChange: (tab: PortfolioTab) => void;
}) {
  return (
    <div className="grid grid-cols-2 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-900 sm:w-72">
      {(["assets", "analytics"] as const).map((key) => (
        <button
          key={key}
          className={`min-h-10 rounded-lg text-sm font-medium transition ${
            tab === key
              ? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-white"
              : "text-zinc-500"
          }`}
          onClick={() => onChange(key)}
        >
          {key === "assets" ? "Активы" : "Аналитика"}
        </button>
      ))}
    </div>
  );
}
function MobileCryptoAssetRow({
  position,
  expanded,
  onExpand,
  onActions,
  onEdit,
}: {
  position: CryptoPosition;
  expanded: boolean;
  onExpand: () => void;
  onActions: () => void;
  onEdit: () => void;
}) {
  return (
    <article className="min-w-0">
      <div className="flex min-h-[84px] items-center gap-3 px-3 py-3">
        <button
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          onClick={onExpand}
        >
          {position.imageUrl ? (
            <img
              className="h-11 w-11 shrink-0 rounded-full"
              src={position.imageUrl}
              alt=""
            />
          ) : (
            <CoinFallback symbol={position.symbol} />
          )}
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold">
              {position.name}
            </span>
            <span className="block truncate text-xs text-zinc-500">
              {position.symbol} · {quantityText(position.quantity)}{" "}
              {position.symbol}
            </span>
          </span>
        </button>
        <button className="min-w-0 text-right" onClick={onExpand}>
          <span className="block truncate text-[15px] font-semibold">
            {position.positionValue == null
              ? "—"
              : formatMoney(position.positionValue, position.quoteCurrency)}
          </span>
          <span
            className={`block text-xs font-medium ${
              (position.change24h ?? 0) >= 0
                ? "text-emerald-600"
                : "text-rose-600"
            }`}
          >
            {position.change24h == null
              ? "Нет цены"
              : `${
                  position.change24h >= 0 ? "+" : ""
                }${position.change24h.toFixed(2)}%`}
          </span>
        </button>
        <button
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-900"
          onClick={onActions}
          aria-label={`Действия: ${position.name}`}
        >
          <MoreHorizontal className="h-5 w-5" />
        </button>
      </div>
      {expanded && (
        <div className="grid grid-cols-2 gap-x-5 gap-y-3 bg-zinc-50 px-4 py-4 text-sm dark:bg-zinc-900/60">
          <Detail
            label="Текущая цена"
            value={
              position.currentPrice == null
                ? "—"
                : formatMoney(position.currentPrice, position.quoteCurrency)
            }
          />
          <Detail
            label="Средняя покупка"
            value={
              position.averageBuyPrice == null
                ? "—"
                : formatMoney(
                    position.averageBuyPrice,
                    position.averageBuyCurrency ?? position.quoteCurrency
                  )
            }
          />
          <Detail label="Доля" value={percentText(position.weight)} />
          <Detail
            label="P&L"
            value={
              position.profitLoss == null
                ? "—"
                : `${position.profitLoss >= 0 ? "+" : ""}${formatMoney(
                    position.profitLoss,
                    position.quoteCurrency
                  )} · ${position.profitLossPercent?.toFixed(2)}%`
            }
          />
          {position.averageBuyPrice == null && (
            <button
              className="col-span-2 min-h-11 rounded-xl bg-white px-3 text-sm font-medium shadow-sm dark:bg-zinc-950"
              onClick={onEdit}
            >
              Указать цену покупки
            </button>
          )}
        </div>
      )}
    </article>
  );
}
function DesktopCryptoAssetTable({
  positions,
  onActions,
}: {
  positions: CryptoPosition[];
  onActions: (position: CryptoPosition) => void;
}) {
  return (
    <div className="hidden overflow-hidden rounded-[1.4rem] bg-white shadow-[0_10px_30px_rgba(24,24,27,0.04)] dark:bg-zinc-950 xl:block">
      <div className="grid grid-cols-[minmax(180px,1.5fr)_1fr_.8fr_1fr_1fr_1fr_1fr_.65fr_52px] gap-3 border-b border-zinc-100 px-4 py-3 text-xs font-medium text-zinc-500 dark:border-zinc-900">
        <span>Актив</span>
        <span>Цена</span>
        <span>24 часа</span>
        <span>Количество</span>
        <span>Стоимость</span>
        <span>Средняя</span>
        <span>P&L</span>
        <span>Доля</span>
        <span />
      </div>
      {positions.map((position) => (
        <button
          key={position.id}
          className="grid min-h-[68px] w-full grid-cols-[minmax(180px,1.5fr)_1fr_.8fr_1fr_1fr_1fr_1fr_.65fr_52px] items-center gap-3 border-b border-zinc-100 px-4 text-left text-sm last:border-0 hover:bg-zinc-50 dark:border-zinc-900 dark:hover:bg-zinc-900/60"
          onClick={() => onActions(position)}
          aria-label={`Открыть действия: ${position.name}`}
        >
          <span className="flex min-w-0 items-center gap-3">
            {position.imageUrl ? (
              <img
                className="h-9 w-9 rounded-full"
                src={position.imageUrl}
                alt=""
              />
            ) : (
              <CoinFallback symbol={position.symbol} />
            )}
            <span className="min-w-0">
              <span className="block truncate font-medium">
                {position.name}
              </span>
              <span className="text-xs text-zinc-500">{position.symbol}</span>
            </span>
          </span>
          <span>
            {position.currentPrice == null
              ? "—"
              : formatMoney(position.currentPrice, position.quoteCurrency)}
          </span>
          <span
            className={
              (position.change24h ?? 0) >= 0
                ? "text-emerald-600"
                : "text-rose-600"
            }
          >
            {position.change24h == null
              ? "—"
              : `${
                  position.change24h >= 0 ? "+" : ""
                }${position.change24h.toFixed(2)}%`}
          </span>
          <span className="truncate">{quantityText(position.quantity)}</span>
          <span className="font-medium">
            {position.positionValue == null
              ? "—"
              : formatMoney(position.positionValue, position.quoteCurrency)}
          </span>
          <span>
            {position.averageBuyPrice == null
              ? "—"
              : formatMoney(
                  position.averageBuyPrice,
                  position.averageBuyCurrency ?? position.quoteCurrency
                )}
          </span>
          <span
            className={
              position.profitLoss == null
                ? ""
                : position.profitLoss >= 0
                ? "text-emerald-600"
                : "text-rose-600"
            }
          >
            {position.profitLoss == null
              ? "—"
              : `${position.profitLoss >= 0 ? "+" : ""}${formatMoney(
                  position.profitLoss,
                  position.quoteCurrency
                )}`}
          </span>
          <span>{percentText(position.weight)}</span>
          <span className="grid h-11 w-11 place-items-center rounded-full">
            <MoreHorizontal className="h-5 w-5" />
          </span>
        </button>
      ))}
    </div>
  );
}
function CryptoAnalytics({ positions }: { positions: CryptoPosition[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-[1.4rem] bg-white p-4 dark:bg-zinc-950">
        <h3 className="font-semibold">История стоимости</h3>
        <div className="mt-4 grid min-h-44 place-items-center rounded-xl bg-zinc-50 px-5 text-center dark:bg-zinc-900/60">
          <div>
            <BarChart3 className="mx-auto h-7 w-7 text-zinc-400" />
            <p className="mt-2 text-sm font-medium">
              История стоимости появится после накопления данных
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Мы не строим график из вымышленных значений.
            </p>
          </div>
        </div>
      </section>
      <PortfolioAllocation positions={positions} />
    </div>
  );
}
function PortfolioAllocation({ positions }: { positions: CryptoPosition[] }) {
  const top = positions
      .slice()
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 5),
    other = Math.max(0, 100 - top.reduce((sum, item) => sum + item.weight, 0));
  return (
    <section className="rounded-[1.4rem] bg-white p-4 dark:bg-zinc-950">
      <h3 className="font-semibold">Распределение</h3>
      {positions.length ? (
        <>
          <div className="mt-5 flex h-3 overflow-hidden rounded-full bg-zinc-100">
            {top.map((item, index) => (
              <span
                key={item.id}
                style={{
                  width: `${item.weight}%`,
                  backgroundColor: colors[index],
                }}
              />
            ))}
            {other > 0.001 && (
              <span
                style={{ width: `${other}%`, backgroundColor: "#e4e4e7" }}
              />
            )}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm text-zinc-600">
            {top.map((item, index) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-2"
              >
                <span className="flex items-center gap-2">
                  <i
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: colors[index] }}
                  />
                  {item.symbol}
                </span>
                <span>{percentText(item.weight)}</span>
              </div>
            ))}
            {other > 0.001 && (
              <div className="flex justify-between">
                <span>Другие</span>
                <span>{percentText(other)}</span>
              </div>
            )}
          </div>
        </>
      ) : (
        <p className="mt-4 text-sm text-zinc-500">
          Добавьте активы, чтобы увидеть распределение.
        </p>
      )}
    </section>
  );
}
function SortSheet({
  open,
  value,
  onClose,
  onSelect,
}: {
  open: boolean;
  value: SortKey;
  onClose: () => void;
  onSelect: (value: SortKey) => void;
}) {
  return (
    <Modal open={open} title="Сортировка" onClose={onClose}>
      {Object.entries(sortLabels).map(([key, label]) => (
        <button
          key={key}
          className={`flex min-h-14 w-full items-center justify-between rounded-xl px-4 text-left text-sm ${
            value === key
              ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950"
              : "hover:bg-zinc-100 dark:hover:bg-zinc-900"
          }`}
          onClick={() => onSelect(key as SortKey)}
        >
          {label}
          {value === key && <span>✓</span>}
        </button>
      ))}
    </Modal>
  );
}
function CryptoAssetActions({
  position,
  onClose,
  onEdit,
  onDetails,
  onDelete,
}: {
  position: CryptoPosition | null;
  onClose: () => void;
  onEdit: () => void;
  onDetails: () => void;
  onDelete: () => void;
}) {
  return (
    <Modal
      open={Boolean(position)}
      title={position?.name ?? "Действия"}
      onClose={onClose}
    >
      <div className="grid gap-2">
        <Action label="Изменить количество" onClick={onEdit} />
        <Action
          label={
            position?.averageBuyPrice == null
              ? "Указать среднюю цену"
              : "Изменить среднюю цену"
          }
          onClick={onEdit}
        />
        <Action label="Открыть подробности" onClick={onDetails} />
        <Action label="Удалить монету" destructive onClick={onDelete} />
      </div>
    </Modal>
  );
}
function Action({
  label,
  destructive,
  onClick,
}: {
  label: string;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`min-h-14 rounded-xl px-4 text-left text-sm font-medium ${
        destructive
          ? "bg-rose-50 text-rose-600 dark:bg-rose-950/30"
          : "bg-zinc-50 dark:bg-zinc-900"
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 truncate font-medium">{value}</p>
    </div>
  );
}
function CoinFallback({ symbol }: { symbol: string }) {
  return (
    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-zinc-100 text-sm font-semibold dark:bg-zinc-900">
      {symbol.slice(0, 1)}
    </span>
  );
}
function AssetSkeleton() {
  return (
    <div className="overflow-hidden rounded-[1.4rem] bg-white dark:bg-zinc-950">
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="flex h-[84px] animate-pulse items-center gap-3 border-b border-zinc-100 px-4 last:border-0 dark:border-zinc-900"
        >
          <span className="h-11 w-11 rounded-full bg-zinc-100 dark:bg-zinc-900" />
          <span className="h-4 w-32 rounded bg-zinc-100 dark:bg-zinc-900" />
        </div>
      ))}
    </div>
  );
}
function EmptyPortfolio({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-[1.4rem] bg-white px-5 py-10 text-center dark:bg-zinc-950">
      <Bitcoin className="mx-auto h-8 w-8 text-zinc-400" />
      <h3 className="mt-3 font-semibold">Добавьте первую монету</h3>
      <p className="mx-auto mt-2 max-w-lg text-sm text-zinc-500">
        Выберите криптовалюту и укажите количество — qwadrat Finance Tracker
        будет отслеживать её стоимость через CoinGecko
      </p>
      <Button className="mt-5" onClick={onAdd}>
        Добавить монету
      </Button>
    </div>
  );
}

function HoldingModal({
  open,
  accountId,
  baseCurrency,
  holding,
  onClose,
  onSaved,
}: {
  open: boolean;
  accountId: string;
  baseCurrency: Currency;
  holding: CryptoHolding | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { notify } = useToast();
  const [query, setQuery] = useState(""),
    [debounced, setDebounced] = useState(""),
    [asset, setAsset] = useState<CryptoAssetSearch | null>(null),
    [quantity, setQuantity] = useState(""),
    [average, setAverage] = useState(""),
    [note, setNote] = useState(""),
    [extra, setExtra] = useState(false);
  useEffect(() => {
    if (holding) {
      setAsset({
        providerAssetId: holding.provider_asset_id,
        symbol: holding.symbol,
        name: holding.name,
        imageUrl: holding.image_url,
        marketCapRank: null,
      });
      setQuantity(String(holding.quantity));
      setAverage(
        holding.average_buy_price == null
          ? ""
          : String(holding.average_buy_price)
      );
      setNote(holding.note ?? "");
      setExtra(Boolean(holding.average_buy_price || holding.note));
    } else {
      setAsset(null);
      setQuantity("");
      setAverage("");
      setNote("");
      setExtra(false);
      setQuery("");
    }
  }, [holding, open]);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query), 350);
    return () => window.clearTimeout(timer);
  }, [query]);
  const search = useQuery({
    queryKey: ["crypto-search", debounced],
    queryFn: () => searchCryptoAssets(debounced),
    enabled: open && !asset && debounced.trim().length >= 2,
    staleTime: 5 * 60_000,
  });
  const save = useMutation({
    mutationFn: async () =>
      holding
        ? updateCryptoHolding(holding.id, {
            quantity: Number(quantity),
            average_buy_price: average ? Number(average) : null,
            average_buy_currency: average ? baseCurrency : null,
            note,
          })
        : saveCryptoHolding({
            accountId,
            asset: asset!,
            quantity: Number(quantity),
            averageBuyPrice: average ? Number(average) : null,
            averageBuyCurrency: baseCurrency,
            note,
          }),
    onSuccess: async () => {
      await onSaved();
    },
    onError: (error) => {
      notify(
        error instanceof Error ? error.message : "Не удалось сохранить монету"
      );
    },
  });
  return (
    <Modal
      open={open}
      title={holding ? "Изменить позицию" : "Добавить монету"}
      onClose={onClose}
    >
      {!asset ? (
        <div>
          <div className="relative">
            <Search className="absolute left-4 top-5 h-4 w-4 text-zinc-400" />
            <Input
              autoFocus
              className="pl-11"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Bitcoin, BTC или bitcoin"
            />
          </div>
          <div className="mt-3 max-h-[55dvh] overflow-y-auto">
            {search.data?.map((coin) => (
              <button
                key={coin.providerAssetId}
                className="flex min-h-[64px] w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-zinc-100 dark:hover:bg-zinc-900"
                onClick={() => setAsset(coin)}
              >
                {coin.imageUrl ? (
                  <img
                    className="h-10 w-10 rounded-full"
                    src={coin.imageUrl}
                    alt=""
                  />
                ) : (
                  <CoinFallback symbol={coin.symbol} />
                )}
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {coin.name}
                  </span>
                  <span className="block truncate text-xs uppercase text-zinc-500">
                    {coin.symbol} · {coin.providerAssetId}
                    {coin.marketCapRank ? ` · #${coin.marketCapRank}` : ""}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const numericQuantity = Number(quantity);
            if (!Number.isFinite(numericQuantity) || numericQuantity <= 0) {
              notify("Укажите количество монет больше нуля");
              return;
            }
            if (
              average &&
              (!Number.isFinite(Number(average)) || Number(average) < 0)
            ) {
              notify("Укажите корректную среднюю цену покупки");
              return;
            }
            save.mutate();
          }}
        >
          <div className="flex items-center gap-3 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900">
            {asset.imageUrl ? (
              <img
                className="h-10 w-10 rounded-full"
                src={asset.imageUrl}
                alt=""
              />
            ) : (
              <CoinFallback symbol={asset.symbol} />
            )}
            <div className="min-w-0">
              <p className="truncate font-medium">{asset.name}</p>
              <p className="truncate text-xs uppercase text-zinc-500">
                {asset.symbol} · {asset.providerAssetId}
              </p>
            </div>
            {!holding && (
              <button
                className="ml-auto min-h-11 text-xs font-medium"
                type="button"
                onClick={() => setAsset(null)}
              >
                Изменить
              </button>
            )}
          </div>
          <Field label="Количество">
            <Input
              autoFocus
              required
              min="0.000000000001"
              step="any"
              type="number"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </Field>
          <button
            type="button"
            className="min-h-11 text-left text-sm font-medium text-zinc-600"
            onClick={() => setExtra(!extra)}
          >
            Цена покупки и заметка {extra ? "−" : "+"}
          </button>
          {extra && (
            <div className="grid gap-3 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900">
              <Field label={`Средняя цена покупки, ${baseCurrency}`}>
                <Input
                  min="0"
                  step="any"
                  type="number"
                  value={average}
                  onChange={(event) => setAverage(event.target.value)}
                />
              </Field>
              <Field label="Заметка">
                <Input
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Необязательно"
                />
              </Field>
            </div>
          )}
          <Button
            disabled={
              save.isPending ||
              !Number.isFinite(Number(quantity)) ||
              Number(quantity) <= 0
            }
          >
            {save.isPending ? "Сохраняем…" : holding ? "Сохранить" : "Добавить"}
          </Button>
        </form>
      )}
    </Modal>
  );
}
