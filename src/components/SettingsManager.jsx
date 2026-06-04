import React, { useMemo, useState } from 'react'
import { ArchiveRestore, Bot as BotIcon } from 'lucide-react'
import { Backups } from './Backups.jsx'
import { Bot } from './Bot.jsx'
import { cn } from '../utils/cn.js'

const settingTabs = [
  { id: 'automation', label: '自动化', icon: BotIcon, hint: '通知、任务、多实例' },
  { id: 'backup', label: '备份恢复', icon: ArchiveRestore, hint: '导出、恢复、定时备份' },
]

export function SettingsManager({ onNavigate }) {
  const [active, setActive] = useState('automation')
  const activeMeta = useMemo(() => settingTabs.find(item => item.id === active) || settingTabs[0], [active])
  const ActiveIcon = activeMeta.icon

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <ActiveIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-slate-950 dark:text-white">{activeMeta.label}</h3>
              <p className="truncate text-sm text-slate-500 dark:text-slate-400">{activeMeta.hint}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap">
            {settingTabs.map(item => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActive(item.id)}
                  className={cn(
                    'inline-flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2 text-left transition',
                    active === item.id
                      ? 'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900/70 dark:bg-teal-950/40 dark:text-teal-300'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate text-sm font-medium">{item.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white/85 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/85">
        {active === 'automation' && <Bot />}
        {active === 'backup' && <Backups />}
      </section>
    </div>
  )
}

