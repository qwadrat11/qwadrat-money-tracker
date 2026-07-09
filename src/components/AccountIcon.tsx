import { Bitcoin, CircleEllipsis, CreditCard, Landmark, PiggyBank, Wallet, type LucideIcon } from 'lucide-react'
import type { Account } from '../types'

const icons: Record<string, LucideIcon> = {
  Bitcoin,
  CircleEllipsis,
  CreditCard,
  Landmark,
  PiggyBank,
  Wallet,
}

export function AccountIcon({ account, className = 'h-4 w-4' }: { account?: Pick<Account, 'icon'>; className?: string }) {
  const Icon = icons[account?.icon ?? ''] ?? Wallet
  return <Icon className={className} />
}
