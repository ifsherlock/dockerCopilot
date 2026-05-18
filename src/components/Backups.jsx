import React, { useState, useEffect } from 'react'
import {
  HardDrive,
  Trash2,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  RotateCcw,
  FileCode,
  Save,
  X
} from 'lucide-react'
import { containerAPI, botAPI } from '../api/client.js'
import { cn } from '../utils/cn.js'

const MIN_REFRESH_VISIBLE_MS = 500

export function Backups() {
  const [backups, setBackups] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isBackingUp, setIsBackingUp] = useState(false)
  const [isDeleting, setIsDeleting] = useState({})
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  // 自定义确认弹窗状态
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null,
    onCancel: null,
    type: 'warning' // warning, danger
  })

  // 成功弹窗状态
  const [successModal, setSuccessModal] = useState({ isOpen: false, message: '' })
  const [backupConfig, setBackupConfig] = useState({
    autoBackupJson: false,
    backupJsonCron: '0 1 * * *',
    autoBackupCompose: false,
    backupComposeCron: '30 1 * * *',
    backupMaxFiles: 20,
  })
  const [isSavingSchedule, setIsSavingSchedule] = useState(false)

  const fetchBackups = async ({ keepRefreshing = false } = {}) => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await containerAPI.listBackups()
      if (response.data && (response.data.code === 0 || response.data.code === 200)) {
        setBackups(response.data.data || [])
      } else {
        setError(response.data?.msg || '获取备份列表失败')
        setBackups([])
      }
    } catch (error) {
      setError(error.response?.data?.msg || error.message || '网络错误，请检查后端服务')
      setBackups([])
    } finally {
      setIsLoading(false)
      if (!keepRefreshing) {
        setIsRefreshing(false)
      }
    }
  }

  const handleRefresh = async () => {
    const startedAt = Date.now()
    try {
      setIsRefreshing(true)
      await fetchBackups({ keepRefreshing: true })
    } finally {
      const remaining = Math.max(0, MIN_REFRESH_VISIBLE_MS - (Date.now() - startedAt))
      setTimeout(() => setIsRefreshing(false), remaining)
    }
  }

  useEffect(() => {
    fetchBackups()
  }, [])

  useEffect(() => {
    const loadBackupConfig = async () => {
      try {
        const res = await botAPI.getConfig()
        const telegram = res.data?.data?.telegram || {}
        setBackupConfig({
          autoBackupJson: telegram.auto_backup_json ?? false,
          backupJsonCron: telegram.backup_json_cron || '0 1 * * *',
          autoBackupCompose: telegram.auto_backup_compose ?? false,
          backupComposeCron: telegram.backup_compose_cron || '30 1 * * *',
          backupMaxFiles: telegram.backup_max_files || 20,
        })
      } catch (err) {
        console.error('读取备份定时配置失败:', err)
      }
    }
    loadBackupConfig()
  }, [])

  const handleBackup = async () => {
    try {
      setIsBackingUp(true)
      setSuccess(null)
      setError(null)

      const response = await containerAPI.backupContainer()
      if (response.data && (response.data.code === 0 || response.data.code === 200)) {
        setSuccessModal({ isOpen: true, message: '备份创建成功' })
        // 刷新备份列表
        fetchBackups()
      } else {
        setError(response.data?.msg || '备份创建失败')
      }
    } catch (error) {
      setError(error.response?.data?.msg || error.message || '备份创建失败')
    } finally {
      setIsBackingUp(false)

      // 3秒后清除成功消息
      setTimeout(() => setSuccessModal({ isOpen: false, message: '' }), 3000)
    }
  }

  const handleBackupToCompose = async () => {
    try {
      setIsBackingUp(true)
      setSuccess(null)
      setError(null)

      const response = await containerAPI.backupToCompose()
      if (response.data && (response.data.code === 0 || response.data.code === 200)) {
        setSuccessModal({ isOpen: true, message: 'Compose备份创建成功' })
        // 刷新备份列表
        fetchBackups()
      } else {
        setError(response.data?.msg || 'Compose备份创建失败')
      }
    } catch (error) {
      setError(error.response?.data?.msg || error.message || 'Compose备份创建失败')
    } finally {
      setIsBackingUp(false)

      // 3秒后清除成功消息
      setTimeout(() => setSuccessModal({ isOpen: false, message: '' }), 3000)
    }
  }

  const handleRestore = async (filename) => {
    try {
      setIsLoading(true)
      setError(null)
      setSuccess(null)

      console.log('开始恢复备份:', filename)
      const response = await containerAPI.restoreContainer(filename)
      console.log('恢复备份响应:', response.data)

      if (response.data && (response.data.code === 0 || response.data.code === 200)) {
        setSuccessModal({ isOpen: true, message: `备份 ${filename} 恢复成功` })
      } else {
        setError(response.data?.msg || `备份 ${filename} 恢复失败`)
      }
    } catch (error) {
      console.error('恢复备份详细错误:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        msg: error.response?.data?.msg,
        code: error.response?.data?.code,
        message: error.message,
        url: error.config?.url
      })

      let errorMsg = `备份 ${filename} 恢复失败`

      if (error.response?.status === 404) {
        // 404 可能是 API 端点问题，而不是文件不存在
        errorMsg = error.response?.data?.msg || `恢复失败: ${error.response?.statusText || '请求错误'}`
      } else if (error.response?.data?.msg) {
        errorMsg = error.response.data.msg
      } else if (error.message) {
        errorMsg = error.message
      }

      setError(errorMsg)
    } finally {
      setIsLoading(false)

      // 3秒后清除成功消息
      setTimeout(() => setSuccessModal({ isOpen: false, message: '' }), 3000)

      // 刷新备份列表
      fetchBackups()
    }
  }

  const showRestoreConfirm = (filename) => {
    setConfirmModal({
      isOpen: true,
      title: '恢复备份',
      message: `确定要恢复备份文件 ${filename} 吗？这将覆盖当前容器配置。`,
      onConfirm: () => {
        setConfirmModal({ ...confirmModal, isOpen: false })
        handleRestore(filename)
      },
      onCancel: () => {
        setConfirmModal({ ...confirmModal, isOpen: false })
      },
      type: 'warning'
    })
  }

  const handleDelete = async (filename) => {
    try {
      setIsDeleting(prev => ({ ...prev, [filename]: true }))
      setError(null)
      setSuccess(null)

      console.log('🗑️ 开始删除备份:', filename)
      console.log('📝 文件名编码前:', filename)
      console.log('📝 文件名编码后:', encodeURIComponent(filename))

      const response = await containerAPI.deleteBackup(filename)

      console.log('✅ 删除备份响应:', {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        data: response.data
      })

      // 删除成功的各种情况
      if (response.status === 200 || response.status === 204 || response.status === 204) {
        console.log('✨ 删除成功！')
        setSuccessModal({ isOpen: true, message: `备份 ${filename} 删除成功` })
        // 从列表中移除已删除的备份
        setBackups(backups.filter(backup => backup !== filename))
        return
      }

      // 检查响应体中的状态
      if (response.data) {
        if (response.data.code === 0 || response.data.code === 200 || response.data.code === 204) {
          console.log('✨ 删除成功（从响应体）！')
          setSuccessModal({ isOpen: true, message: `备份 ${filename} 删除成功` })
          setBackups(backups.filter(backup => backup !== filename))
          return
        }
        if (response.data.msg) {
          console.warn('⚠️ 响应中有错误消息:', response.data.msg)
          setError(response.data.msg)
          return
        }
      }

      // 如果走到这里，说明删除可能成功但响应格式不标准
      console.log('⚠️ 响应格式不标准，假设删除成功')
      setSuccessModal({ isOpen: true, message: `备份 ${filename} 删除成功` })
      setBackups(backups.filter(backup => backup !== filename))

    } catch (error) {
      console.error('❌ 删除备份失败:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
        config: error.config?.url
      })

      let errorMsg = `备份 ${filename} 删除失败`

      if (error.response?.status === 404) {
        errorMsg = `404 错误: 端点不存在或文件不存在 - ${error.response?.data?.msg || ''}`
      } else if (error.response?.status === 401 || error.response?.status === 403) {
        errorMsg = `认证失败: 没有权限删除此备份`
      } else if (error.response?.status === 500) {
        errorMsg = `服务器错误: ${error.response?.data?.msg || '请检查后端服务'}`
      } else if (error.response?.data?.msg) {
        errorMsg = error.response.data.msg
      } else if (error.message) {
        errorMsg = error.message
      }

      setError(errorMsg)
    } finally {
      setIsDeleting(prev => {
        const newState = { ...prev }
        delete newState[filename]
        return newState
      })

      // 3秒后清除成功消息
      setTimeout(() => setSuccessModal({ isOpen: false, message: '' }), 3000)
    }
  }

  const showDeleteConfirm = (filename) => {
    setConfirmModal({
      isOpen: true,
      title: '删除备份',
      message: `确定要删除备份文件 ${filename} 吗？此操作不可恢复。`,
      onConfirm: () => {
        setConfirmModal({ ...confirmModal, isOpen: false })
        handleDelete(filename)
      },
      onCancel: () => {
        setConfirmModal({ ...confirmModal, isOpen: false })
      },
      type: 'danger'
    })
  }


  const normalizeCronExpression = (value) => String(value || '').trim().replace(/\s+/g, ' ')

  const explainCronField = (field, min, max) => {
    if (!field) return '不能为空'
    for (const part of String(field).split(',')) {
      if (!part) return '列表里有空项'
      const pieces = part.split('/')
      if (pieces.length > 2) return `字段「${field}」的 / 只能出现一次`
      const rangePart = pieces[0]
      if (pieces[1] !== undefined && (!/^\d+$/.test(pieces[1]) || Number(pieces[1]) <= 0)) return `步长「${pieces[1]}」无效`
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
    const fields = cron.split(' ').filter(Boolean)
    if (fields.length !== 5) return { ok: false, normalized: cron, message: `Cron 必须是 5 段：分钟 小时 日期 月份 星期；当前是 ${fields.length} 段。例：30 1 * * *` }
    const ranges = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]]
    for (let i = 0; i < fields.length; i++) {
      const err = explainCronField(fields[i], ranges[i][0], ranges[i][1])
      if (err) return { ok: false, normalized: cron, message: `第 ${i + 1} 段无效：${err}` }
    }
    return { ok: true, normalized: cron, message: '' }
  }

  const cronError = (field) => {
    const result = validateCronExpression(backupConfig[field])
    return result.ok ? '' : result.message
  }

  const renderCronInput = (field, placeholder) => {
    const error = cronError(field)
    return (
      <>
        <input
          type="text"
          value={backupConfig[field]}
          onChange={(e) => handleBackupScheduleChange(field, e.target.value)}
          onBlur={() => handleBackupScheduleChange(field, normalizeCronExpression(backupConfig[field]))}
          placeholder={placeholder}
          className={cn(
            "input-field font-mono text-sm",
            error && "border-red-300 dark:border-red-700 focus:ring-red-500 focus:border-red-500"
          )}
        />
        {error && <p className="text-xs text-red-600 dark:text-red-400 mt-2">{error}</p>}
      </>
    )
  }

  const handleBackupScheduleChange = (key, value) => {
    setBackupConfig(prev => ({ ...prev, [key]: value }))
  }

  const handleSaveBackupSchedule = async () => {
    try {
      const cronFields = [
        ...(backupConfig.autoBackupJson ? [['backupJsonCron', 'JSON 备份 Cron']] : []),
        ...(backupConfig.autoBackupCompose ? [['backupComposeCron', 'YAML 备份 Cron']] : []),
      ]
      for (const [field, label] of cronFields) {
        const result = validateCronExpression(backupConfig[field])
        if (!result.ok) {
          setError(`${label} 无效：${result.message}`)
          return
        }
      }
      const maxFiles = Number(backupConfig.backupMaxFiles)
      if (!Number.isInteger(maxFiles) || maxFiles < 1 || maxFiles > 200) {
        setError('备份最大份数必须是 1-200 之间的整数')
        return
      }
      setIsSavingSchedule(true)
      setError(null)
      const cleanBackupConfig = {
        ...backupConfig,
        backupJsonCron: normalizeCronExpression(backupConfig.backupJsonCron),
        backupComposeCron: normalizeCronExpression(backupConfig.backupComposeCron),
        backupMaxFiles: maxFiles,
      }
      setBackupConfig(cleanBackupConfig)
      const res = await botAPI.getConfig()
      const data = res.data?.data || {}
      const telegram = data.telegram || {}
      const proxy = telegram.proxy || {}
      const instances = Array.isArray(data.dockercopilot?.instances) ? JSON.stringify(data.dockercopilot.instances) : ''
      const response = await botAPI.saveConfig({
        botToken: telegram.bot_token || '',
        chatIds: Array.isArray(telegram.chat_ids) ? telegram.chat_ids.join(',') : '',
        updateCheckCron: telegram.update_check_cron || '0 18 * * *',
        notifyOnUpdate: telegram.notify_on_update ?? true,
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
        defaultInstance: data.dockercopilot?.default_instance || '',
        instances,
        imageAccelerators: Array.isArray(telegram.image_accelerators) ? telegram.image_accelerators.join('\n') : '',
        defaultImageAccelerator: telegram.default_image_accelerator || '',
        autoBackupJson: cleanBackupConfig.autoBackupJson,
        backupJsonCron: cleanBackupConfig.backupJsonCron,
        autoBackupCompose: cleanBackupConfig.autoBackupCompose,
        backupComposeCron: cleanBackupConfig.backupComposeCron,
        backupMaxFiles: cleanBackupConfig.backupMaxFiles,
      })
      setSuccessModal({ isOpen: true, message: response.data?.msg || '定时备份配置保存成功' })
      setTimeout(() => setSuccessModal({ isOpen: false, message: '' }), 3000)
    } catch (err) {
      setError(err.response?.data?.msg || err.message || '保存定时备份配置失败')
    } finally {
      setIsSavingSchedule(false)
    }
  }

  const getFileType = (filename) => {
    if (filename.endsWith('.json')) return 'JSON'
    if (filename.endsWith('.yaml') || filename.endsWith('.yml')) return 'YAML'
    return '未知'
  }

  const formatFilename = (filename) => {
    // 移除文件扩展名
    return filename.replace(/\.(json|yaml|yml)$/i, '')
  }

  // 按日期分组备份文件（用于时间线视图）
  const groupBackupsByDate = (backupList) => {
    const groups = {}

    backupList.forEach(backup => {
      // 从文件名中提取日期部分
      const dateMatch = backup.match(/backup-(\d{4}-\d{2}-\d{2})/)
      const date = dateMatch ? dateMatch[1] : '未知日期'

      if (!groups[date]) {
        groups[date] = []
      }
      groups[date].push(backup)
    })

    // 转换为数组并按日期排序（最新的在前）
    return Object.entries(groups)
      .sort(([dateA], [dateB]) => new Date(dateB) - new Date(dateA))
  }

  // 获取备份文件的日期
  const getBackupDate = (filename) => {
    const dateMatch = filename.match(/backup-(\d{4}-\d{2}-\d{2})/)
    return dateMatch ? dateMatch[1] : '未知日期'
  }

  if (isLoading && backups.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded"></div>
          </div>
          {[1, 2, 3].map(i => (
            <div key={i} className="card p-6">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32"></div>
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-24"></div>
                </div>
                <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* 自定义确认弹窗 */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                {confirmModal.title}
              </h3>
              <button
                onClick={confirmModal.onCancel}
                className="text-gray-400 hover:text-gray-500 dark:text-gray-400 dark:hover:text-gray-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-6 py-4">
              <p className="text-gray-600 dark:text-gray-400">
                {confirmModal.message}
              </p>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30 flex justify-end space-x-3">
              <button
                onClick={confirmModal.onCancel}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
              >
                取消
              </button>
              <button
                onClick={confirmModal.onConfirm}
                className={cn(
                  "px-4 py-2 text-sm font-medium text-white rounded-xl transition-colors",
                  confirmModal.type === 'danger'
                    ? "bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600"
                    : "bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600"
                )}
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 页面头部 */}
      <div className="px-2 sm:px-6 py-4 pt-4 sm:pt-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">备份管理</h2>
            <p className="text-gray-600 dark:text-gray-400">创建、恢复、删除与定时备份</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleBackupToCompose}
              disabled={isBackingUp}
              className="flex items-center gap-2 px-4 py-2 bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-200 rounded-lg hover:bg-purple-200 dark:hover:bg-purple-800 transition-colors disabled:opacity-50"
            >
              <FileCode className={`h-4 w-4 ${isBackingUp ? 'animate-spin' : ''}`} />
              <span className="text-sm font-medium">YAML</span>
            </button>
            <button
              onClick={handleBackup}
              disabled={isBackingUp}
              className="flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors disabled:opacity-50"
            >
              <Save className={`h-4 w-4 ${isBackingUp ? 'animate-spin' : ''}`} />
              <span className="text-sm font-medium">JSON</span>
            </button>
            <button
              onClick={handleRefresh}
              disabled={isLoading || isRefreshing}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${(isLoading || isRefreshing) ? 'animate-spin' : ''}`} />
              <span className="text-sm font-medium">刷新</span>
            </button>
          </div>
        </div>
      </div>

      {isRefreshing && (
        <div className="mx-2 sm:mx-6 my-3 rounded-3xl border border-primary-200/70 dark:border-primary-800/70 bg-primary-50/80 dark:bg-primary-950/30 p-8 shadow-inner overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 dark:via-white/5 to-transparent animate-pulse"></div>
          <div className="relative flex items-center justify-center gap-3 text-primary-700 dark:text-primary-300 font-medium">
            <RefreshCw className="h-5 w-5 animate-spin" />
            <span>正在刷新备份列表和文件状态...</span>
          </div>
        </div>
      )}

      <div className="px-2 sm:px-6 pb-2">
        <div className="rounded-3xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm p-4 sm:p-5">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">定时备份</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">使用 Cron 表达式定时生成 JSON / YAML 备份，保存后立即生效。</p>
            </div>
            <button
              onClick={handleSaveBackupSchedule}
              disabled={isSavingSchedule}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              <Save className={`h-4 w-4 ${isSavingSchedule ? 'animate-spin' : ''}`} />
              <span className="text-sm font-medium">保存定时配置</span>
            </button>
          </div>

          <div className="mb-4 rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-900/10 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="font-semibold text-gray-900 dark:text-white">备份保留份数</div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">创建新备份后自动保留最新 N 份，超过数量的旧备份会自动删除。</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">最多</span>
                <input
                  type="number"
                  min="1"
                  max="200"
                  step="1"
                  value={backupConfig.backupMaxFiles}
                  onChange={(e) => handleBackupScheduleChange('backupMaxFiles', e.target.value)}
                  className="w-24 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                <span className="text-sm text-gray-600 dark:text-gray-400">份</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-blue-200 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-900/10 p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <div className="font-semibold text-gray-900 dark:text-white">JSON 备份</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">默认输出容器配置 JSON</div>
                </div>
                <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={backupConfig.autoBackupJson}
                    onChange={(e) => handleBackupScheduleChange('autoBackupJson', e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">启用</span>
                </label>
              </div>
              <input
                type="text"
                value={backupConfig.backupJsonCron}
                onChange={(e) => handleBackupScheduleChange('backupJsonCron', e.target.value)}
                placeholder="例如：0 1 * * *"
                className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Cron 示例：每天 01:00 → <span className="font-mono">0 1 * * *</span></p>
            </div>

            <div className="rounded-2xl border border-purple-200 dark:border-purple-800 bg-purple-50/70 dark:bg-purple-900/10 p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <div className="font-semibold text-gray-900 dark:text-white">YAML / Compose 备份</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">导出为 Compose / YAML 结构</div>
                </div>
                <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={backupConfig.autoBackupCompose}
                    onChange={(e) => handleBackupScheduleChange('autoBackupCompose', e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">启用</span>
                </label>
              </div>
              <input
                type="text"
                value={backupConfig.backupComposeCron}
                onChange={(e) => handleBackupScheduleChange('backupComposeCron', e.target.value)}
                placeholder="例如：30 1 * * *"
                className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Cron 示例：每天 01:30 → <span className="font-mono">30 1 * * *</span></p>
            </div>
          </div>
        </div>
      </div>

      {/* 状态消息 */}
      {error && (
        <div className="mx-4 sm:mx-6 mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900 rounded-lg flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <span className="text-red-800 dark:text-red-200 text-sm">{error}</span>
        </div>
      )}

      {success && (
        <div className="mx-4 sm:mx-6 mt-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-900 rounded-lg flex items-start gap-3">
          <CheckCircle className="h-5 w-5 text-green-500 dark:text-green-400 flex-shrink-0 mt-0.5" />
          <span className="text-green-800 dark:text-green-200 text-sm">{success}</span>
        </div>
      )}

      {/* 成功弹窗 */}
      {successModal.isOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-md w-full overflow-hidden transform transition-all duration-300 scale-100 hover:scale-105">
            {/* 顶部装饰条 */}
            <div className="h-1 bg-gradient-to-r from-green-400 via-emerald-500 to-green-600"></div>

            <div className="p-8 flex flex-col items-center text-center">
              {/* 成功图标容器 - 带脉冲动画 */}
              <div className="relative mb-6">
                <div className="absolute inset-0 bg-green-400/20 rounded-full blur-xl animate-pulse"></div>
                <div className="relative h-16 w-16 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 rounded-full flex items-center justify-center border border-green-200 dark:border-green-700">
                  <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400 animate-bounceIn" />
                </div>
              </div>

              {/* 标题 */}
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                操作成功
              </h3>

              {/* 分隔线 */}
              <div className="w-12 h-1 bg-gradient-to-r from-transparent via-green-400 to-transparent rounded-full mb-4"></div>

              {/* 消息内容 */}
              <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed mb-8">
                {successModal.message}
              </p>

              {/* 按钮 */}
              <button
                onClick={() => setSuccessModal({ isOpen: false, message: '' })}
                className="w-full px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-semibold rounded-xl transition-all duration-300 transform hover:shadow-lg hover:scale-105 active:scale-95 shadow-lg"
              >
                完成
              </button>
            </div>

            {/* 底部装饰 */}
            <div className="h-0.5 bg-gradient-to-r from-transparent via-green-200 dark:via-green-800 to-transparent"></div>
          </div>
        </div>
      )}

      {/* 统计信息 */}
      <div className="px-2 sm:px-6 py-4">
        <div className="grid grid-cols-3 gap-0 rounded-3xl overflow-hidden shadow-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          {/* 总备份数 */}
          <button
            className={cn(
              "p-3 sm:p-5 text-center transition-all duration-300 relative overflow-hidden group border-r border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center",
              "hover:bg-gray-50 dark:hover:bg-gray-700/50"
            )}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-primary-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative">
              <div className="text-2xl sm:text-3xl font-bold text-primary-600 dark:text-primary-400 transition-transform duration-300 group-hover:scale-110">
                {backups.length}
              </div>
              <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">总备份</div>
            </div>
          </button>

          {/* JSON 备份 */}
          <button
            className={cn(
              "p-3 sm:p-5 text-center transition-all duration-300 relative overflow-hidden group border-r border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center",
              "hover:bg-gray-50 dark:hover:bg-gray-700/50"
            )}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative">
              <div className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400 transition-transform duration-300 group-hover:scale-110">
                {backups.filter(b => b.endsWith('.json')).length}
              </div>
              <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">JSON</div>
            </div>
          </button>

          {/* YAML 备份 */}
          <button
            className={cn(
              "p-3 sm:p-5 text-center transition-all duration-300 relative overflow-hidden group flex flex-col items-center justify-center",
              "hover:bg-gray-50 dark:hover:bg-gray-700/50"
            )}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative">
              <div className="text-2xl sm:text-3xl font-bold text-purple-600 dark:text-purple-400 transition-transform duration-300 group-hover:scale-110">
                {backups.filter(b => b.endsWith('.yaml') || b.endsWith('.yml')).length}
              </div>
              <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">YAML</div>
            </div>
          </button>
        </div>
      </div>

      {/* 备份列表 */}
      <div className="px-2 sm:px-6 py-4">
        {backups.length === 0 ? (
          <div className="card p-12 text-center rounded-2xl">
            <HardDrive className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">暂无备份</h3>
            <p className="text-gray-500 dark:text-gray-400">点击上方按钮创建您的第一个备份</p>
          </div>
        ) : (
          <div className="space-y-4">
            {groupBackupsByDate(backups).map(([date, dateBackups]) => (
              <div key={date}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="text-lg font-semibold text-gray-900 dark:text-white">
                    {date}
                  </div>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {dateBackups.length} 个
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {dateBackups.map((backup) => (
                    <div key={backup} className="group card p-4 rounded-2xl hover:shadow-lg transition-all">
                      <div className="flex items-start gap-3 mb-4">
                        <div className="h-10 w-10 bg-gradient-to-br from-teal-500 to-teal-600 rounded-lg flex items-center justify-center flex-shrink-0">
                          <HardDrive className="h-5 w-5 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold text-gray-900 dark:text-white truncate">
                              {formatFilename(backup)}
                            </h4>
                            <span className={cn(
                              "text-xs font-medium px-2 py-0.5 rounded flex-shrink-0",
                              getFileType(backup) === 'JSON'
                                ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200"
                                : "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-200"
                            )}>
                              {getFileType(backup)}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {backup}
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-2 pt-4 border-t border-gray-100 dark:border-gray-700">
                        <button
                          onClick={() => showRestoreConfirm(backup)}
                          className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-sm text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 rounded-lg transition-colors active:scale-95"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          <span>恢复</span>
                        </button>
                        <button
                          onClick={() => showDeleteConfirm(backup)}
                          disabled={isDeleting[backup]}
                          className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="删除备份"
                        >
                          {isDeleting[backup] ? (
                            <>
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              <span>删除中</span>
                            </>
                          ) : (
                            <>
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>删除</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
