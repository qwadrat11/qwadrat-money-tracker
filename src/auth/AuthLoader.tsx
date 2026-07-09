export function AuthLoader() {
  return (
    <div className="safe-area-page grid min-h-screen place-items-center bg-[var(--app-bg)] px-4">
      <div className="w-full max-w-[420px] rounded-[2rem] border border-white/60 bg-white/80 p-6 text-center shadow-[0_24px_80px_rgba(24,24,27,0.08)] backdrop-blur-xl dark:border-zinc-800/60 dark:bg-zinc-950/80">
        <div className="mx-auto h-12 w-12 animate-pulse rounded-[1.35rem] bg-zinc-200 dark:bg-zinc-800" />
        <p className="mt-4 text-[15px] text-zinc-500">Проверяем сессию...</p>
      </div>
    </div>
  )
}
