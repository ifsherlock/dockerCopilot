import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Bot as BotIcon,
  Save,
  RefreshCw,
  Trash2,
  Bell,
  Clock,
  Ban,
  Globe,
  Eye,
  EyeOff,
  Search,
  X,
  Server,
  Plus,
  Download,
  Upload,
  FileJson
} from 'lucide-react'
import { cn } from '../utils/cn.js'
import { botAPI, containerAPI } from '../api/client.js'

const cardClass = 'rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm'
const cardHeaderClass = 'flex items-center justify-between gap-4 border-b border-gray-200 dark:border-gray-700 px-5 py-4'
const cardBodyClass = 'p-5'

function SectionToggle({ checked, onChange, textOn = 'ON', textOff = 'OFF' }) {
  return (
    <button onClick={onChange} className="inline-flex items-center gap-2">
      <span className={cn('relative h-6 w-11 rounded-full transition-colors', checked ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600')}>
        <span className={cn('absolute top-1 h-4 w-4 rounded-full bg-white transition-transform', checked ? 'left-6' : 'left-1')} />
      </span>
      <span className={cn('text-xs font-semibold', checked ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400')}>
        {checked ? textOn : textOff}
      </span>
    </button>
  )
}

function Field({ label, children, full = false }) {
  return (
    <div className={cn(full ? 'sm:col-span-2' : '', 'space-y-1')}>
      <label className="block text-sm text-gray-600 dark:text-gray-400">{label}</label>
      {children}
    </div>
  )
}

const inputClass = 'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-transparent focus:ring-2 focus:ring-primary-500'

export function Bot() {
  const [config, setConfig] = useState({
    botToken: '',
    chatIds: '',
    updateCheckCron: '0 18 * * *',
    notifyOnUpdate: true,
    interactiveEnabled: true,
    updateBlacklist: '',
    autoCleanImages: false,
    cleanImagesCron: '3 2 * * *',
    autoUpdateContainers: false,
    updateContainersCron: '0 */6 * * *',
    proxyType: 'none',
    proxyHost: '',
    proxyPort: '',
    proxyUsername: '',
    proxyPassword: '',
    hostLanIp: '',
    multiInstanceEnabled: false,
    defaultInstance: 'local',
    instances: JSON.stringify([{ name: 'local', api_url: 'http://127.0.0.1:12712', secret_key: '', timeout: 30 }]),
    autoBackupJson: false,
    backupJsonCron: '0 1 * * *',
    autoBackupCompose: false,
    backupComposeCron: '30 1 * * *',
    backupMaxFiles: 20,
  })
  const [showToken, setShowToken] = useState(false)
  const [showProxyPassword, setShowProxyPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [containers, setContainers] = useState([])
  const [blacklistSearch, setBlacklistSearch] = useState('')
  const [showInstanceSettings, setShowInstanceSettings] = useState(false)
  const [blacklistInstance, setBlacklistInstance] = useState('local')
  const [dirty, setDirty] = useState(false)
  const fileInputRef = useRef(null)

  const loadConfig = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true)
      const res = await botAPI.getConfig()
      const data = res.data?.data || {}
      const telegram = data.telegram || {}
      const proxy = telegram.proxy || {}
      const dockercopilot = data.dockercopilot || {}
      const instances = Array.isArray(dockercopilot.instances) && dockercopilot.instances.length > 0
        ? dockercopilot.instances
        : [{ name: 'local', api_url: 'http://127.0.0.1:12712', secret_key: '', timeout: 30 }]
      const defaultInstance = dockercopilot.default_instance || instances[0]?.name || 'local'
      const effectiveMultiInstance = Boolean((dockercopilot.multi_instance_enabled ?? false) || instances.length > 1)
      setBlacklistInstance(defaultInstance)
      setShowInstanceSettings(effectiveMultiInstance)
      setConfig(prev => ({
        ...prev,
        botToken: telegram.bot_token || '',
        chatIds: Array.isArray(telegram.chat_ids) ? telegram.chat_ids.join(',') : '',
        updateCheckCron: telegram.update_check_cron || prev.updateCheckCron,
        notifyOnUpdate: telegram.notify_on_update ?? true,
        interactiveEnabled: telegram.interactive_enabled ?? true,
        updateBlacklist: Array.isArray(telegram.update_blacklist) ? telegram.update_blacklist.join('\n') : '',
        autoCleanImages: telegram.auto_clean_images ?? false,
        cleanImagesCron: telegram.clean_images_cron || prev.cleanImagesCron,
        autoUpdateContainers: telegram.auto_update_containers ?? false,
        updateContainersCron: telegram.update_containers_cron || prev.updateContainersCron,
        proxyType: proxy.type || 'none',
        proxyHost: proxy.host || '',
        proxyPort: proxy.port ? String(proxy.port) : '',
        proxyUsername: proxy.username || '',
        proxyPassword: proxy.password || '',
        hostLanIp: dockercopilot.host_lan_ip || '',
        multiInstanceEnabled: dockercopilot.multi_instance_enabled ?? false,
        defaultInstance,
        instances: JSON.stringify(instances, null, 2),
        autoBackupJson: telegram.auto_backup_json ?? false,
        backupJsonCron: telegram.backup_json_cron || '0 1 * * *',
        autoBackupCompose: telegram.auto_backup_compose ?? false,
        backupComposeCron: telegram.backup_compose_cron || '30 1 * * *',
        backupMaxFiles: telegram.backup_max_files || 20,
      }))
      setDirty(false)
    } catch (error) {
      setMessage(`读取配置失败：${error.response?.data?.msg || error.message}`)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const loadContainers = async () => {
      try {
        const res = await containerAPI.getContainers()
        if (res.data?.code === 200 || res.data?.code === 0) {
          setContainers(res.data?.data || [])
        }
      } catch (error) {
        console.error('读取容器列表失败:', error)
      }
    }
    loadContainers()
    loadConfig()
  }, [loadConfig])

  const handleChange = (field, value) => {
    setDirty(true)
    setConfig(prev => ({ ...prev, [field]: value }))
  }

  const parsedInstances = (() => {
    try {
      const value = JSON.parse(config.instances || '[]')
      return Array.isArray(value) ? value : []
    } catch {
      return []
    }
  })()

  const updateInstance = (index, field, value) => {
    const isLocal = String(parsedInstances[index]?.name || '').toLowerCase() === 'local'
    if (isLocal && (field === 'name' || field === 'api_url')) return
    const next = parsedInstances.map((inst, i) => i === index ? { ...inst, [field]: field === 'timeout' ? Number(value || 0) : value } : inst)
    handleChange('instances', JSON.stringify(next, null, 2))
    if (index === 0 && field === 'name') {
      handleChange('defaultInstance', value || 'local')
    }
  }

  const addInstance = () => {
    const next = [...parsedInstances, { name: `instance-${parsedInstances.length + 1}`, api_url: 'http://127.0.0.1:12712', secret_key: '', timeout: 30 }]
    handleChange('instances', JSON.stringify(next, null, 2))
    if (next.length > 1) setShowInstanceSettings(true)
  }

  const removeInstance = (index) => {
    const name = String(parsedInstances[index]?.name || '').toLowerCase()
    if (name === 'local') return
    const next = parsedInstances.filter((_, i) => i !== index)
    handleChange('instances', JSON.stringify(next, null, 2))
    if (next.length <= 1) setShowInstanceSettings(false)
    if (!next.some(inst => inst.name === config.defaultInstance)) {
      handleChange('defaultInstance', next[0]?.name || '')
    }
  }

  const isLocalBlacklistInstance = blacklistInstance === config.defaultInstance || blacklistInstance === 'local'
  const selectedBlacklist = config.updateBlacklist.split(/[\n,;]+/).map(item => item.trim()).filter(Boolean)

  const normalizeImageName = (value) => String(value || '').trim().replace(/^https?:\/\//, '').replace(/^registry-1\.docker\.io\//, '').replace(/^docker\.io\//, '').replace(/^library\//, '').toLowerCase()
  const canonicalImageName = (value) => {
    let v = normalizeImageName(value)
    if (!v) return ''
    const slash = v.lastIndexOf('/')
    const colon = v.lastIndexOf(':')
    if (colon <= slash && !v.includes('@')) v = `${v}:latest`
    return v
  }

  const setSelectedBlacklist = async (items) => {
    const next = Array.from(new Set(items.map(item => canonicalImageName(item) || normalizeImageName(item)).filter(Boolean)))
    setConfig(prev => ({ ...prev, updateBlacklist: next.join('\n') }))
    try {
      const res = await botAPI.saveUpdateBlacklist(next)
      if (res.data?.code >= 200 && res.data?.code < 300) {
        const saved = Array.isArray(res.data?.data) ? res.data.data : next
        setConfig(prev => ({ ...prev, updateBlacklist: saved.join('\n') }))
        setDirty(true)
        setMessage('更新黑名单已保存。')
      } else {
        setMessage(`黑名单保存失败：${res.data?.msg || '未知错误'}`)
      }
    } catch (error) {
      setMessage(`黑名单保存失败：${error.response?.data?.msg || error.message}`)
    }
  }

  const getBlacklistKey = (container) => canonicalImageName(container?.usingImage || container?.createImage) || normalizeImageName(container?.name)
  const filteredBlacklistContainers = containers.filter(container => {
    const keyword = blacklistSearch.trim().toLowerCase()
    if (!keyword) return true
    return [container.name, container.usingImage, container.createImage, container.status].some(value => String(value || '').toLowerCase().includes(keyword))
  })

  const normalizeCronExpression = (value) => String(value || '').trim().replace(/\s+/g, ' ')
  const splitCronFields = (value) => normalizeCronExpression(value).split(' ').filter(Boolean)
  const explainCronField = (field, min, max) => {
    if (!field) return '不能为空'
    const parts = String(field).split(',')
    for (const part of parts) {
      if (!part) return '列表里有空项'
      const [rangePart, stepPart] = part.split('/')
      if (part.split('/').length > 2) return `字段「${field}」的 / 只能出现一次`
      if (stepPart !== undefined && (!/^\d+$/.test(stepPart) || Number(stepPart) <= 0)) return `步长「${stepPart}」无效`
      if (rangePart === '*') continue
      if (rangePart.includes('-')) {
        const [start, end] = rangePart.split('-')
        if (!/^\d+$/.test(start) || !/^\d+$/.test(end)) return `范围「${rangePart}」无效`
        const a = Number(start), b = Number(end)
        if (a > b || a < min || b > max) return `范围「${rangePart}」应在 ${min}-${max}`
        continue
      }
      if (!/^\d+$/.test(rangePart)) return `字段「${field}」只能使用数字、*、,、-、/`
      const n = Number(rangePart)
      if (n < min || n > max) return `数值「${rangePart}」应在 ${min}-${max}`
    }
    return ''
  }

  const validateCronExpression = (value) => {
    const cron = normalizeCronExpression(value)
    const fields = splitCronFields(cron)
    if (fields.length !== 5) return { ok: false, normalized: cron, message: `Cron 必须是 5 段；当前是 ${fields.length} 段。例：40 13 * * *` }
    const ranges = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]]
    for (let i = 0; i < fields.length; i++) {
      const err = explainCronField(fields[i], ranges[i][0], ranges[i][1])
      if (err) return { ok: false, normalized: cron, message: `第 ${i + 1} 段无效：${err}` }
    }
    return { ok: true, normalized: cron, message: '' }
  }

  const getCronError = (field) => {
    const result = validateCronExpression(config[field])
    return result.ok ? '' : result.message
  }

  const renderCronInput = (field, placeholder, helper) => {
    const error = getCronError(field)
    return (
      <>
        <input
          type="text"
          value={config[field]}
          onChange={(e) => handleChange(field, e.target.value)}
          onBlur={() => handleChange(field, normalizeCronExpression(config[field]))}
          placeholder={placeholder}
          className={cn(inputClass, error && 'border-red-300 dark:border-red-700 focus:ring-red-500')}
        />
        {helper && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{helper}</p>}
        {error && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{error}</p>}
      </>
    )
  }

  const buildConfigExport = () => ({
    botToken: config.botToken || '',
    chatIds: config.chatIds || '',
    updateCheckCron: config.updateCheckCron || '0 18 * * *',
    notifyOnUpdate: !!config.notifyOnUpdate,
    interactiveEnabled: !!config.interactiveEnabled,
    updateBlacklist: config.updateBlacklist || '',
    autoCleanImages: !!config.autoCleanImages,
    cleanImagesCron: config.cleanImagesCron || '3 2 * * *',
    autoUpdateContainers: !!config.autoUpdateContainers,
    updateContainersCron: config.updateContainersCron || '0 */6 * * *',
    proxyType: config.proxyType || 'none',
    proxyHost: config.proxyHost || '',
    proxyPort: config.proxyPort || '',
    proxyUsername: config.proxyUsername || '',
    proxyPassword: config.proxyPassword || '',
    hostLanIp: config.hostLanIp || '',
    multiInstanceEnabled: !!showInstanceSettings,
    instances: config.instances || '[]',
    autoBackupJson: !!config.autoBackupJson,
    backupJsonCron: config.backupJsonCron || '0 1 * * *',
    autoBackupCompose: !!config.autoBackupCompose,
    backupComposeCron: config.backupComposeCron || '30 1 * * *',
    backupMaxFiles: config.backupMaxFiles || 20,
  })

  const downloadConfigFile = () => {
    const payload = buildConfigExport()
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'dockercopilot-tg-config.json'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    setMessage('配置文件已下载。')
  }

  const importConfigObject = (raw) => {
    const next = {
      ...config,
      botToken: raw?.botToken ?? '',
      chatIds: raw?.chatIds ?? '',
      updateCheckCron: raw?.updateCheckCron ?? '0 18 * * *',
      notifyOnUpdate: raw?.notifyOnUpdate ?? true,
      interactiveEnabled: raw?.interactiveEnabled ?? true,
      updateBlacklist: raw?.updateBlacklist ?? '',
      autoCleanImages: raw?.autoCleanImages ?? false,
      cleanImagesCron: raw?.cleanImagesCron ?? '3 2 * * *',
      autoUpdateContainers: raw?.autoUpdateContainers ?? false,
      updateContainersCron: raw?.updateContainersCron ?? '0 */6 * * *',
      proxyType: raw?.proxyType ?? 'none',
      proxyHost: raw?.proxyHost ?? '',
      proxyPort: raw?.proxyPort ? String(raw.proxyPort) : '',
      proxyUsername: raw?.proxyUsername ?? '',
      proxyPassword: raw?.proxyPassword ?? '',
      hostLanIp: raw?.hostLanIp ?? '',
      defaultInstance: (() => {
        try {
          const list = JSON.parse(raw?.instances || '[]')
          return Array.isArray(list) && list.length > 0 ? (list[0]?.name || 'local') : 'local'
        } catch {
          return 'local'
        }
      })(),
      instances: (() => {
        try {
          const list = JSON.parse(raw?.instances || '[]')
          return JSON.stringify(Array.isArray(list) ? list : [], null, 2)
        } catch {
          return config.instances || '[]'
        }
      })(),
      autoBackupJson: raw?.autoBackupJson ?? false,
      backupJsonCron: raw?.backupJsonCron ?? '0 1 * * *',
      autoBackupCompose: raw?.autoBackupCompose ?? false,
      backupComposeCron: raw?.backupComposeCron ?? '30 1 * * *',
      backupMaxFiles: raw?.backupMaxFiles ?? 20,
    }
    setConfig(next)
    try {
      const list = JSON.parse(next.instances || '[]')
      if (Array.isArray(list) && list.length > 0) {
        setBlacklistInstance(list[0]?.name || 'local')
      }
      setShowInstanceSettings(Boolean(raw?.multiInstanceEnabled || (Array.isArray(list) && list.length > 1)))
    } catch {
      setShowInstanceSettings(!!raw?.multiInstanceEnabled)
    }
    setDirty(true)
    setMessage('配置文件已导入，请点击“保存配置”写入后端。')
  }

  const handleUploadConfigFile = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      importConfigObject(parsed)
    } catch (error) {
      setMessage(`配置文件导入失败：${error.message || 'JSON 格式错误'}`)
    } finally {
      if (event.target) event.target.value = ''
    }
  }

  const handleSaveHostLanIpOnly = async () => {
    try {
      setSaving(true)
      setMessage('')
      const cleanConfig = {
        ...config,
        multiInstanceEnabled: showInstanceSettings || parsedInstances.length > 1,
        defaultInstance: parsedInstances[0]?.name || 'local',
        updateCheckCron: normalizeCronExpression(config.updateCheckCron),
        cleanImagesCron: normalizeCronExpression(config.cleanImagesCron),
        updateContainersCron: normalizeCronExpression(config.updateContainersCron),
        hostLanIp: String(config.hostLanIp || '').trim(),
      }
      const res = await botAPI.saveConfig(cleanConfig)
      if (res.data?.code >= 200 && res.data?.code < 300) {
        setConfig(cleanConfig)
        setDirty(false)
        setMessage('宿主机 IP 已保存到 /app/config/config.json 的 dockercopilot.host_lan_ip。')
        await loadConfig({ silent: true })
      } else {
        setMessage(`保存失败：${res.data?.msg || '未知错误'}`)
      }
    } catch (error) {
      setMessage(`保存失败：${error.response?.data?.msg || error.message}`)
    } finally {
      setSaving(false)
    }
  }

  const handleSaveInstancesOnly = async () => {
    try {
      setSaving(true)
      setMessage('')
      const cleanConfig = {
        multiInstanceEnabled: showInstanceSettings || parsedInstances.length > 1,
        defaultInstance: parsedInstances[0]?.name || 'local',
        instances: config.instances || '[]',
      }
      const res = await botAPI.saveConfig(cleanConfig)
      if (res.data?.code >= 200 && res.data?.code < 300) {
        setDirty(false)
        setMessage('多实例配置已保存。')
        await loadConfig({ silent: true })
      } else {
        setMessage(`保存失败：${res.data?.msg || '未知错误'}`)
      }
    } catch (error) {
      setMessage(`保存失败：${error.response?.data?.msg || error.message}`)
    } finally {
      setSaving(false)
    }
  }

  const handleSave = async () => {
    try {
      const cronFields = [
        ['updateCheckCron', '更新检测 Cron'],
        ...(config.autoCleanImages ? [['cleanImagesCron', '清理 Cron']] : []),
        ...(config.autoUpdateContainers ? [['updateContainersCron', '自动更新 Cron']] : []),
      ]
      for (const [field, label] of cronFields) {
        const result = validateCronExpression(config[field])
        if (!result.ok) {
          setMessage(`${label} 无效：${result.message}`)
          return
        }
      }
      setSaving(true)
      setMessage('')
      const cleanConfig = {
        ...config,
        multiInstanceEnabled: showInstanceSettings || parsedInstances.length > 1,
        defaultInstance: parsedInstances[0]?.name || 'local',
        updateCheckCron: normalizeCronExpression(config.updateCheckCron),
        cleanImagesCron: normalizeCronExpression(config.cleanImagesCron),
        updateContainersCron: normalizeCronExpression(config.updateContainersCron),
        hostLanIp: String(config.hostLanIp || '').trim(),
      }
      setConfig(cleanConfig)
      const res = await botAPI.saveConfig(cleanConfig)
      if (res.data?.code >= 200 && res.data?.code < 300) {
        setMessage('配置已保存。Bot 会在容器重启后加载新配置。')
        await loadConfig({ silent: true })
      } else {
        setMessage(`保存失败：${res.data?.msg || '未知错误'}`)
      }
    } catch (error) {
      setMessage(`保存失败：${error.response?.data?.msg || error.message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto w-full space-y-6 px-2 sm:px-6 py-4 pt-4 sm:pt-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">配置与管理</h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Telegram Bot、多实例、代理与更新策略统一配置</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-3 text-white shadow-sm transition-colors hover:bg-primary-700 disabled:opacity-50"
        >
          {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          <span>{dirty ? '保存所有配置' : '保存配置'}</span>
        </button>
      </div>

      {message && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
          {message}
        </div>
      )}

      {loading && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
          正在读取 TG 配置...
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <div className={cardClass}>
          <div className={cardHeaderClass}>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
                <BotIcon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Telegram通知配置</h3>
                <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">互动管理docker功能</p>
              </div>
            </div>
            <SectionToggle checked={config.interactiveEnabled} onChange={() => handleChange('interactiveEnabled', !config.interactiveEnabled)} textOn="已开启" textOff="已关闭" />
          </div>
          <div className={cardBodyClass}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Bot Token">
                <div className="relative">
                  <input type={showToken ? 'text' : 'password'} value={config.botToken} onChange={(e) => handleChange('botToken', e.target.value)} placeholder="输入您的 Token" className={cn(inputClass, 'pr-10 font-mono')} />
                  <button onClick={() => setShowToken(!showToken)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </Field>
              <Field label="Chat ID">
                <input type="text" value={config.chatIds} onChange={(e) => handleChange('chatIds', e.target.value)} placeholder="多个用逗号分隔" className={cn(inputClass, 'font-mono')} />
              </Field>
            </div>
          </div>
        </div>

        <div className={cardClass}>
          <div className={cardHeaderClass}>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
                <Bell className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">通知与更新检测</h3>
                <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">docker容器更新通知</p>
              </div>
            </div>
            <SectionToggle checked={config.notifyOnUpdate} onChange={() => handleChange('notifyOnUpdate', !config.notifyOnUpdate)} textOn="通知开启" textOff="通知关闭" />
          </div>
          <div className={cardBodyClass}>
            <Field label="检测 Cron">
              {renderCronInput('updateCheckCron', '0 18 * * *', '例如：0 18 * * *')}
            </Field>
          </div>
        </div>

        <div className={cardClass}>
          <div className={cardHeaderClass}>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">自动清理镜像</h3>
                <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">定时清理无用镜像</p>
              </div>
            </div>
            <SectionToggle checked={config.autoCleanImages} onChange={() => handleChange('autoCleanImages', !config.autoCleanImages)} textOn="清理开启" textOff="清理关闭" />
          </div>
          <div className={cardBodyClass}>
            <Field label="清理 Cron">
              {renderCronInput('cleanImagesCron', '3 2 * * *', '例如：3 2 * * *')}
            </Field>
          </div>
        </div>

        <div className={cardClass}>
          <div className={cardHeaderClass}>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                <RefreshCw className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">自动更新容器</h3>
                <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">定时检查并更新容器</p>
              </div>
            </div>
            <SectionToggle checked={config.autoUpdateContainers} onChange={() => handleChange('autoUpdateContainers', !config.autoUpdateContainers)} textOn="更新开启" textOff="更新关闭" />
          </div>
          <div className={cardBodyClass}>
            <Field label="更新 Cron">
              {renderCronInput('updateContainersCron', '0 */6 * * *', '例如：0 */6 * * *')}
            </Field>
          </div>
        </div>

        <div className={cardClass}>
          <div className={cardHeaderClass}>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                <Globe className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">网络代理配置</h3>
                <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">配置TG机器人代理</p>
              </div>
            </div>
            <SectionToggle checked={config.proxyType !== 'none'} onChange={() => handleChange('proxyType', config.proxyType === 'none' ? 'socks5' : 'none')} textOn="代理开启" textOff="无代理" />
          </div>
          <div className={cardBodyClass}>
            <div className="mb-4 flex flex-wrap items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
              <span className="w-20 shrink-0">代理类型:</span>
              {[
                { value: 'socks5', label: 'SOCKS5' },
                { value: 'http', label: 'HTTP' },
                { value: 'none', label: '无代理' },
              ].map(opt => (
                <label key={opt.value} className="inline-flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="proxy_type" checked={config.proxyType === opt.value} onChange={() => handleChange('proxyType', opt.value)} />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="代理地址">
                <input type="text" value={config.proxyHost} onChange={(e) => handleChange('proxyHost', e.target.value)} placeholder="例如: 127.0.0.1" className={inputClass} />
              </Field>
              <Field label="代理端口">
                <input type="text" value={config.proxyPort} onChange={(e) => handleChange('proxyPort', e.target.value)} placeholder="例如: 7890" className={inputClass} />
              </Field>
              <Field label="用户名">
                <input type="text" value={config.proxyUsername} onChange={(e) => handleChange('proxyUsername', e.target.value)} placeholder="选填" className={inputClass} />
              </Field>
              <Field label="密码">
                <div className="relative">
                  <input type={showProxyPassword ? 'text' : 'password'} value={config.proxyPassword} onChange={(e) => handleChange('proxyPassword', e.target.value)} placeholder="选填" className={cn(inputClass, 'pr-10')} />
                  <button onClick={() => setShowProxyPassword(!showProxyPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    {showProxyPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </Field>
            </div>
          </div>
        </div>

        <div className={cardClass}>
          <div className={cardHeaderClass}>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                <FileJson className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">配置文件</h3>
                <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">下载当前配置，或上传配置文件恢复</p>
              </div>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">备份 / 恢复</div>
          </div>
          <div className={cardBodyClass}>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleUploadConfigFile}
            />
            <div className="space-y-4">
              <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900/30 dark:text-gray-300">
                下载时：未配置项会按空值导出；已配置项会按当前页面内容导出。上传后会先写回表单，再由你点击“保存配置”同步到后端。
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  onClick={downloadConfigFile}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-3 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
                >
                  <Download className="h-4 w-4" />
                  下载配置文件
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-100 px-4 py-3 text-sm font-medium text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50 transition-colors"
                >
                  <Upload className="h-4 w-4" />
                  上传配置文件
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className={cn(cardClass, 'xl:col-span-2')}>
          <div className={cardHeaderClass}>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                <Ban className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">更新黑名单</h3>
                <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">按镜像维度勾选，避免被自动更新</p>
              </div>
            </div>
            
          </div>
          <div className={cardBodyClass}>
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="关联实例">
                  <select value={blacklistInstance} onChange={(e) => setBlacklistInstance(e.target.value)} className={inputClass}>
                    {parsedInstances.map(inst => <option key={inst.name} value={inst.name}>{inst.name}</option>)}
                  </select>
                </Field>
                <Field label="搜索镜像 / 容器">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input type="text" value={blacklistSearch} onChange={(e) => setBlacklistSearch(e.target.value)} placeholder="搜索容器名 / 镜像名 / 状态" className={cn(inputClass, 'pl-9')} />
                  </div>
                </Field>
              </div>
              {!isLocalBlacklistInstance && <p className="text-xs text-amber-600 dark:text-amber-300">当前选择的是外部实例：Bot 会使用这份黑名单，但不会自动同步外部实例容器页。</p>}
              <div className="max-h-[28rem] overflow-y-auto rounded-2xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/30">
                {filteredBlacklistContainers.length === 0 ? (
                  <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">没有匹配的容器</div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {filteredBlacklistContainers.map(container => {
                      const key = getBlacklistKey(container)
                      const checked = selectedBlacklist.some(item => canonicalImageName(item) === key || normalizeImageName(item) === key)
                      return (
                        <label key={container.id || key} className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 bg-white p-3 hover:border-primary-300 hover:bg-primary-50/40 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-primary-700 dark:hover:bg-primary-900/10">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setSelectedBlacklist(e.target.checked ? [...selectedBlacklist, key] : selectedBlacklist.filter(item => item !== key))
                            }}
                            className="mt-1 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <div className="truncate text-sm font-medium text-gray-900 dark:text-white">{container.name}</div>
                              <span className={cn('shrink-0 rounded-full px-2 py-1 text-xs', container.status === 'running' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300')}>
                                {container.status === 'running' ? '运行中' : '已停止'}
                              </span>
                            </div>
                            <div className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400" title={key}>{key}</div>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
              {selectedBlacklist.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedBlacklist.map(item => (
                    <span key={item} className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">
                      <span className="max-w-[260px] truncate" title={item}>{item}</span>
                      <button onClick={() => setSelectedBlacklist(selectedBlacklist.filter(x => x !== item))} className="hover:text-red-900 dark:hover:text-red-100">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  <button onClick={() => setSelectedBlacklist([])} className="rounded-full border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700">清空</button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={cn(cardClass, 'xl:col-span-2')}>
          <div className={cardHeaderClass}>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300">
                <Globe className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">宿主机 IP</h3>
                <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">host 或原生运行可不填，bridge 必填</p>
              </div>
            </div>
          </div>
          <div className={cardBodyClass}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="宿主机 IP / HOST_LAN_IP" full>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    value={config.hostLanIp}
                    onChange={(e) => handleChange('hostLanIp', e.target.value)}
                    placeholder="例如 192.168.1.10"
                    className={cn(inputClass, 'font-mono flex-1')}
                  />
                  <button
                    type="button"
                    onClick={handleSaveHostLanIpOnly}
                    disabled={saving}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    <span>保存</span>
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">容器页的 Web 链接、详情页 ip:port 会优先使用这里的值。保存位置：/app/config/config.json → dockercopilot.host_lan_ip</p>
              </Field>
            </div>
          </div>
        </div>

        <div className={cn(cardClass, 'xl:col-span-2')}>
          <div className={cardHeaderClass}>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                <Server className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">多实例配置</h3>
                <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">默认实例在左，右侧用卡片维护实例</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleSaveInstancesOnly}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                <span>保存多实例</span>
              </button>
              <SectionToggle checked={showInstanceSettings} onChange={() => { setShowInstanceSettings(!showInstanceSettings); setDirty(true) }} textOn="多实例开启" textOff="多实例关闭" />
            </div>
          </div>
          <div className={cardBodyClass}>
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)]">
              <div className="space-y-4">
                {showInstanceSettings && (
                  <button onClick={addInstance} className="inline-flex items-center gap-2 rounded-xl bg-primary-100 px-4 py-2 text-sm font-medium text-primary-700 hover:bg-primary-200 dark:bg-primary-900/30 dark:text-primary-300 dark:hover:bg-primary-900/50">
                    <Plus className="h-4 w-4" /> 添加实例
                  </button>
                )}

                {showInstanceSettings ? (
                  <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
                    {parsedInstances.map((inst, index) => (
                      <div key={index} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-base font-semibold text-gray-900 dark:text-white">{inst.name || `实例 ${index + 1}`}</div>
                            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">像备份页那种新增卡片风格</div>
                          </div>
                          <button onClick={() => removeInstance(index)} disabled={parsedInstances.length <= 1 || String(inst.name || '').toLowerCase() === 'local'} className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/20">
                            <Trash2 className="h-4 w-4" />
                            删除
                          </button>
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <Field label="实例名">
                            <input value={inst.name || ''} onChange={(e) => updateInstance(index, 'name', e.target.value)} disabled={String(inst.name || '').toLowerCase() === 'local'} className={cn(inputClass, 'disabled:cursor-not-allowed disabled:opacity-60')} />
                          </Field>
                          <Field label="超时(秒)">
                            <input type="number" value={inst.timeout || 30} onChange={(e) => updateInstance(index, 'timeout', e.target.value)} className={inputClass} />
                          </Field>
                          <Field label="API 地址" full>
                            <input value={inst.api_url || ''} onChange={(e) => updateInstance(index, 'api_url', e.target.value)} disabled={String(inst.name || '').toLowerCase() === 'local'} placeholder="http://host:12712" className={cn(inputClass, 'disabled:cursor-not-allowed disabled:opacity-60')} />
                          </Field>
                          <Field label="密钥" full>
                            <input type="password" value={inst.secret_key || ''} onChange={(e) => updateInstance(index, 'secret_key', e.target.value)} placeholder="secretKey" className={inputClass} />
                          </Field>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-gray-300 p-6 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                    开启多实例后，这里会显示实例卡片。
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
