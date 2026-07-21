import { useEffect, useRef, useState, type FormEvent } from "react";
import { CircleCheckBig, LockKeyhole, Mail } from "lucide-react";
import { Button } from "../components/ui/Button";
import { useAuth } from "./useAuth";
import { useToast } from "../components/ui/toastContext";
import { AuthInput } from "./AuthInput";
import { AuthSegmentedControl } from "./AuthSegmentedControl";
import { OAuthButton } from "./OAuthButton";
import { AuthRequestError } from "./authErrors";
import { useTranslation } from "react-i18next";
import { useLocale } from "../i18n/useLocale";
import {
  localeMetadata,
  supportedLocales,
  type AppLocale,
} from "../i18n/types";

type Mode = "sign-in" | "sign-up";
type ScreenState = "form" | "confirmation";
type LoadingState = "email" | "google" | null;
type AuthIssue = {
  message: string;
  cooldownSeconds?: number;
};

const signupCooldownKey = "qwadrat-finance-tracker:auth:signupCooldownUntil";

export function AuthScreen() {
  const { signIn, signUp, signInWithGoogle, isConfigured } = useAuth();
  const { notify } = useToast();
  const { t } = useTranslation();
  const { locale, changeLocale, saving: localeSaving } = useLocale();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [screenState, setScreenState] = useState<ScreenState>("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState<LoadingState>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const submitLockRef = useRef(false);

  useEffect(() => {
    const persistedCooldown = Number(
      localStorage.getItem(signupCooldownKey) ?? "0"
    );
    if (
      !Number.isFinite(persistedCooldown) ||
      persistedCooldown <= Date.now()
    ) {
      return;
    }
    setCooldownSeconds(
      Math.max(1, Math.ceil((persistedCooldown - Date.now()) / 1000))
    );
  }, []);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;

    const timer = window.setInterval(() => {
      setCooldownSeconds((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          localStorage.removeItem(signupCooldownKey);
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [cooldownSeconds]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitLockRef.current || loading === "email" || cooldownSeconds > 0)
      return;

    const normalizedEmail = email.trim();
    const validationError = validateAuthForm({
      mode,
      email: normalizedEmail,
      password,
      confirmPassword,
    });

    if (validationError) {
      notify(validationError.message);
      if (validationError.cooldownSeconds) {
        setCooldownSeconds(validationError.cooldownSeconds);
        localStorage.setItem(
          signupCooldownKey,
          String(Date.now() + validationError.cooldownSeconds * 1000)
        );
      }
      return;
    }

    submitLockRef.current = true;
    setLoading("email");

    try {
      if (mode === "sign-in") {
        await signIn(normalizedEmail, password);
        return;
      }

      const result = await signUp(normalizedEmail, password);
      if (!result.session) {
        setScreenState("confirmation");
      }
    } catch (error_) {
      const issue = mapAuthIssue(error_);
      notify(issue.message);
      if (issue.cooldownSeconds) {
        setCooldownSeconds(issue.cooldownSeconds);
        localStorage.setItem(
          signupCooldownKey,
          String(Date.now() + issue.cooldownSeconds * 1000)
        );
      }
    } finally {
      setLoading(null);
      submitLockRef.current = false;
    }
  }

  async function handleGoogleSignIn() {
    if (submitLockRef.current || loading !== null) return;
    submitLockRef.current = true;
    setLoading("google");

    try {
      await signInWithGoogle();
    } catch (error_) {
      const issue = mapAuthIssue(error_);
      notify(issue.message);
    } finally {
      setLoading(null);
      submitLockRef.current = false;
    }
  }

  return (
    <div className="safe-area-page relative flex min-h-[100dvh] items-start justify-center overflow-y-auto overflow-x-hidden bg-[#f4f4f6] px-4 py-6 text-zinc-950 sm:items-center">
      <select
        aria-label={t("settings.interfaceLanguage")}
        className="absolute right-4 top-[calc(env(safe-area-inset-top)+1rem)] z-20 h-10 rounded-xl border border-zinc-200 bg-white/80 px-3 text-sm font-medium backdrop-blur"
        value={locale}
        disabled={localeSaving}
        onChange={(event) => void changeLocale(event.target.value as AppLocale)}
      >
        {supportedLocales.map((item) => (
          <option key={item} value={item}>
            {localeMetadata[item].short}
          </option>
        ))}
      </select>
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[8%] top-[8%] h-60 w-60 rounded-full bg-white/60 blur-3xl" />
        <div className="absolute right-[4%] top-[16%] h-72 w-72 rounded-full bg-zinc-200/45 blur-3xl" />
        <div className="absolute bottom-[8%] left-[20%] h-64 w-64 rounded-full bg-zinc-300/30 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.82),transparent_42%),linear-gradient(to_bottom,rgba(244,244,246,0.94),rgba(244,244,246,1))]" />
      </div>

      <div className="relative w-full max-w-[460px]">
        <div className="mb-8 text-center">
          <img
            src="/favicon.svg"
            alt="qwadrat Finance Tracker"
            className="mx-auto h-16 w-16 rounded-[1.35rem] shadow-[0_16px_40px_rgba(24,24,27,0.16)]"
          />
          <p className="mt-4 text-[15px] font-semibold tracking-tight text-zinc-700">
            qwadrat Finance Tracker
          </p>
          <h1 className="mt-2 text-[34px] font-medium tracking-tight sm:text-[38px]">
            {t("auth.welcome")}
          </h1>
          <p className="mt-2 text-[16px] text-zinc-500">{t("auth.subtitle")}</p>
        </div>

        <div className="animate-sheet overflow-hidden rounded-[32px] bg-white/84 p-6 shadow-[0_24px_90px_rgba(24,24,27,0.08)] backdrop-blur-xl sm:p-7">
          {screenState === "confirmation" ? (
            <div className="animate-enter space-y-5 text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-600">
                <CircleCheckBig className="h-7 w-7" />
              </div>
              <div>
                <p className="text-[29px] font-medium tracking-tight text-zinc-950">
                  Проверьте почту
                </p>
                <p className="mt-2 text-[16px] leading-6 text-zinc-500">
                  Мы отправили письмо для подтверждения аккаунта.
                </p>
              </div>
              <Button
                className="h-14 w-full rounded-[1.35rem] text-[15px]"
                onClick={() => {
                  setScreenState("form");
                  setMode("sign-in");
                }}
              >
                Вернуться ко входу
              </Button>
            </div>
          ) : (
            <div className="animate-enter space-y-5">
              <OAuthButton
                label={t("auth.continueGoogle")}
                loading={loading === "google"}
                onClick={handleGoogleSignIn}
              />

              <div className="flex items-center gap-3 px-1 text-[12px] uppercase tracking-[0.24em] text-zinc-400">
                <span className="h-px flex-1 bg-zinc-200/80 dark:bg-zinc-800/80" />
                <span>{t("auth.or")}</span>
                <span className="h-px flex-1 bg-zinc-200/80 dark:bg-zinc-800/80" />
              </div>

              <form
                className="space-y-4"
                onSubmit={(event) => void handleSubmit(event)}
              >
                <AuthSegmentedControl
                  value={mode}
                  onChange={(next) => {
                    setMode(next);
                  }}
                />

                {!isConfigured && (
                  <div className="rounded-[1.35rem] bg-amber-50 px-4 py-3 text-[13px] leading-5 text-amber-900">
                    Supabase не настроен. Добавьте{" "}
                    <span className="font-medium">VITE_SUPABASE_URL</span> и{" "}
                    <span className="font-medium">VITE_SUPABASE_ANON_KEY</span>.
                  </div>
                )}

                <AuthInput
                  label={t("auth.email")}
                  icon={<Mail className="h-4 w-4" />}
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />

                <AuthInput
                  label={t("auth.password")}
                  icon={<LockKeyhole className="h-4 w-4" />}
                  type="password"
                  autoComplete={
                    mode === "sign-in" ? "current-password" : "new-password"
                  }
                  placeholder={
                    mode === "sign-in"
                      ? t("auth.enterPassword")
                      : t("auth.passwordHint")
                  }
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />

                {mode === "sign-up" && (
                  <AuthInput
                    label={t("auth.confirmPassword")}
                    icon={<LockKeyhole className="h-4 w-4" />}
                    type="password"
                    autoComplete="new-password"
                    placeholder={t("auth.repeatPassword")}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                  />
                )}

                <Button
                  type="submit"
                  className="h-14 w-full rounded-[1.35rem] text-[15px] font-medium"
                  disabled={
                    loading !== null ||
                    cooldownSeconds > 0 ||
                    !email.trim() ||
                    !password.trim() ||
                    password.trim().length < 6 ||
                    (mode === "sign-up" && !confirmPassword.trim()) ||
                    (mode === "sign-up" && password !== confirmPassword)
                  }
                >
                  {loading === "email"
                    ? t("auth.checking")
                    : loading === "google"
                    ? t("auth.openingGoogle")
                    : cooldownSeconds > 0
                    ? `Повторить можно через ${cooldownSeconds} сек`
                    : mode === "sign-in"
                    ? t("auth.signIn")
                    : t("auth.signUp")}
                  {loading === null && (
                    <span className="text-[18px] leading-none">→</span>
                  )}
                </Button>
              </form>

              <div className="flex items-start gap-2 rounded-[1.35rem] bg-zinc-50 px-4 py-3 text-[13px] leading-5 text-zinc-500">
                <CircleCheckBig className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
                <span>
                  Вход выполняется по email и паролю. Сессия сохраняется
                  автоматически.
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function mapAuthIssue(error: unknown): AuthIssue {
  const authError =
    error instanceof AuthRequestError
      ? error
      : (error as {
          message?: string;
          code?: string | null;
          status?: number | null;
          name?: string | null;
          details?: string | null;
          hint?: string | null;
        });
  const payload =
    authError.message ??
    (error instanceof Error
      ? error.message
      : typeof error === "string"
      ? error
      : "");
  const combined = [authError.code, payload, authError.details, authError.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const cooldownSeconds = extractCooldownSeconds(combined);

  if (
    combined.includes("too many requests") ||
    combined.includes("rate limit") ||
    combined.includes("over_email_send_rate_limit") ||
    combined.includes("email rate limit exceeded")
  ) {
    return {
      message: cooldownSeconds
        ? `Слишком много попыток. Подождите ${cooldownSeconds} сек и попробуйте снова.`
        : "Слишком много попыток. Подождите 1–2 минуты и попробуйте снова.",
      cooldownSeconds: cooldownSeconds ?? 60,
    };
  }

  if (
    combined.includes("signup_disabled") ||
    combined.includes("registration disabled") ||
    combined.includes("registration is disabled")
  ) {
    return { message: "Регистрация отключена в настройках Supabase." };
  }

  if (
    combined.includes("invalid_credentials") ||
    combined.includes("invalid login credentials")
  )
    return { message: "Неверный email или пароль" };
  if (
    combined.includes("user_already_exists") ||
    combined.includes("already registered") ||
    combined.includes("already exists")
  )
    return { message: "Аккаунт с такой почтой уже существует" };
  if (
    combined.includes("weak_password") ||
    combined.includes("password should be at least")
  ) {
    return { message: "Пароль слишком короткий" };
  }
  if (
    combined.includes("invalid_email") ||
    combined.includes("email is invalid") ||
    combined.includes("invalid email")
  ) {
    return { message: "Введите корректный email" };
  }
  if (
    combined.includes("email_not_confirmed") ||
    combined.includes("email not confirmed") ||
    combined.includes("confirm") ||
    combined.includes("verification")
  ) {
    return { message: "Подтвердите почту перед входом" };
  }
  if (
    combined.includes("signup disabled") ||
    combined.includes("registration disabled")
  ) {
    return { message: "Регистрация отключена в настройках Supabase." };
  }
  if (
    combined.includes("network") ||
    combined.includes("fetch") ||
    combined.includes("failed to fetch")
  ) {
    return { message: "Не удалось подключиться к Supabase" };
  }

  return {
    message: payload || "Не удалось выполнить запрос. Попробуйте еще раз",
  };
}

function extractCooldownSeconds(message: string) {
  const text = message.toLowerCase();
  const match = text.match(
    /(\d+)\s*(second|seconds|sec|secs|сек|секунд|секунды)/i
  );
  if (match?.[1]) return Math.max(1, Number(match[1]));

  const minutesMatch = text.match(
    /(\d+)\s*(minute|minutes|min|mins|минута|минут|минуты)/i
  );
  if (minutesMatch?.[1]) return Math.max(1, Number(minutesMatch[1]) * 60);

  if (
    text.includes("too many requests") ||
    text.includes("rate limit") ||
    text.includes("over_email_send_rate_limit") ||
    text.includes("email rate limit exceeded")
  ) {
    return 60;
  }

  return undefined;
}

function validateAuthForm({
  mode,
  email,
  password,
  confirmPassword,
}: {
  mode: Mode;
  email: string;
  password: string;
  confirmPassword: string;
}): AuthIssue | null {
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return { message: "Введите корректный email" };
  }
  if (password.trim().length < 6) {
    return { message: "Пароль должен быть минимум 6 символов" };
  }
  if (mode === "sign-up" && password !== confirmPassword) {
    return { message: "Пароли не совпадают" };
  }
  return null;
}
