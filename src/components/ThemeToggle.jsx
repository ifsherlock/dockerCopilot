import React from 'react'
import { Moon, Sun, Palette, Monitor } from 'lucide-react'
import { useTheme } from '../hooks/useTheme'
import { cn } from '../utils/cn'

export function ThemeToggle({ collapsed = false, embedded = false }) {
  const { theme, setTheme, appearance, setAppearance } = useTheme()

  const actualTheme = theme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme

  const modes = [
    { value: 'light', label: '浅色', icon: Sun },
    { value: 'dark', label: '深色', icon: Moon },
    { value: 'system', label: '跟随系统', icon: Monitor },
  ]

  const appearances = [
    { value: 'aurora', label: '极光', swatch: 'from-cyan-400 via-blue-500 to-violet-500' },
    { value: 'night_sail', label: '夜航', swatch: 'from-slate-700 via-sky-700 to-indigo-800' },
    { value: 'mist', label: '雾白', swatch: 'from-stone-200 via-slate-200 to-zinc-300' },
  ]

  const nextTheme = () => {
    const currentIndex = modes.findIndex(item => item.value === theme)
    const nextIndex = (currentIndex + 1) % modes.length
    setTheme(modes[nextIndex].value)
  }

  const nextAppearance = () => {
    const currentIndex = appearances.findIndex(item => item.value === appearance)
    const nextIndex = (currentIndex + 1) % appearances.length
    setAppearance(appearances[nextIndex].value)
  }

  const currentMode = modes.find(item => item.value === theme) || modes[0]
  const CurrentModeIcon = currentMode.value === 'system' ? Monitor : (actualTheme === 'dark' ? Moon : Sun)
  const currentAppearance = appearances.find(item => item.value === appearance) || appearances[0]

  const baseIconButton = 'inline-flex h-10 w-10 items-center justify-center rounded-xl bg-transparent transition-colors'

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-2">
        <button
          onClick={nextTheme}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border-0 bg-transparent text-gray-600 hover:bg-transparent dark:text-gray-300 dark:hover:bg-transparent transition-colors"
          title={`当前明暗：${currentMode.label}，点击切换`}
        >
          <CurrentModeIcon className="h-5 w-5" />
        </button>
        <button
          onClick={nextAppearance}
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border-0 bg-transparent text-gray-600 hover:bg-transparent dark:text-gray-300 dark:hover:bg-transparent transition-colors"
          title={`当前外观：${currentAppearance.label}，点击切换`}
        >
          <span className={cn('absolute inset-1 rounded-md bg-gradient-to-br opacity-90', currentAppearance.swatch)} />
          <Palette className="relative h-4 w-4 text-white drop-shadow" />
        </button>
      </div>
    )
  }

  if (embedded) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={nextTheme}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-transparent transition-colors text-gray-600 hover:bg-transparent hover:text-gray-900 dark:text-gray-300 dark:hover:bg-transparent dark:hover:text-white"
          title={`当前明暗：${currentMode.label}，点击切换`}
        >
          <CurrentModeIcon className="h-6 w-6" />
        </button>
        <button
          onClick={nextAppearance}
          className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl bg-transparent transition-colors text-gray-600 hover:bg-transparent dark:text-gray-300 dark:hover:bg-transparent"
          title={`当前外观：${currentAppearance.label}，点击切换`}
        >
          <span className={cn('absolute inset-2 rounded-full bg-gradient-to-br opacity-95', currentAppearance.swatch)} />
          <Palette className="relative h-6 w-6 text-white drop-shadow" />
        </button>
      </div>
    )
  }

  return (
    <div className={cn(
      'flex items-center gap-2',
      'rounded-2xl border-0 bg-transparent p-2 shadow-none backdrop-blur-0 dark:border-0 dark:bg-transparent'
    )}>
      <button
        onClick={nextTheme}
        className={cn(
          baseIconButton,
          'text-gray-600 hover:bg-transparent hover:text-gray-900 dark:text-gray-300 dark:hover:bg-transparent dark:hover:text-white'
        )}
        title={`当前明暗：${currentMode.label}，点击切换`}
      >
        <CurrentModeIcon className="h-6 w-6" />
      </button>

      <button
        onClick={nextAppearance}
        className={cn(
          baseIconButton,
          'relative text-gray-600 hover:bg-transparent dark:text-gray-300 dark:hover:bg-transparent'
        )}
        title={`当前外观：${currentAppearance.label}，点击切换`}
      >
        <span className={cn('absolute inset-2 rounded-full bg-gradient-to-br opacity-95', currentAppearance.swatch)} />
        <Palette className="relative h-6 w-6 text-white drop-shadow" />
      </button>
    </div>
  )
}
