import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Banknote,
  CircleDollarSign,
  Database,
  Edit3,
  FolderOpen,
  MoreHorizontal,
  Plus,
  RefreshCcw,
  Save,
  Settings2,
  ShieldCheck,
  Trash2,
  UserRound,
  UsersRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../components/PageHeader";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { Field, Input, Select } from "../components/ui/Field";
import { Modal } from "../components/ui/Modal";
import { useToast } from "../components/ui/toastContext";
import { tapHaptic } from "../services/haptics";
import type {
  Account,
  AppSettings,
  Category,
  ReceiptScanResult,
  Transaction,
  User,
} from "../types";
import { formatDate, formatMoney } from "../utils/format";

type AdminTab = "overview" | "users" | "data" | "settings";
type UserDraft = Omit<User, "id">;
type PendingAction =
  | "reset"
  | "clear"
  | "generate"
  | "delete-user"
  | "save-user"
  | "save-settings"
  | null;

const emptyUser: UserDraft = {
  name: "",
  email: "",
  role: "user",
  status: "invited",
};
const tabs: Array<{ id: AdminTab; key: string; compactKey: string }> = [
  { id: "overview", key: "overview", compactKey: "overview" },
  { id: "users", key: "users", compactKey: "usersShort" },
  { id: "data", key: "data", compactKey: "data" },
  { id: "settings", key: "settings", compactKey: "settingsShort" },
];

