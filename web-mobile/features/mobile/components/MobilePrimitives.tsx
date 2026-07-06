"use client"

import type React from "react"
import { AlertCircle, Box } from "lucide-react"

import { cn } from "@/lib/utils"

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-10 text-center shadow-sm">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500">
        <AlertCircle className="h-6 w-6" />
      </div>
      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</h3>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

export function StatCard({
  label,
  value,
  accent,
  active = false,
  onClick,
  disabled = false,
}: {
  label: string
  value: string | number
  accent: string
  active?: boolean
  onClick?: () => void
  disabled?: boolean
}) {
  if (onClick || disabled) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(
          "rounded-2xl bg-white dark:bg-slate-900 p-4 text-left shadow-sm ring-1 transition-all",
          disabled
            ? "cursor-not-allowed opacity-60"
            : "cursor-pointer hover:-translate-y-0.5 hover:shadow-md",
          active ? "ring-blue-300 dark:ring-blue-700 bg-blue-50/60 dark:bg-blue-950/30" : "ring-slate-100 dark:ring-slate-700"
        )}
      >
        <div className={cn("mb-3 h-1.5 w-10 rounded-full", accent)} />
        <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</div>
        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{label}</div>
      </button>
    )
  }

  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900 p-4 shadow-sm ring-1 ring-slate-100 dark:ring-slate-700">
      <div className={cn("mb-3 h-1.5 w-10 rounded-full", accent)} />
      <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</div>
      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{label}</div>
    </div>
  )
}

export function NavItem({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean
  icon: typeof Box
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 rounded-xl px-3 py-2 text-xs font-medium transition-colors",
        active ? "text-blue-600 dark:text-blue-400" : "text-slate-500 dark:text-slate-400"
      )}
    >
      <Icon className={cn("h-5 w-5", active ? "text-blue-600 dark:text-blue-400" : "text-slate-400 dark:text-slate-500")} />
      <span>{label}</span>
    </button>
  )
}
