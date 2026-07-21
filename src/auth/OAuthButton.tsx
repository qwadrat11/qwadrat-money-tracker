import { Button } from "../components/ui/Button";
import { useTranslation } from "react-i18next";

type OAuthButtonProps = {
  label: string;
  loading?: boolean;
  onClick: () => void | Promise<void>;
};

export function OAuthButton({ label, loading, onClick }: OAuthButtonProps) {
  const { t } = useTranslation();
  return (
    <Button
      type="button"
      variant="secondary"
      className="h-14 w-full rounded-[1.35rem] border-zinc-200/80 bg-white px-4 text-[15px] font-medium text-zinc-900 shadow-[0_14px_36px_rgba(24,24,27,0.06)] hover:bg-zinc-50 dark:border-zinc-800/70 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900"
      onClick={() => void onClick()}
      disabled={loading}
    >
      <GoogleMark />
      <span className="flex-1 text-left">
        {loading ? t("auth.connectingGoogle") : label}
      </span>
      <span className="text-[18px] leading-none text-zinc-400">
        {loading ? "…" : "→"}
      </span>
    </Button>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0">
      <path
        fill="#4285F4"
        d="M21.35 11.1h-9.18v2.92h5.27c-.23 1.25-.95 2.31-2.02 3.02v2.51h3.27c1.91-1.76 3.01-4.36 3.01-7.45 0-.73-.07-1.43-.19-2z"
      />
      <path
        fill="#34A853"
        d="M12.17 22c2.72 0 5.01-.9 6.68-2.45l-3.27-2.51c-.91.61-2.07.97-3.41.97-2.62 0-4.84-1.77-5.64-4.15H3.15v2.61A10 10 0 0 0 12.17 22z"
      />
      <path
        fill="#FBBC05"
        d="M6.53 13.86a6 6 0 0 1 0-3.72V7.53H3.15a10 10 0 0 0 0 8.94l3.38-2.61z"
      />
      <path
        fill="#EA4335"
        d="M12.17 5.82c1.48 0 2.8.51 3.84 1.5l2.88-2.88C17.16 2.74 14.87 1.75 12.17 1.75A10 10 0 0 0 3.15 7.53l3.38 2.61c.8-2.38 3.02-4.32 5.64-4.32z"
      />
    </svg>
  );
}