export function Admin(props: {
  users: User[];
  categories: Category[];
  accounts: Account[];
  receiptScans: ReceiptScanResult[];
  transactions: Transaction[];
  settings: AppSettings;
  resetDemoData: () => Promise<unknown>;
  clearTransactions: () => Promise<unknown>;
  generateDemoData: () => Promise<unknown>;
  addUser: (user: Omit<User, "id">) => Promise<unknown>;
  updateUser: (user: User) => Promise<unknown>;
  deleteUser: (id: string) => Promise<unknown>;
  updateSettings: (settings: AppSettings) => Promise<unknown>;
}) {
  const { notify } = useToast();
  const { t } = useTranslation();
  const [tab, setTab] = useState<AdminTab>("overview");
  const [confirm, setConfirm] = useState<"reset" | "clear" | "generate" | null>(
    null
  );
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [userMenuId, setUserMenuId] = useState<string | null>(null);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userDraft, setUserDraft] = useState<UserDraft>(emptyUser);
  const [settingsDraft, setSettingsDraft] = useState(props.settings);
  const [pending, setPending] = useState<PendingAction>(null);
  const [visibleTransactions, setVisibleTransactions] = useState(8);

  useEffect(() => setSettingsDraft(props.settings), [props.settings]);

  const transactions = useMemo(
    () =>
      [...props.transactions].sort(
        (a, b) =>
          b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
      ),
    [props.transactions]
  );
  const latestTransaction = transactions[0];
  const activeUsers = props.users.filter(
    (user) => user.status === "active"
  ).length;
  const settingsChanged =
    settingsDraft.defaultPaymentMethod !==
      props.settings.defaultPaymentMethod ||
    settingsDraft.baseCurrency !== props.settings.baseCurrency;

  function startUser(user?: User) {
    setEditingUser(user ?? null);
    setUserDraft(
      user
        ? {
            name: user.name,
            email: user.email,
            role: user.role,
            status: user.status,
          }
        : emptyUser
    );
    setUserModalOpen(true);
    setUserMenuId(null);
  }

  async function runAction(
    action: Exclude<PendingAction, null>,
    callback: () => Promise<unknown>,
    success: string
  ) {
    setPending(action);
    try {
      await callback();
      void tapHaptic(
        action === "clear" || action === "delete-user" ? "warning" : "success"
      );
      notify(success);
      return true;
    } catch {
      notify(
        "Не удалось выполнить действие. Проверьте подключение и повторите попытку"
      );
      return false;
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="mx-auto min-w-0 max-w-[1240px] overflow-x-hidden pb-4">
      <PageHeader
        title={t("admin.title")}
        description={t("admin.description")}
        action={
          <div className="flex w-full gap-2 sm:w-auto">
            <Button
              className="flex-1 whitespace-nowrap sm:flex-none"
              variant="secondary"
              size="sm"
              onClick={() => setTab("data")}
            >
              <Database className="h-4 w-4" /> {t("admin.tabs.data")}
            </Button>
            <Button
              className="flex-1 whitespace-nowrap sm:flex-none"
              size="sm"
              onClick={() => startUser()}
            >
              <Plus className="h-4 w-4" /> {t("admin.createUser")}
            </Button>
          </div>
        }
      />

      <nav
        className="mb-5 grid w-full grid-cols-4 rounded-xl border border-zinc-200/70 bg-zinc-100/80 p-1 dark:border-zinc-800 dark:bg-zinc-900/80 sm:w-fit sm:min-w-[520px]"
        aria-label="Разделы админ-панели"
      >
        {tabs.map((item) => (
          <button
            key={item.id}
            className={`relative min-h-10 truncate rounded-lg px-3 text-xs font-medium transition-[color,background-color,box-shadow] duration-200 sm:min-w-[128px] sm:text-sm ${
              tab === item.id
                ? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-white"
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            }`}
            onClick={() => setTab(item.id)}
          >
            <span className="sm:hidden">
              {t(`admin.tabs.${item.compactKey}`)}
            </span>
            <span className="hidden sm:inline">
              {t(`admin.tabs.${item.key}`)}
            </span>
          </button>
        ))}
      </nav>

      {(tab === "overview" || tab === "users") && (
        <SystemStats
          users={props.users.length}
          activeUsers={activeUsers}
          accounts={props.accounts.length}
          transactions={props.transactions.length}
          categories={props.categories.length}
          latestActivity={
            latestTransaction
              ? formatDate(latestTransaction.date)
              : "Нет данных"
          }
        />
      )}

      {tab === "overview" && (
        <div className="mt-5 grid min-w-0 gap-5 min-[1280px]:grid-cols-[minmax(0,1fr)_300px]">
          <TransactionsPanel
            transactions={transactions}
            accounts={props.accounts}
            categories={props.categories}
            visible={visibleTransactions}
            onMore={() => setVisibleTransactions((value) => value + 8)}
          />
          <div className="grid content-start gap-5">
            <Panel
              title={t("admin.quickActions")}
              description="Безопасные переходы к основным инструментам."
            >
              <div className="grid gap-2">
                <QuickAction
                  icon={UserRound}
                  label={t("admin.createUser")}
                  description="Добавить запись в реестр"
                  onClick={() => startUser()}
                />
                <QuickAction
                  icon={Database}
                  label={t("admin.manageData")}
                  description="Демо-набор и очистка"
                  onClick={() => setTab("data")}
                />
                <QuickAction
                  icon={Settings2}
                  label={t("admin.openSettings")}
                  description="Валюта и операции"
                  onClick={() => setTab("settings")}
                />
                <QuickAction
                  icon={RefreshCcw}
                  label={t("admin.refreshStats")}
                  description="Проверить актуальные значения"
                  onClick={() => notify("Статистика актуальна")}
                />
              </div>
            </Panel>
            <Panel
              title={t("admin.availableFacts")}
              description="Без имитации внешнего health check."
            >
              <div className="grid gap-3 text-sm">
                <Fact
                  icon={ShieldCheck}
                  label="Авторизация"
                  value="Текущая сессия подтверждена"
                />
                <Fact
                  icon={Database}
                  label="Данные"
                  value={`${props.accounts.length} счетов · ${props.transactions.length} операций`}
                />
                <Fact
                  icon={Activity}
                  label="Последняя операция"
                  value={
                    latestTransaction
                      ? formatDate(latestTransaction.date)
                      : "Операций пока нет"
                  }
                />
              </div>
            </Panel>
          </div>
        </div>
      )}

      {tab === "users" && (
        <UsersPanel
          users={props.users}
          menuId={userMenuId}
          onMenu={setUserMenuId}
          onEdit={startUser}
          onDelete={setDeleteUserId}
        />
      )}

      {tab === "data" && (
        <DataPanel
          accounts={props.accounts.length}
          transactions={props.transactions.length}
          categories={props.categories.length}
          scans={props.receiptScans.length}
          pending={pending}
          onConfirm={setConfirm}
        />
      )}

      {tab === "settings" && (
        <SettingsPanel
          draft={settingsDraft}
          changed={settingsChanged}
          saving={pending === "save-settings"}
          onChange={setSettingsDraft}
          onSave={() =>
            void runAction(
              "save-settings",
              () =>
                props.updateSettings({
                  ...settingsDraft,
                  workspaceName: "qwadrat Finance Tracker",
                }),
              "Настройки сохранены"
            )
          }
        />
      )}

      <Modal
        open={userModalOpen}
        title={
          editingUser ? "Редактировать пользователя" : "Новый пользователь"
        }
        description="Это пользователь интерфейса текущего пространства, а не учётная запись Supabase Auth."
        onClose={() => {
          if (pending === "save-user") return;
          setUserModalOpen(false);
          setEditingUser(null);
          setUserDraft(emptyUser);
        }}
        className="sm:max-w-xl"
      >
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (
              !userDraft.name.trim() ||
              !/^\S+@\S+\.\S+$/.test(userDraft.email)
            ) {
              notify("Укажите имя и корректный email");
              return;
            }
            void runAction(
              "save-user",
              () =>
                editingUser
                  ? props.updateUser({ ...editingUser, ...userDraft })
                  : props.addUser(userDraft),
              editingUser ? "Пользователь обновлён" : "Пользователь создан"
            ).then((saved) => {
              if (!saved) return;
              setEditingUser(null);
              setUserDraft(emptyUser);
              setUserModalOpen(false);
            });
          }}
        >
          <Field label="Имя">
            <Input
              required
              value={userDraft.name}
              onChange={(event) =>
                setUserDraft({ ...userDraft, name: event.target.value })
              }
            />
          </Field>
          <Field label="Email">
            <Input
              required
              type="email"
              value={userDraft.email}
              onChange={(event) =>
                setUserDraft({ ...userDraft, email: event.target.value })
              }
            />
          </Field>
          <Field label="Роль">
            <Select
              value={userDraft.role}
              onChange={(event) =>
                setUserDraft({
                  ...userDraft,
                  role: event.target.value as User["role"],
                })
              }
            >
              <option value="user">Пользователь</option>
              <option value="admin">Админ</option>
            </Select>
          </Field>
          <Field label="Статус">
            <Select
              value={userDraft.status}
              onChange={(event) =>
                setUserDraft({
                  ...userDraft,
                  status: event.target.value as User["status"],
                })
              }
            >
              <option value="active">Активен</option>
              <option value="invited">Приглашён</option>
            </Select>
          </Field>
          <div className="flex flex-col-reverse gap-2 sm:col-span-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setUserModalOpen(false)}
            >
              Отмена
            </Button>
            <Button
              type="submit"
              disabled={
                pending === "save-user" ||
                !userDraft.name.trim() ||
                !userDraft.email.trim()
              }
            >
              {pending === "save-user"
                ? "Сохраняем…"
                : editingUser
                ? "Сохранить"
                : "Создать пользователя"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={
          confirm === "clear"
            ? "Удалить все операции?"
            : confirm === "generate"
            ? "Создать демо-данные?"
            : "Сбросить данные пространства?"
        }
        description={
          confirm === "clear"
            ? `Будут удалены ${props.transactions.length} операций текущего пользователя. Счета, категории и пользователи останутся без изменений. Это действие нельзя отменить.`
            : confirm === "reset"
            ? "Финансовые данные текущего пользователя будут заменены исходным набором. Это действие нельзя отменить."
            : "В текущее пространство будет добавлен демонстрационный набор финансовых данных."
        }
        confirmLabel={
          confirm === "clear"
            ? "Удалить операции"
            : confirm === "reset"
            ? "Сбросить данные"
            : "Создать данные"
        }
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm === "clear")
            void runAction(
              "clear",
              props.clearTransactions,
              "Операции удалены"
            );
          if (confirm === "reset")
            void runAction("reset", props.resetDemoData, "Данные сброшены");
          if (confirm === "generate")
            void runAction(
              "generate",
              props.generateDemoData,
              "Демо-данные созданы"
            );
        }}
      />
      <ConfirmDialog
        open={Boolean(deleteUserId)}
        title="Удалить пользователя из реестра?"
        description="Запись будет удалена из настроек текущего пространства. Учётная запись Supabase Auth и финансовые данные не изменятся."
        confirmLabel="Удалить"
        onClose={() => setDeleteUserId(null)}
        onConfirm={() => {
          if (!deleteUserId) return;
          void runAction(
            "delete-user",
            () => props.deleteUser(deleteUserId),
            "Пользователь удалён"
          );
          setDeleteUserId(null);
        }}
      />
    </div>
  );
}

