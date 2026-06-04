import React from 'react'
import { AlertTriangle, RefreshCw, Wifi } from 'lucide-react'
import { cn } from '../utils/cn.js'

export function PageHeader({
  title,
  tabs = [],
  activeTab,
  onTabChange,
  primaryAction,
  onRefresh,
  isRefreshing = false,
  dockerStatus,
}) {
  const statusLabel = dockerStatus?.connected
    ? '已连接'
    : (dockerStatus?.message || '').includes('权限') || (dockerStatus?.message || '').includes('權限')
      ? '权限不足'
      : '连接异常'

  const tooltip = [
    dockerStatus?.endpoint,
    dockerStatus?.message,
  ].filter(Boolean).join('\n')

  return (
    <header className="mb-4 space-y-3">
      <div className="flex min-h-10 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="min-w-0 truncate text-[24px] font-semibold leading-tight tracking-normal text-slate-950 dark:text-white">{title}</h1>
        <div className="flex w-full shrink-0 items-center justify-end gap-2 sm:ml-auto sm:w-auto">
          {primaryAction}
          <button
            type="button"
            onClick={() => onRefresh?.()}
            disabled={isRefreshing}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            title="刷新当前数据"
          >
            <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
            <span>刷新</span>
          </button>
          <span
            title={tooltip}
            className={cn(
              'inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-medium',
              dockerStatus?.connected
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
                : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300'
            )}
          >
            {dockerStatus?.connected ? <Wifi className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
            <span>{statusLabel}</span>
          </span>
        </div>
      </div>

      {tabs.length > 0 && (
        <nav className="flex min-w-0 gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white/70 p-1 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/70" aria-label={`${title} 页面导航`}>
          {tabs.map(item => {
            const Icon = item.icon
            const isActive = activeTab === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onTabChange?.(item.id)}
                className={cn(
                  'inline-flex h-9 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-teal-50 text-teal-700 ring-1 ring-teal-200 dark:bg-teal-950/35 dark:text-teal-300 dark:ring-teal-900/70'
                    : 'text-slate-500 hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                )}
              >
                {Icon && <Icon className="h-4 w-4" />}
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>
      )}
    </header>
  )
}
