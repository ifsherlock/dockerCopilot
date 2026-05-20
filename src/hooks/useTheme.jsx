import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { botAPI } from '../api/client'

const ThemeContext = createContext()
const APPEARANCE_PRESETS = ['aurora', 'night_sail', 'mist']
const MODE_PRESETS = ['light', 'dark', 'system']

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState('light')
  const [appearance, setAppearanceState] = useState('aurora')
  const [loaded, setLoaded] = useState(false)
  const saveTimerRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    const loadThemePrefs = async () => {
      try {
        const res = await botAPI.getConfig()
        const telegram = res?.data?.data?.telegram || {}
        const nextTheme = MODE_PRESETS.includes(telegram.theme_mode) ? telegram.theme_mode : 'light'
        const nextAppearance = APPEARANCE_PRESETS.includes(telegram.theme_appearance) ? telegram.theme_appearance : 'aurora'
        if (!cancelled) {
          setThemeState(nextTheme)
          setAppearanceState(nextAppearance)
        }
      } catch {
        if (!cancelled) {
          setThemeState('light')
          setAppearanceState('aurora')
        }
      } finally {
        if (!cancelled) setLoaded(true)
      }
    }
    loadThemePrefs()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const root = window.document.documentElement

    const applyTheme = () => {
      if (theme === 'system') {
        const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
        root.classList.toggle('dark', systemTheme === 'dark')
      } else {
        root.classList.toggle('dark', theme === 'dark')
      }
    }

    applyTheme()

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      const handleChange = () => applyTheme()
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    }
  }, [theme])

  useEffect(() => {
    window.document.documentElement.dataset.appearance = appearance
  }, [appearance])

  useEffect(() => {
    if (!loaded) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      try {
        const res = await botAPI.getConfig()
        const data = res?.data?.data || {}
        const telegram = data.telegram || {}
        const proxy = telegram.proxy || {}
        const dockercopilot = data.dockercopilot || {}
        const instances = Array.isArray(dockercopilot.instances) ? dockercopilot.instances : []
        await botAPI.saveConfig({
          botToken: telegram.bot_token || '',
          chatIds: Array.isArray(telegram.chat_ids) ? telegram.chat_ids.join(',') : '',
          updateCheckCron: telegram.update_check_cron || '0 18 * * *',
          notifyOnUpdate: telegram.notify_on_update ?? true,
          interactiveEnabled: telegram.interactive_enabled ?? true,
          updateBlacklist: Array.isArray(telegram.update_blacklist) ? telegram.update_blacklist.join('\n') : '',
          autoCleanImages: telegram.auto_clean_images ?? false,
          cleanImagesCron: telegram.clean_images_cron || '3 2 * * *',
          autoUpdateContainers: telegram.auto_update_containers ?? false,
          updateContainersCron: telegram.update_containers_cron || '0 */6 * * *',
          proxyType: proxy.type || 'none',
          proxyHost: proxy.host || '',
          proxyPort: proxy.port || 0,
          proxyUsername: proxy.username || '',
          proxyPassword: proxy.password || '',
          defaultInstance: dockercopilot.default_instance || instances[0]?.name || 'local',
          multiInstanceEnabled: dockercopilot.multi_instance_enabled ?? false,
          instances: JSON.stringify(instances, null, 2),
          autoBackupJson: telegram.auto_backup_json ?? false,
          backupJsonCron: telegram.backup_json_cron || '0 1 * * *',
          autoBackupCompose: telegram.auto_backup_compose ?? false,
          backupComposeCron: telegram.backup_compose_cron || '30 1 * * *',
          backupMaxFiles: telegram.backup_max_files || 20,
          imageAccelerators: Array.isArray(telegram.image_accelerators) ? telegram.image_accelerators.join('\n') : '',
          defaultImageAccelerator: telegram.default_image_accelerator || '',
          themeMode: theme,
          themeAppearance: appearance,
        })
      } catch {}
    }, 250)
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [theme, appearance, loaded])

  const value = {
    theme,
    setTheme: (newTheme) => {
      setThemeState(MODE_PRESETS.includes(newTheme) ? newTheme : 'light')
    },
    appearance,
    setAppearance: (next) => {
      setAppearanceState(APPEARANCE_PRESETS.includes(next) ? next : 'aurora')
    },
    loaded,
  }

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