function SystemStats({
  users,
  activeUsers,
  accounts,
  transactions,
  categories,
  latestActivity,
}: {
  users: number;
  activeUsers: number;
  accounts: number;
  transactions: number;
  categories: number;
  latestActivity: string;
}) {
  const { t } = useTranslation();
  const items = [
    [UsersRound, t("admin.users"), String(users)],
    [ShieldCheck, t("admin.active"), String(activeUsers)],
    [Banknote, t("admin.accounts"), String(accounts)],
    [CircleDollarSign, t("admin.transactions"), String(transactions)],
    [FolderOpen, t("admin.categories"), String(categories)],
    [Activity, t("admin.lastActivity"), latestActivity],
  ] as const;
  return (
    <section
      className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 md:grid-cols-3"
      aria-label="Сводка системы"
    >
      {items.map(([Icon, label, value]) => (
        <div
          key={label}
          className="group min-h-[112px] rounded-2xl border border-zinc-200/70 bg-white p-4 shadow-[0_8px_24px_rgba(24,24,27,.035)] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-[0_14px_32px_rgba(24,24,27,.07)] dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-zinc-500">{label}</span>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-zinc-100 text-zinc-500 transition group-hover:bg-zinc-900 group-hover:text-white dark:bg-zinc-900 dark:group-hover:bg-white dark:group-hover:text-zinc-950">
              <Icon className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-3 truncate text-xl font-semibold tracking-tight">
            {value}
          </p>
        </div>
      ))}
    </section>
  );
}

