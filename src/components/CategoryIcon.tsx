import {
  BookOpen,
  BriefcaseBusiness,
  Car,
  CircleEllipsis,
  Coffee,
  Dumbbell,
  HeartPulse,
  Home,
  Laptop,
  Plane,
  Repeat,
  ShoppingBag,
  Sparkles,
  Train,
  Utensils,
  type LucideIcon,
} from 'lucide-react'
import type { Category } from '../types'

const icons: Record<string, LucideIcon> = {
  BookOpen,
  BriefcaseBusiness,
  Car,
  CircleEllipsis,
  Coffee,
  Dumbbell,
  HeartPulse,
  Home,
  Laptop,
  Plane,
  Repeat,
  ShoppingBag,
  Sparkles,
  Train,
  Utensils,
}

export function CategoryIcon({ category, className = 'h-4 w-4' }: { category?: Pick<Category, 'icon'>; className?: string }) {
  const Icon = icons[category?.icon ?? ''] ?? CircleEllipsis
  return <Icon className={className} />
}
