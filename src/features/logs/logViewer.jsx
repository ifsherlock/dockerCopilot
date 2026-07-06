import React, { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

export function useSharedLogTheme() {
  const [logTheme, setLogTheme] = useState(() => localStorage.getItem('docker_copilot_logs_theme') || 'dark')

  useEffect(() => {
    localStorage.setItem('docker_copilot_logs_theme', logTheme)
  }, [logTheme])

  return {
    darkTheme: logTheme === 'dark',
    toggleLogTheme: () => setLogTheme(v => v === 'dark' ? 'light' : 'dark')
  }
}

export function logThemeButtonClass(darkTheme, active, color = 'amber') {
  if (!active) {
    return darkTheme
      ? 'border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800'
      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
  }
  const activeMap = {
    amber: darkTheme
      ? 'border-amber-500/40 bg-amber-500/12 text-amber-300 shadow-[0_0_0_1px_rgba(251,191,36,0.15)]'
      : 'border-amber-300 bg-amber-50 text-amber-700 shadow-[0_0_0_1px_rgba(251,191,36,0.12)]',
    sky: darkTheme
      ? 'border-sky-500/40 bg-sky-500/12 text-sky-300 shadow-[0_0_0_1px_rgba(56,189,248,0.15)]'
      : 'border-sky-300 bg-sky-50 text-sky-700 shadow-[0_0_0_1px_rgba(56,189,248,0.12)]',
  }
  return activeMap[color] || activeMap.amber
}

export function plainControlClass(darkTheme, widthClass = '') {
  return `h-10 ${widthClass} rounded-xl border px-3 text-sm outline-none transition-colors focus:border-sky-500 ${
    darkTheme
      ? 'border-slate-700 bg-[#0b0f14] text-slate-100 placeholder:text-slate-500'
      : 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400'
  }`
}

export function PlainLogViewer({ title, logs, loading, message, controls, darkTheme = true, onToggleTheme }) {
  const renderedControls = typeof controls === 'function' ? controls({ darkTheme }) : controls
  return (
    <div className="flex h-[72vh] flex-col gap-3 xl:h-[78vh]">
      {message ? (
        <div className={`shrink-0 rounded-xl border px-3 py-2 text-sm ${darkTheme ? 'border-amber-800 bg-amber-950/40 text-amber-300' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
          {message}
        </div>
      ) : null}
      <section className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border shadow-sm ${darkTheme ? 'border-slate-900 bg-[#0b0f14]' : 'border-slate-200 bg-[#f8fafc]'}`}>
        <div className={`flex shrink-0 flex-col gap-3 border-b px-4 py-3 md:flex-row md:items-center md:justify-between ${darkTheme ? 'border-slate-800 bg-[#10161d]' : 'border-slate-200 bg-white'}`}>
          <div className="min-w-0">
            <div className={`truncate text-base font-semibold ${darkTheme ? 'text-slate-100' : 'text-slate-900'}`}>{title}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {renderedControls}
            {onToggleTheme ? (
              <button
                type="button"
                onClick={onToggleTheme}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${logThemeButtonClass(darkTheme, true, 'amber')}`}
                title={darkTheme ? '切换到白天' : '切换到黑夜'}
              >
                {darkTheme ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
            ) : null}
          </div>
        </div>
        <pre className={`dc-scrollbar-soft min-h-0 flex-1 overflow-auto p-4 font-mono text-xs leading-6 whitespace-pre-wrap break-words ${darkTheme ? 'text-slate-100' : 'text-slate-800'}`}>
          {loading ? '正在读取日志...' : (logs || '暂无日志')}
        </pre>
      </section>
    </div>
  )
}