function Panel({
  title,
  description,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card
      className={`min-w-0 hover:translate-y-0 hover:shadow-none ${className}`}
    >
      <div className="mb-4">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description && (
          <p className="mt-1 text-sm text-zinc-500">{description}</p>
        )}
      </div>
      {children}
    </Card>
  );
}

function QuickAction({
  icon: Icon,
  label,
  description,
  onClick,
}: {
  icon: typeof UserRound;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      className="flex min-h-12 items-center gap-3 rounded-xl border border-zinc-200/70 px-3 text-left text-sm font-medium transition hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
      onClick={onClick}
    >
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-zinc-100 dark:bg-zinc-900">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        <span className="mt-0.5 block truncate text-xs font-normal text-zinc-500">
          {description}
        </span>
      </span>
      <ArrowRight className="h-4 w-4 text-zinc-400" />
    </button>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ShieldCheck;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 text-zinc-400" />
      <div>
        <p className="font-medium">{label}</p>
        <p className="mt-0.5 text-xs leading-5 text-zinc-500">{value}</p>
      </div>
    </div>
  );
}

function UsersPanel({
  users,
  menuId,
  onMenu,
  onEdit,
  onDelete,
}: {
  users: User[];
  menuId: string | null;
  onMenu: (id: string | null) => void;
  onEdit: (user: User) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <Panel
      className="mt-5"
      title="Пользователи пространства"
      description="Реестр интерфейса хранится в app_settings и не управляет Supabase Auth."
    >
      {users.length === 0 ? (
        <Empty text="Пользователей в реестре пока нет" />
      ) : (
        <>
          <div className="hidden md:block">
            <div className="grid grid-cols-[minmax(220px,1.5fr)_minmax(180px,1fr)_110px_110px_52px] border-b border-zinc-200 px-3 pb-3 text-xs font-medium text-zinc-500 dark:border-zinc-800">
              <span>Пользователь</span>
              <span>Email</span>
              <span>Роль</span>
              <span>Статус</span>
              <span />
            </div>
            {users.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                menuId={menuId}
                onMenu={onMenu}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </div>
          <div className="grid gap-3 md:hidden">
            {users.map((user) => (
              <UserCard
                key={user.id}
                user={user}
                menuId={menuId}
                onMenu={onMenu}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}

function UserRow({
  user,
  menuId,
  onMenu,
  onEdit,
  onDelete,
}: {
  user: User;
  menuId: string | null;
  onMenu: (id: string | null) => void;
  onEdit: (user: User) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="grid min-h-[68px] grid-cols-[minmax(220px,1.5fr)_minmax(180px,1fr)_110px_110px_52px] items-center border-b border-zinc-100 px-3 text-sm last:border-0 dark:border-zinc-900">
      <UserIdentity user={user} />
      <span className="truncate text-zinc-500">{user.email}</span>
      <RoleBadge user={user} />
      <StatusBadge user={user} />
      <UserMenu
        user={user}
        open={menuId === user.id}
        onMenu={onMenu}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </div>
  );
}

function UserCard({
  user,
  menuId,
  onMenu,
  onEdit,
  onDelete,
}: {
  user: User;
  menuId: string | null;
  onMenu: (id: string | null) => void;
  onEdit: (user: User) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <article className="relative rounded-2xl border border-zinc-200/70 p-4 dark:border-zinc-800">
      <div className="flex items-start gap-3">
        <UserIdentity user={user} />
        <UserMenu
          user={user}
          open={menuId === user.id}
          onMenu={onMenu}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <RoleBadge user={user} />
        <StatusBadge user={user} />
      </div>
    </article>
  );
}

function UserIdentity({ user }: { user: User }) {
  const initials = user.name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-zinc-100 text-xs font-semibold dark:bg-zinc-900">
        {initials || "U"}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-medium">{user.name}</span>
        <span className="block truncate text-xs text-zinc-500 md:hidden">
          {user.email}
        </span>
      </span>
    </div>
  );
}
function RoleBadge({ user }: { user: User }) {
  return (
    <Badge className="w-fit">
      {user.role === "admin" ? "Админ" : "Пользователь"}
    </Badge>
  );
}
function StatusBadge({ user }: { user: User }) {
  return (
    <Badge
      className={
        user.status === "active"
          ? "w-fit border-emerald-200 bg-emerald-50 text-emerald-700"
          : "w-fit"
      }
    >
      {user.status === "active" ? "Активен" : "Приглашён"}
    </Badge>
  );
}

function UserMenu({
  user,
  open,
  onMenu,
  onEdit,
  onDelete,
}: {
  user: User;
  open: boolean;
  onMenu: (id: string | null) => void;
  onEdit: (user: User) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="relative ml-auto">
      <button
        className="grid h-11 w-11 place-items-center rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-900"
        aria-label={`Действия пользователя ${user.name}`}
        onClick={() => onMenu(open ? null : user.id)}
      >
        <MoreHorizontal className="h-5 w-5" />
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-20 w-52 rounded-xl border border-zinc-200 bg-white p-1 shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
          <button
            className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900"
            onClick={() => onEdit(user)}
          >
            <Edit3 className="h-4 w-4" /> Изменить
          </button>
          <button
            className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
            onClick={() => {
              onMenu(null);
              onDelete(user.id);
            }}
          >
            <Trash2 className="h-4 w-4" /> Удалить
          </button>
        </div>
      )}
    </div>
  );
}

function DataPanel({
  accounts,
  transactions,
  categories,
  scans,
  pending,
  onConfirm,
}: {
  accounts: number;
  transactions: number;
  categories: number;
  scans: number;
  pending: PendingAction;
  onConfirm: (value: "reset" | "clear" | "generate") => void;
}) {
  return (
    <div className="mt-5 grid gap-5 lg:grid-cols-2">
      <Panel
        title="Демо-данные"
        description="Инструменты работают только с данными текущего пользователя."
      >
        <div className="mb-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <MiniStat label="Счета" value={accounts} />
          <MiniStat label="Операции" value={transactions} />
          <MiniStat label="Категории" value={categories} />
          <MiniStat label="Сканы" value={scans} />
        </div>
        <div className="grid gap-3">
          <ActionBox
            icon={Database}
            title="Создать демо-данные"
            text="Заполнить пространство демонстрационным набором."
            label="Создать"
            disabled={Boolean(pending)}
            onClick={() => onConfirm("generate")}
          />
          <ActionBox
            icon={RefreshCcw}
            title="Сбросить демо-данные"
            text="Заменить финансовые данные исходным набором."
            label="Сбросить"
            disabled={Boolean(pending)}
            onClick={() => onConfirm("reset")}
          />
        </div>
      </Panel>
      <Panel
        title="Опасная зона"
        description="Необратимые действия требуют отдельного подтверждения."
      >
        <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4 dark:border-rose-900 dark:bg-rose-950/20">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-rose-600 dark:bg-zinc-950">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div>
              <h3 className="font-semibold">Очистить операции</h3>
              <p className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-400">
                Будут удалены {transactions} операций. Счета, категории и реестр
                пользователей не затрагиваются.
              </p>
            </div>
          </div>
          <Button
            className="mt-4 w-full sm:w-auto"
            variant="danger"
            disabled={Boolean(pending) || transactions === 0}
            onClick={() => onConfirm("clear")}
          >
            <Trash2 className="h-4 w-4" /> Удалить операции
          </Button>
        </div>
      </Panel>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}
function ActionBox({
  icon: Icon,
  title,
  text,
  label,
  disabled,
  onClick,
}: {
  icon: typeof Database;
  title: string;
  text: string;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200/70 p-4 sm:flex-row sm:items-center dark:border-zinc-800">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-zinc-100 dark:bg-zinc-900">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="font-medium">{title}</h3>
        <p className="mt-1 text-sm text-zinc-500">{text}</p>
      </div>
      <Button
        className="w-full sm:w-auto"
        variant="secondary"
        size="sm"
        disabled={disabled}
        onClick={onClick}
      >
        {label}
      </Button>
    </div>
  );
}

function SettingsPanel({
  draft,
  changed,
  saving,
  onChange,
  onSave,
}: {
  draft: AppSettings;
  changed: boolean;
  saving: boolean;
  onChange: (value: AppSettings) => void;
  onSave: () => void;
}) {
  return (
    <Panel
      className="mt-5 max-w-4xl"
      title="Настройки пространства"
      description="Реальные настройки текущего пользователя сохраняются в Supabase app_settings."
    >
      <form
        className="grid gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <section>
          <h3 className="text-sm font-semibold">Рабочее пространство</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field label="Название приложения">
              <Input readOnly value="qwadrat Finance Tracker" />
            </Field>
            <Field label="Основная валюта">
              <Select
                value={draft.baseCurrency}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    baseCurrency: event.target
                      .value as AppSettings["baseCurrency"],
                    currency: event.target.value as AppSettings["currency"],
                  })
                }
              >
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="UAH">UAH</option>
              </Select>
            </Field>
          </div>
        </section>
        <section className="border-t border-zinc-100 pt-5 dark:border-zinc-900">
          <h3 className="text-sm font-semibold">Операции</h3>
          <div className="mt-3 max-w-md">
            <Field label="Способ оплаты по умолчанию">
              <Input
                value={draft.defaultPaymentMethod}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    defaultPaymentMethod: event.target.value,
                  })
                }
              />
            </Field>
          </div>
        </section>
        <div className="flex flex-col items-start gap-2 border-t border-zinc-100 pt-5 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-900">
          <p className="text-xs text-zinc-500">
            {changed
              ? "Есть несохранённые изменения"
              : "Все изменения сохранены"}
          </p>
          <Button
            className="w-full sm:w-auto"
            type="submit"
            disabled={!changed || saving}
          >
            <Save className="h-4 w-4" />{" "}
            {saving ? "Сохраняем…" : "Сохранить настройки"}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function TransactionsPanel({
  transactions,
  accounts,
  categories,
  visible,
  onMore,
}: {
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  visible: number;
  onMore: () => void;
}) {
  const { t } = useTranslation();
  const rows = transactions.slice(0, visible);
  const accountName = (id: string) =>
    accounts.find((item) => item.id === id)?.name ?? "Неизвестный счёт";
  const categoryName = (id: string) =>
    categories.find((item) => item.id === id)?.name ?? "Без категории";
  return (
    <Panel
      title={t("admin.latestTransactions")}
      description={t("entities.transaction", { count: transactions.length })}
    >
      {rows.length === 0 ? (
        <Empty text="Операций пока нет" />
      ) : (
        <>
          <div className="hidden min-w-0 xl:block">
            <div className="grid grid-cols-[104px_68px_105px_minmax(120px,1fr)_105px_116px] gap-2 border-b border-zinc-200 px-2 pb-3 text-xs font-medium text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
              <span>Дата</span>
              <span>Тип</span>
              <span>Категория</span>
              <span>Описание</span>
              <span>Счёт</span>
              <span className="text-right">Сумма</span>
            </div>
            {rows.map((item) => (
              <div
                key={item.id}
                className="grid min-h-[60px] min-w-0 grid-cols-[104px_68px_105px_minmax(120px,1fr)_105px_116px] items-center gap-2 border-b border-zinc-100 px-2 text-[13px] last:border-0 hover:bg-zinc-50 dark:border-zinc-900 dark:hover:bg-zinc-900/50"
              >
                <span className="whitespace-nowrap text-xs text-zinc-500">
                  {formatDate(item.date)}
                </span>
                <TypeLabel type={item.type} />
                <span
                  className="truncate"
                  title={categoryName(item.categoryId)}
                >
                  {categoryName(item.categoryId)}
                </span>
                <span
                  className="truncate text-zinc-600 dark:text-zinc-300"
                  title={item.description || "Без описания"}
                >
                  {item.description || "Без описания"}
                </span>
                <span
                  className="truncate text-zinc-500"
                  title={accountName(item.accountId)}
                >
                  {accountName(item.accountId)}
                </span>
                <span
                  className={`whitespace-nowrap text-right font-medium tabular-nums ${
                    item.type === "income"
                      ? "text-emerald-600"
                      : item.type === "expense"
                      ? "text-rose-600"
                      : ""
                  }`}
                >
                  {item.type === "income"
                    ? "+"
                    : item.type === "expense"
                    ? "−"
                    : ""}
                  {formatMoney(item.amount, item.currency)}
                </span>
              </div>
            ))}
          </div>
          <div className="grid gap-2 xl:hidden">
            {rows.map((item) => (
              <article
                key={item.id}
                className="flex min-w-0 items-center gap-3 rounded-xl border border-zinc-100 p-3 dark:border-zinc-900"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <TypeLabel type={item.type} />
                    <span className="truncate text-sm font-medium">
                      {item.description || categoryName(item.categoryId)}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-zinc-500">
                    {formatDate(item.date)} · {categoryName(item.categoryId)} ·{" "}
                    {accountName(item.accountId)}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-sm font-semibold ${
                    item.type === "income"
                      ? "text-emerald-600"
                      : item.type === "expense"
                      ? "text-rose-600"
                      : ""
                  }`}
                >
                  {item.type === "income"
                    ? "+"
                    : item.type === "expense"
                    ? "−"
                    : ""}
                  {formatMoney(item.amount, item.currency)}
                </span>
              </article>
            ))}
          </div>
          {visible < transactions.length && (
            <Button
              className="mt-4 w-full"
              variant="secondary"
              size="sm"
              onClick={onMore}
            >
              Показать ещё
            </Button>
          )}
        </>
      )}
    </Panel>
  );
}

function TypeLabel({ type }: { type: Transaction["type"] }) {
  const { t } = useTranslation();
  return (
    <span
      className={`text-xs font-medium ${
        type === "income"
          ? "text-emerald-600"
          : type === "expense"
          ? "text-rose-600"
          : "text-blue-600"
      }`}
    >
      {t(`transactionTypes.${type}`)}
    </span>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="grid min-h-32 place-items-center rounded-2xl bg-zinc-50 p-6 text-center text-sm text-zinc-500 dark:bg-zinc-900/60">
      {text}
    </div>
  );
}
