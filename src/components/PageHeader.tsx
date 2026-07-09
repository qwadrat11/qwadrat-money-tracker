export function PageHeader({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="mb-5 flex flex-col gap-4 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-3xl">
        <h1 className="ds-display text-zinc-950 dark:text-zinc-50">{title}</h1>
        <p className="ds-caption mt-3 text-zinc-500 dark:text-zinc-400">{description}</p>
      </div>
      {action}
    </div>
  )
}
