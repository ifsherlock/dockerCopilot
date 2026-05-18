import React from 'react'
import { Moon, Sun, Monitor } from 'lucide-react'
import { useTheme } from '../hooks/useTheme'
import { cn } from '../utils/cn'

export function ThemeToggle({ collapsed = false, embedded = false }) {
  const { theme, setTheme } = useTheme()

  // 获取当前实际应用的主题（当theme为system时，返回系统实际主题）
  const getActualTheme = () => {
    if (theme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }
    return theme
  }

  const themes = [
    { value: 'light', label: '浅色', icon: Sun },
    { value: 'dark', label: '深色', icon: Moon },
    { value: 'system', label: '系统', icon: Monitor },
  ]

  if (collapsed) {
    // 收起状态：只显示当前主题的图标，点击循环切换
    // 如果是系统主题，显示系统当前实际主题的图标
    const actualTheme = getActualTheme()
    const displayTheme = theme === 'system' ? 'system' : actualTheme
    const currentTheme = themes.find(t => t.value === displayTheme)
    const Icon = currentTheme.icon

    return (
      <button
        onClick={() => {
          const currentIndex = themes.findIndex(t => t.value === theme)
          const nextIndex = (currentIndex + 1) % themes.length
          setTheme(themes[nextIndex].value)
        }}
        className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
        title={`当前: ${currentTheme.label} (点击切换)`}
      >
        <Icon className="h-5 w-5" />
      </button>
    )
  }

  return (
    <div className={cn(
      "flex items-center space-x-1 rounded-lg p-1",
      embedded ? "bg-transparent p-0" : "bg-gray-100 dark:bg-gray-800"
    )}>
      {themes.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          className={cn(
            'flex items-center justify-center p-2 rounded-md transition-all duration-200',
            theme === value
              ? 'bg-white dark:bg-gray-700 text-primary-600 dark:text-primary-400 shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          )}
          title={label}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  )
}
