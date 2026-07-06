import React, { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { HardDrive, Trash2, RefreshCw, X, AlertCircle, CheckCircle, LayoutGrid, Search, CheckSquare, LayoutList, Zap, Ban } from 'lucide-react'
import { imageAPI, botAPI, progressAPI } from '../../api/client.js'
import { cn } from '../../utils/cn.js'
import { useResizableTableColumns } from '../../hooks/useResizableTableColumns.js'
import { ImageModals } from './ImageModals.jsx'
import { ImageListView } from './ImageListView.jsx'
import {
  MIN_REFRESH_VISIBLE_MS,
  batchButtonClass,
  buildPullTarget,
  canonicalImageName,
  canonicalRepoLink,
  getImageBlacklistCandidates,
  humanizeImageDeleteError,
  matchesImageBlacklistItem,
  normalizeImageName,
} from './imageUtils.js'

export function Images() {
  const [images, setImages] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, image: null })
  const [filterStatus, setFilterStatus] = useState(null) // null 表示显示全部
  const [pruneModal, setPruneModal] = useState({ isOpen: false, type: null, images: [] })
  const [successModal, setSuccessModal] = useState({ isOpen: false, message: '' })
  const [imageUpdateActions, setImageUpdateActions] = useState({})
  const [confirmBatchDeleteModal, setConfirmBatchDeleteModal] = useState({ isOpen: false, images: [], force: false })
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('docker_copilot_images_view_mode') || 'card')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [selectedImages, setSelectedImages] = useState([])
  const [isBatchMode, setIsBatchMode] = useState(false)
  const [acceleratorModal, setAcceleratorModal] = useState({ isOpen: false, imageName: '', taskId: '', logs: '', selectedSource: '' })
  const [accelerators, setAccelerators] = useState([])
  const [updateBlacklist, setUpdateBlacklist] = useState([])
  const [newAccelerator, setNewAccelerator] = useState('')
  const [defaultAccelerator, setDefaultAccelerator] = useState('')
  const [acceleratorLatency, setAcceleratorLatency] = useState({})
  const [testingAccelerators, setTestingAccelerators] = useState(false)
  const [editImageModal, setEditImageModal] = useState({ isOpen: false, image: null, name: '', tag: '', saving: false })
  const [confirmRemoveAccelerator, setConfirmRemoveAccelerator] = useState({ isOpen: false, source: '' })

  // 获取自定义图标配置
  const { data: customIcons = {} } = useQuery({
    queryKey: ['customIcons'],
    queryFn: async () => {
      try {
        const response = await imageAPI.getIcons()
        if (response.data.code === 200 || response.data.code === 0) {
          const icons = response.data.data || {}
          // update localStorage
          localStorage.setItem('docker_copilot_image_logos', JSON.stringify(icons))
          return icons
        }
      } catch (err) {
        console.error('获取图标失败:', err)
      }
      return {}
    },
    // 初始数据尝试从localStorage获取
    initialData: () => {
      const saved = localStorage.getItem('docker_copilot_image_logos')
      if (saved) {
        try {
          return JSON.parse(saved)
        } catch (e) {
          console.error('解析本地图标配置失败:', e)
        }
      }
      return undefined
    }
  })

  const fetchImages = async ({ keepRefreshing = false } = {}) => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await imageAPI.getImages()

      if (response.data && (response.data.code === 0 || response.data.code === 200)) {
        setImages(response.data.data || [])
      } else {
        const errorMsg = response.data?.msg || '获取镜像列表失败'
        setError(errorMsg)
        setImages([])
      }
    } catch (error) {
      const errorMsg = error.response?.data?.msg || error.message || '网络错误,请检查后端服务'
      setError(errorMsg)
      setImages([])
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
      await fetchImages({ keepRefreshing: true })
    } finally {
      const remaining = Math.max(0, MIN_REFRESH_VISIBLE_MS - (Date.now() - startedAt))
      setTimeout(() => setIsRefreshing(false), remaining)
    }
  }

  useEffect(() => {
    const onGlobalRefresh = () => handleRefresh()
    window.addEventListener('docker-copilot-global-refresh', onGlobalRefresh)
    return () => window.removeEventListener('docker-copilot-global-refresh', onGlobalRefresh)
  }, [])

  useEffect(() => {
    localStorage.setItem('docker_copilot_images_view_mode', viewMode)
  }, [viewMode])

  useEffect(() => {
    fetchImages()
  }, [])

  useEffect(() => {
    const loadAccelerators = async () => {
      try {
        const res = await botAPI.getConfig()
        const telegram = res.data?.data?.telegram || {}
        const list = Array.isArray(telegram.image_accelerators) ? telegram.image_accelerators : []
        const fallback = ['docker.1ms.run', 'docker.xuanyuan.me', 'dockerproxy.com']
        const finalList = Array.from(new Set([...(list.length ? list : fallback)].map(v => String(v || '').trim()).filter(Boolean)))
        setAccelerators(finalList)
        setDefaultAccelerator(String(telegram.default_image_accelerator || finalList[0] || ''))
      } catch (e) {
        setAccelerators(['docker.1ms.run', 'docker.xuanyuan.me', 'dockerproxy.com'])
        setDefaultAccelerator('docker.1ms.run')
      }
    }
    loadAccelerators()
  }, [])

  useEffect(() => {
    const loadUpdateBlacklist = async () => {
      try {
        const res = await botAPI.getUpdateBlacklist()
        const list = res.data?.data || []
        setUpdateBlacklist(Array.isArray(list) ? list : [])
      } catch (e) {
        console.error('读取镜像更新黑名单失败:', e)
      }
    }
    loadUpdateBlacklist()
  }, [])


  const testAcceleratorLatency = async () => {
    try {
      setTestingAccelerators(true)
      const res = await imageAPI.getAcceleratorLatency()
      const list = Array.isArray(res.data?.data) ? res.data.data : []
      const next = {}
      list.forEach(item => {
        next[item.source] = item
      })
      if (next['docker.1ms.run'] && !next['__cn_mirror__']) {
        next['__cn_mirror__'] = { ...next['docker.1ms.run'], source: '__cn_mirror__' }
      }
      setAcceleratorLatency(next)
    } catch (e) {
      setError(e.response?.data?.msg || e.message || '测速失败')
    } finally {
      setTestingAccelerators(false)
    }
  }

  const formatLatency = (source) => {
    const resolvedSource = source === '__official__' ? 'registry-1.docker.io' : source
    const info = acceleratorLatency[resolvedSource]
    if (!info) return '未测速'
    if (info.status === 'failed') return '失败'
    if (info.latency < 0) return '超时'
    return `${info.latency} ms`
  }

  const latencyClassName = (source) => {
    const resolvedSource = source === '__official__' ? 'registry-1.docker.io' : source
    const info = acceleratorLatency[resolvedSource]
    if (!info) return 'text-gray-400 dark:text-gray-500'
    if (info.status === 'failed' || info.latency < 0) return 'text-red-600 dark:text-red-400'
    if (info.latency <= 800) return 'text-green-600 dark:text-green-400'
    if (info.latency <= 2000) return 'text-amber-600 dark:text-amber-400'
    return 'text-orange-600 dark:text-orange-400'
  }

  const handleDeleteImage = async (imageId, force = false) => {
    try {
      setIsLoading(true)
      setError(null)
      const currentImage = images.find(img => img.id === imageId) || deleteModal.image
      setDeleteModal({ isOpen: false, image: null })

      await imageAPI.deleteImage(imageId, force)

      setSuccessModal({ isOpen: true, message: force ? '镜像已强制删除' : '镜像删除成功' })
      fetchImages()
      setTimeout(() => setSuccessModal({ isOpen: false, message: '' }), 3000)
    } catch (error) {
      const rawMsg = error.response?.data?.msg || error.message || '删除镜像失败'
      const currentImage = images.find(img => img.id === imageId) || deleteModal.image
      setError(humanizeImageDeleteError(rawMsg, currentImage, force))
      setIsLoading(false)
    }
  }

  const toggleImageSelection = (imageId) => {
    setSelectedImages(prev => prev.includes(imageId) ? prev.filter(id => id !== imageId) : [...prev, imageId])
  }

  const toggleSelectAllImages = () => {
    const ids = filteredImages.map(img => img.id)
    const allSelected = ids.length > 0 && ids.every(id => selectedImages.includes(id))
    setSelectedImages(allSelected ? selectedImages.filter(id => !ids.includes(id)) : Array.from(new Set([...selectedImages, ...ids])))
    if (viewMode === 'card' && !allSelected && ids.length > 0) {
      setIsBatchMode(true)
    }
  }

  const openBatchDelete = () => {
    const selected = images.filter(img => selectedImages.includes(img.id))
    setPruneModal({ isOpen: true, type: 'selected', images: selected })
  }

  const openConfirmBatchDelete = (force = false) => {
    const selected = images.filter(img => selectedImages.includes(img.id))
    setConfirmBatchDeleteModal({ isOpen: true, images: selected, force })
  }

  const handleBatchDelete = async (imagesToDelete, force = false) => {
    try {
      setIsLoading(true)
      setError(null)
      if (!imagesToDelete.length) {
        setError('请先选择要删除的镜像')
        setIsLoading(false)
        return
      }
      await Promise.all(imagesToDelete.map(image => imageAPI.deleteImage(image.id, force)))
      setSuccessModal({ isOpen: true, message: `成功${force ? '强制删除' : '删除'} ${imagesToDelete.length} 个镜像` })
      setSelectedImages([])
      fetchImages()
      setTimeout(() => setSuccessModal({ isOpen: false, message: '' }), 3000)
    } catch (error) {
      const firstImage = imagesToDelete[0]
      const rawMsg = error.response?.data?.msg || error.message || '批量删除镜像失败'
      setError(humanizeImageDeleteError(rawMsg, firstImage, force))
      setIsLoading(false)
    }
  }

  const handlePrune = async (type) => {
    try {
      setIsLoading(true)
      setError(null)

      let imagesToDelete = []
      if (type === 'dangling') {
        imagesToDelete = images.filter(img => img.tag === 'None' || img.tag === '<none>')
      } else if (type === 'unused') {
        imagesToDelete = images.filter(img => !img.inUsed)
      } else if (type === 'selected') {
        imagesToDelete = pruneModal.images || []
      }

      if (imagesToDelete.length === 0) {
        setError('没有找到需要清理的镜像')
        setIsLoading(false)
        return
      }

      // 批量删除
      const deletePromises = imagesToDelete.map(image =>
        imageAPI.deleteImage(image.id, false)
      )

      await Promise.all(deletePromises)

      const message = type === 'dangling'
        ? `成功清理 ${imagesToDelete.length} 个无Tag镜像`
        : type === 'unused'
          ? `成功清理 ${imagesToDelete.length} 个未使用的镜像`
          : `成功删除 ${imagesToDelete.length} 个镜像`

      setSuccessModal({ isOpen: true, message })
      fetchImages()
      setTimeout(() => setSuccessModal({ isOpen: false, message: '' }), 3000)
    } catch (error) {
      const errorMsg = error.response?.data?.msg || error.message || '清理镜像失败'
      setError(errorMsg)
      setIsLoading(false)
    }
  }

  const isImageUpdateIgnored = (image) => updateBlacklist.some(item => matchesImageBlacklistItem(image, item))

  const saveUpdateBlacklist = async (nextList) => {
    const normalized = Array.from(new Set(nextList.map(item => canonicalImageName(item) || normalizeImageName(item)).filter(Boolean)))
    const previous = updateBlacklist
    setUpdateBlacklist(normalized)
    try {
      const res = await botAPI.saveUpdateBlacklist(normalized)
      const saved = res.data?.data || normalized
      setUpdateBlacklist(Array.isArray(saved) ? saved : normalized)
    } catch (err) {
      setUpdateBlacklist(previous)
      setError(err.response?.data?.msg || err.message || '镜像更新黑名单保存失败')
    }
  }

  const ignoreImageUpdate = async (image) => saveUpdateBlacklist([...updateBlacklist, ...getImageBlacklistCandidates(image)])
  const unignoreImageUpdate = async (image) => saveUpdateBlacklist(updateBlacklist.filter(item => !matchesImageBlacklistItem(image, item)))

  const persistAccelerators = async (nextList, nextDefault = defaultAccelerator) => {
    const clean = Array.from(new Set(nextList.map(v => String(v || '').trim()).filter(Boolean)))
    setAccelerators(clean)
    setDefaultAccelerator(nextDefault || clean[0] || '')
    try {
      const res = await botAPI.getConfig()
      const data = res.data?.data || {}
      const telegram = data.telegram || {}
      const dockercopilot = data.dockercopilot || {}
      await botAPI.saveConfig({
        botToken: telegram.bot_token || '',
        chatIds: Array.isArray(telegram.chat_ids) ? telegram.chat_ids.join('\n') : '',
        updateCheckCron: telegram.update_check_cron || '0 18 * * *',
        notifyOnUpdate: telegram.notify_on_update !== false,
        updateBlacklist: Array.isArray(telegram.update_blacklist) ? telegram.update_blacklist.join('\n') : '',
        autoCleanImages: !!telegram.auto_clean_images,
        cleanImagesCron: telegram.clean_images_cron || '3 2 * * *',
        autoUpdateContainers: !!telegram.auto_update_containers,
        updateContainersCron: telegram.update_containers_cron || '0 */6 * * *',
        proxyType: telegram.proxy?.type || 'none',
        proxyHost: telegram.proxy?.host || '',
        proxyPort: telegram.proxy?.port || 0,
        proxyUsername: telegram.proxy?.username || '',
        proxyPassword: telegram.proxy?.password || '',
        defaultInstance: dockercopilot.default_instance || 'local',
        instances: JSON.stringify(dockercopilot.instances || []),
        autoBackupJson: !!telegram.auto_backup_json,
        backupJsonCron: telegram.backup_json_cron || '0 1 * * *',
        autoBackupCompose: !!telegram.auto_backup_compose,
        backupComposeCron: telegram.backup_compose_cron || '30 1 * * *',
        imageAccelerators: clean.join('\n'),
        defaultImageAccelerator: nextDefault || clean[0] || '',
      })
    } catch (e) {
      setError(e.response?.data?.msg || e.message || '保存加速源失败')
    }
  }

  const addAccelerator = async () => {
    const value = newAccelerator.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')
    if (!value) return
    const next = Array.from(new Set([...accelerators, value]))
    setNewAccelerator('')
    await persistAccelerators(next, defaultAccelerator || value)
  }

  const removeAccelerator = async (source) => {
    const sourceText = String(source || '').trim()
    if (!sourceText) return
    if (accelerators.length <= 1) {
      setError('至少保留一个加速源,避免误删后无法使用')
      return
    }
    const next = accelerators.filter(item => item !== sourceText)
    const nextDefault = defaultAccelerator === sourceText ? (next[0] || '') : defaultAccelerator
    await persistAccelerators(next, nextDefault)
    setConfirmRemoveAccelerator({ isOpen: false, source: '' })
    setSuccess('加速源已删除')
  }

  const openAcceleratorModal = (imageName = '') => {
    const source = defaultAccelerator || accelerators[0] || 'docker.1ms.run'
    setAcceleratorModal({ isOpen: true, imageName, taskId: '', logs: '', selectedSource: source })
    testAcceleratorLatency()
  }

  const resolveAcceleratorSource = (value) => {
    const v = String(value || '').trim()
    if (!v || v === '__official__') return ''
    if (v === '__cn_mirror__') return 'docker.1ms.run'
    return v
  }

  const selectAcceleratorSource = (value) => {
    setAcceleratorModal(prev => ({ ...prev, selectedSource: value }))
    persistAccelerators(accelerators, value === '__official__' ? '' : value === '__cn_mirror__' ? 'docker.1ms.run' : value)
  }

  const getImageUpdateActionState = (image) => {
    const key = image?.id || image?.name || ''
    return imageUpdateActions[key] || null
  }

  const setImageUpdateAction = (image, patch) => {
    const key = image?.id || image?.name || ''
    if (!key) return
    setImageUpdateActions(prev => ({
      ...prev,
      [key]: {
        ...(prev[key] || {}),
        ...patch,
      }
    }))
  }

  const clearImageUpdateActionLater = (image, delay = 3000) => {
    const key = image?.id || image?.name || ''
    if (!key) return
    setTimeout(() => {
      setImageUpdateActions(prev => {
        if (!prev[key]) return prev
        const next = { ...prev }
        delete next[key]
        return next
      })
    }, delay)
  }

  const resolveImageProgressFromOutput = (output, fallbackPercent = 12) => {
    const text = String(output || '').trim()
    const percentMatch = text.match(/(\d+(?:\.\d+)?)\s*%/)
    if (percentMatch) {
      return Math.max(1, Math.min(100, Math.round(Number(percentMatch[1]))))
    }
    if (!text) return fallbackPercent
    if (text.includes('解析') || text.includes('准备') || text.includes('连接')) return 10
    if (text.includes('Pulling fs layer') || text.includes('拉取层')) return 22
    if (text.includes('Waiting') || text.includes('等待')) return 36
    if (text.includes('Downloading') || text.includes('下载')) return 52
    if (text.includes('Verifying') || text.includes('校验')) return 68
    if (text.includes('Download complete') || text.includes('下载完成')) return 82
    if (text.includes('Extracting') || text.includes('解压')) return 90
    if (text.includes('Pull complete') || text.includes('拉取完成') || text.includes('镜像拉取完成')) return 100
    return fallbackPercent
  }

  const acceleratorOptions = [
    { value: '__official__', label: '官方源(直连)' },
    { value: '__cn_mirror__', label: '毫秒源(docker.1ms.run)' },
    ...accelerators.filter(src => src !== 'docker.1ms.run').map(src => ({ value: src, label: src })),
  ]

  const startAcceleratedPull = async () => {
    const imageName = acceleratorModal.imageName.trim()
    if (!imageName) {
      setError('镜像名不能为空')
      return
    }
    const source = resolveAcceleratorSource(acceleratorModal.selectedSource || defaultAccelerator || accelerators[0] || '')
    const res = await imageAPI.pullImage(imageName, source, imageName)
    const taskId = res.data?.data?.taskID
    setAcceleratorModal(prev => ({ ...prev, taskId, logs: `开始加速拉取: ${source ? `${source}/` : ''}${imageName}\n` }))
    if (taskId) pollPullProgress(taskId)
  }

  const pollPullProgress = (taskId) => {
    let attempts = 0
    const poll = async () => {
      attempts++
      try {
        const res = await progressAPI.getProgress(taskId)
        const data = res.data?.data || {}
        const logs = Array.isArray(data.logs) ? data.logs.join('\n') : (data.detailMsg || data.message || '')
        setAcceleratorModal(prev => ({ ...prev, logs }))
        if (data.isDone || attempts > 180) {
          await fetchImages()
          return
        }
        setTimeout(poll, 1500)
      } catch (e) {
        setAcceleratorModal(prev => ({ ...prev, logs: `${prev.logs}\n查询进度失败: ${e.message}` }))
      }
    }
    poll()
  }

  const renderImageUpdateButtons = (image, { compact = false, showLightning = true } = {}) => {
    const actionState = getImageUpdateActionState(image)
    const isBusy = actionState?.loading
    const progressPercent = Math.max(0, Math.min(100, Math.round(actionState?.percentage || 0)))
    const progressLabel = actionState?.progress || ''
    const progressAction = actionState?.action
    const showProgressState = ['update', 'delete', 'force-delete', 'ignore'].includes(progressAction) && (isBusy || actionState?.done)
    const overlayPercent = actionState?.done ? 100 : progressPercent

    const progressTone = actionState?.done
      ? "bg-gradient-to-r from-emerald-400/30 via-emerald-300/35 to-emerald-400/30 dark:from-emerald-500/20 dark:via-emerald-400/25 dark:to-emerald-500/20"
      : progressAction === 'delete' || progressAction === 'force-delete' || progressAction === 'ignore'
        ? "bg-gradient-to-r from-red-400/30 via-red-300/35 to-red-400/30 dark:from-red-500/20 dark:via-red-400/25 dark:to-red-500/20"
        : "bg-gradient-to-r from-sky-400/30 via-sky-300/35 to-sky-400/30 dark:from-sky-500/20 dark:via-sky-400/25 dark:to-sky-500/20"

    const progressOverlay = showProgressState ? (
      <div className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden rounded-lg",
        compact ? "rounded-md" : "rounded-lg"
      )}>
        <div
          className={cn(
            "absolute inset-y-0 left-0 transition-all duration-500 ease-out",
            progressTone
          )}
          style={{ width: `${overlayPercent}%` }}
        >
          <div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer"
            style={{
              backgroundSize: '200% 100%',
              animation: 'shimmer 2s infinite linear'
            }}
          />
        </div>
      </div>
    ) : null

    const progressText = showProgressState
      ? (actionState?.done
          ? (progressLabel || (progressAction === 'delete' || progressAction === 'force-delete'
              ? '删除成功'
              : progressAction === 'ignore'
                ? '忽略成功'
                : '更新成功'))
          : `${progressAction === 'delete' || progressAction === 'force-delete'
              ? '删除中'
              : progressAction === 'ignore'
                ? '忽略中'
                : '更新中'} ${progressPercent}%`)
      : ''

    const progressTextClass = actionState?.done
      ? "text-emerald-600 dark:text-emerald-400"
      : progressAction === 'delete' || progressAction === 'force-delete' || progressAction === 'ignore'
        ? "text-red-600 dark:text-red-300"
        : "text-sky-600 dark:text-sky-300"

    const buttonBase = compact
      ? "relative z-10 px-2 py-1 text-xs rounded-md border transition-colors whitespace-nowrap bg-white/82 dark:bg-gray-800/82 backdrop-blur-[1px] min-w-[52px]"
      : "relative z-10 inline-flex items-center justify-center px-2 py-1.5 text-xs rounded-lg border transition-colors active:scale-95 bg-white dark:bg-gray-800 shadow-sm hover:shadow min-w-[52px] whitespace-nowrap"

    const updateButtonClass = cn(
      buttonBase,
      image.haveUpdate && !isImageUpdateIgnored(image)
        ? "text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700 hover:bg-amber-50/80 dark:hover:bg-amber-900/20"
        : "text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-700 cursor-not-allowed"
    )

    const deleteButtonClass = cn(
      buttonBase,
      "text-red-600 dark:text-red-400 border-gray-200 dark:border-gray-700 hover:bg-red-50/80 dark:hover:bg-red-900/20"
    )

    const forceDeleteButtonClass = cn(
      buttonBase,
      "text-orange-600 dark:text-orange-400 border-gray-200 dark:border-gray-700 hover:bg-orange-50/80 dark:hover:bg-orange-900/20"
    )

    const ignoreButtonClass = cn(
      buttonBase,
      isImageUpdateIgnored(image)
        ? "text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700 hover:bg-amber-50/80 dark:hover:bg-amber-900/20"
        : "text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50"
    )

    const actionButtons = (
      <>
        <button
          onClick={(e) => { e.stopPropagation(); startImageUpdate(image) }}
          disabled={!image.haveUpdate || isImageUpdateIgnored(image) || isBusy}
          className={updateButtonClass}
          title={isImageUpdateIgnored(image) ? '这个镜像已在更新黑名单中' : image.haveUpdate ? '直接按系统默认源更新' : '当前没有检测到可用更新'}
        >
          更新
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setDeleteModal({ isOpen: true, image, force: false }) }}
          className={deleteButtonClass}
        >
          删除
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setDeleteModal({ isOpen: true, image, force: true }) }}
          className={forceDeleteButtonClass}
          title="强制删除镜像"
        >
          强删
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); (isImageUpdateIgnored(image) ? unignoreImageUpdate(image) : ignoreImageUpdate(image)) }}
          className={ignoreButtonClass}
        >
          {isImageUpdateIgnored(image) ? '取消' : '忽略'}
        </button>
      </>
    )

    const lightningButtonClass = compact
      ? "relative z-10 inline-flex items-center justify-center rounded-md p-0 text-amber-500 hover:text-amber-600 dark:hover:text-amber-300 transition-colors active:scale-95"
      : "relative z-10 p-1.5 text-amber-500 hover:text-amber-600 dark:hover:text-amber-300 rounded-md transition-colors active:scale-95 bg-amber-50/90 dark:bg-amber-900/15 border border-amber-300 dark:border-amber-700 min-w-[34px] min-h-[34px] inline-flex items-center justify-center"

    if (compact) {
      const compactActionButtons = showProgressState ? null : actionButtons
      return (
        <div className="min-w-[250px]">
          <div className="flex items-center gap-1.5">
            {showLightning && (
              <button
                onClick={(e) => { e.stopPropagation(); openAcceleratorModal(buildPullTarget(image) || image.name) }}
                className={lightningButtonClass}
                title="打开加速拉取面板"
              >
                <Zap className="h-4 w-4 fill-current stroke-[2.2]" />
              </button>
            )}
            <div className={cn(
              "relative flex-1 min-w-0 overflow-hidden rounded-md border bg-white/82 dark:bg-gray-800/82 backdrop-blur-[1px]",
              showProgressState ? "h-[30px]" : "inline-flex items-stretch gap-2 justify-start rounded-xl border-0 bg-transparent backdrop-blur-0"
            )}>
              {progressOverlay}
              {showProgressState ? (
                <div className={cn(
                  "relative z-10 flex h-full w-full items-center justify-center px-2 text-xs font-semibold whitespace-nowrap",
                  progressTextClass
                )} title={progressText}>
                  {progressText}
                </div>
              ) : compactActionButtons}
            </div>
          </div>
        </div>
      )
    }

    const cardUpdateButtonClass = cn(
      "relative z-10 inline-flex w-full items-center justify-center gap-1 px-2 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 transition-colors active:scale-95 bg-white dark:bg-gray-800 shadow-sm hover:shadow min-w-[52px] whitespace-nowrap",
      image.haveUpdate && !isImageUpdateIgnored(image)
        ? "text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:border-amber-200 dark:hover:border-amber-800"
        : "text-gray-300 dark:text-gray-600 cursor-not-allowed"
    )

    return (
      <div className="relative inline-flex w-full items-center gap-1.5 rounded-lg min-w-0">
        {showLightning && (
          <button
            onClick={(e) => { e.stopPropagation(); openAcceleratorModal(buildPullTarget(image) || image.name) }}
            className={lightningButtonClass}
            title="打开加速拉取面板"
          >
            <Zap className="h-4 w-4 fill-current stroke-[2.2]" />
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); startImageUpdate(image) }}
          disabled={!image.haveUpdate || isImageUpdateIgnored(image) || isBusy}
          className={cardUpdateButtonClass}
          title={isImageUpdateIgnored(image) ? '这个镜像已在更新黑名单中' : image.haveUpdate ? '直接按系统默认源更新' : '当前没有检测到可用更新'}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">更新</span>
        </button>
      </div>
    )
  }

  const filteredImages = images.filter((image) => {
    const keyword = searchKeyword.trim().toLowerCase()
    const matchesKeyword = !keyword || [image.name, image.tag, image.id, image.size, image.createTime, image.inUsed ? '使用中' : '未使用', image.haveUpdate ? '有更新' : '无更新', isImageUpdateIgnored(image) ? '已忽略' : '未忽略'].some(value => String(value || '').toLowerCase().includes(keyword))
    if (!matchesKeyword) return false
    if (!filterStatus) return true
    if (filterStatus === 'used') return image.inUsed
    if (filterStatus === 'unused') return !image.inUsed
    if (filterStatus === 'dangling') return image.tag === 'None' || image.tag === '<none>'
    if (filterStatus === 'updatable') return !!image.haveUpdate && !isImageUpdateIgnored(image)
    return true
  })

  const updatedImages = images.filter(img => img.haveUpdate && !isImageUpdateIgnored(img))
  const imageTableColumnDefaults = useMemo(() => ({
    name: 320,
    statusIcon: 24,
    tag: 132,
    imageId: 168,
    size: 128,
    createTime: 176,
    actions: 340,
  }), [])
  const { widths: imageTableWidths, startResize: startImageTableResize } = useResizableTableColumns('docker_copilot_image_table_widths_v1', imageTableColumnDefaults)
  const waitForPullTask = async (taskId, timeoutMs = 10 * 60 * 1000, onProgress) => {
    if (!taskId) return { done: false, status: 'missing-task-id' }
    const startedAt = Date.now()
    let lastMessage = ''
    let ticks = 0
    while (Date.now() - startedAt < timeoutMs) {
      ticks += 1
      try {
        const res = await progressAPI.getProgress(taskId)
        const progress = res.data?.data || {}
        const output = String(progress.output || progress.msg || progress.message || progress.detailMsg || '').trim()
        if (output) lastMessage = output
        const estimatedPercent = resolveImageProgressFromOutput(output, Math.min(94, 8 + ticks * 4))
        if (typeof onProgress === 'function') {
          onProgress({
            output,
            progress,
            percentage: estimatedPercent,
            done: false,
            ok: false,
          })
        }
        const completed = progress.completed === true || progress.status === 'completed' || output.includes('拉取完成') || output.includes('下载完成') || output.includes('镜像拉取完成') || output.includes('Pull complete')
        const failed = progress.status === 'failed' || output.includes('拉取失败') || output.includes('下载失败') || output.includes('Error response from daemon') || output.includes('manifest unknown')
        if (completed) {
          if (typeof onProgress === 'function') {
            onProgress({ output: output || lastMessage || '更新完成', progress, percentage: 100, done: true, ok: true })
          }
          return { done: true, ok: true, message: output || lastMessage || '任务完成' }
        }
        if (failed) {
          if (typeof onProgress === 'function') {
            onProgress({ output: output || lastMessage || '更新失败', progress, percentage: Math.max(estimatedPercent, 12), done: true, ok: false })
          }
          return { done: true, ok: false, message: output || lastMessage || '任务失败' }
        }
      } catch (err) {
        const msg = err?.response?.data?.msg || err?.message || ''
        if (String(msg).includes('taskID 未找到')) {
          if (typeof onProgress === 'function') {
            onProgress({ output: lastMessage || '任务已提交,进度记录已清理', progress: {}, percentage: 100, done: true, ok: true })
          }
          return { done: true, ok: true, message: lastMessage || '任务已提交,进度记录已清理' }
        }
        if (typeof onProgress === 'function') {
          onProgress({ output: msg || '获取任务进度失败', progress: {}, percentage: 14, done: true, ok: false })
        }
        return { done: true, ok: false, message: msg || '获取任务进度失败' }
      }
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
    if (typeof onProgress === 'function') {
      onProgress({ output: '等待镜像更新超时', progress: {}, percentage: 95, done: true, ok: false })
    }
    return { done: true, ok: false, message: '等待镜像更新超时' }
  }

  const startImageUpdate = async (image) => {
    try {
      const imageRef = buildPullTarget(image)
      if (!imageRef) {
        setError('这个镜像没有可用的仓库名/Tag,暂时不能单独更新')
        return
      }
      setError(null)
      setSuccess(null)
      setImageUpdateAction(image, { action: 'update', loading: true, done: false, progress: '正在准备更新...', percentage: 8 })
      const res = await imageAPI.pullImage(imageRef, '', imageRef)
      const taskId = res.data?.data?.taskID
      if (!taskId) {
        setImageUpdateAction(image, { action: 'update', loading: false, done: true, progress: '已提交更新任务', percentage: 100 })
        clearImageUpdateActionLater(image)
        setSuccessModal({ isOpen: true, message: `已提交更新任务:${imageRef}` })
        setTimeout(() => setSuccessModal({ isOpen: false, message: '' }), 3000)
        fetchImages({ keepRefreshing: true })
        return
      }
      await waitForPullTask(taskId, 10 * 60 * 1000, ({ output, percentage, done, ok }) => {
        setImageUpdateAction(image, {
          action: 'update',
          loading: !done,
          done: !!done,
          progress: output || (done ? (ok ? '更新完成' : '更新失败') : '更新中...'),
          percentage: done && ok ? 100 : percentage,
          ok,
        })
      })
      const actionState = getImageUpdateActionState(image)
      if (actionState?.done) {
        if (actionState?.ok === false) {
          setError(actionState?.progress || '镜像更新失败;如果直连失败,可以点闪电走加速拉取')
        } else {
          setSuccessModal({ isOpen: true, message: `镜像更新完成:${imageRef}` })
          setTimeout(() => setSuccessModal({ isOpen: false, message: '' }), 3000)
        }
      }
      clearImageUpdateActionLater(image)
      fetchImages({ keepRefreshing: true })
    } catch (e) {
      setImageUpdateAction(image, { action: 'update', loading: false, done: true, ok: false, progress: e.response?.data?.msg || e.message || '提交镜像更新任务失败', percentage: 12 })
      clearImageUpdateActionLater(image, 5000)
      setError(e.response?.data?.msg || e.message || '提交镜像更新任务失败;如果直连失败,可以点闪电走加速拉取')
    }
  }

  const handleBatchUpdate = async () => {
    try {
      const selected = images.filter(img => selectedImages.includes(img.id))
      const targets = selected.filter(img => img.haveUpdate && !isImageUpdateIgnored(img))
      if (!targets.length) {
        setError('当前选中的镜像里,没有可更新且未忽略的镜像')
        return
      }
      setIsLoading(true)
      const lines = []
      let started = 0
      for (const image of targets) {
          const imageRef = buildPullTarget(image)
          if (!imageRef) {
            lines.push(`跳过: ${image?.name || image?.id || '未知镜像'}(缺少有效 Tag)`)
            continue
          }
          setImageUpdateAction(image, { action: 'update', loading: true, done: false, progress: `排队更新中:${imageRef}`, percentage: 8 })
          try {
            const res = await imageAPI.pullImage(imageRef, '', imageRef)
            const taskId = res.data?.data?.taskID
            started += 1
            lines.push(`已开始更新: ${imageRef}`)
            const result = await waitForPullTask(taskId, 10 * 60 * 1000, ({ output, percentage, done, ok }) => {
              setImageUpdateAction(image, {
                action: 'update',
                loading: !done,
                done: !!done,
                ok,
                progress: output || (done ? (ok ? '更新完成' : '更新失败') : `更新中:${imageRef}`),
                percentage: done && ok ? 100 : percentage,
              })
            })
            lines.push(`${result.ok ? '完成' : '失败'}: ${imageRef} · ${result.message}`)
            clearImageUpdateActionLater(image)
          } catch (err) {
            setImageUpdateAction(image, { action: 'update', loading: false, done: true, ok: false, progress: err.response?.data?.msg || err.message || '提交失败', percentage: 12 })
            clearImageUpdateActionLater(image, 5000)
            lines.push(`更新失败: ${imageRef} · ${err.response?.data?.msg || err.message || '提交失败'}`)
          }
      }
      if (!started) {
        setError(lines.join('\n') || '没有成功提交任何更新任务')
        return
      }
      setSuccessModal({ isOpen: true, message: `已按队列处理 ${started} 个镜像更新任务` })
      setTimeout(() => setSuccessModal({ isOpen: false, message: '' }), 3000)
      setSuccess(lines.join('\n'))
      fetchImages({ keepRefreshing: true })
    } catch (e) {
      setError(e.response?.data?.msg || e.message || '批量提交镜像更新任务失败')
    } finally {
      setIsLoading(false)
    }
  }

  const handleBatchIgnore = async () => {
    const selected = images.filter(img => selectedImages.includes(img.id))
    if (!selected.length) return
    await saveUpdateBlacklist([...updateBlacklist, ...selected.flatMap(getImageBlacklistCandidates)])
    setSelectedImages([])
    setIsBatchMode(false)
  }

  const handleBatchUnignore = async () => {
    const selected = images.filter(img => selectedImages.includes(img.id))
    if (!selected.length) return
    await saveUpdateBlacklist(updateBlacklist.filter(item => !selected.some(image => matchesImageBlacklistItem(image, item))))
    setSelectedImages([])
    setIsBatchMode(false)
  }

  const openImageRefLink = (image) => {
    const target = canonicalRepoLink(image)
    if (target) {
      window.open(target, '_blank', 'noopener,noreferrer')
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))
    const runMock = async (keyword = '', duration = 2600) => {
      const text = String(keyword || '').trim().toLowerCase()
      const targets = images.filter(image => {
        const haystack = [image.name, image.tag, image.id].map(v => String(v || '').toLowerCase()).join(' ')
        return !text || haystack.includes(text)
      })
      if (!targets.length) return 0
      for (const image of targets) {
        const key = image?.id || image?.name || ''
        if (!key) continue
        const started = Date.now()
        while (Date.now() - started < duration) {
          const percent = Math.max(1, Math.min(100, Math.round(((Date.now() - started) / duration) * 100)))
          setImageUpdateActions(prev => ({
            ...prev,
            [key]: {
              action: 'update',
              loading: true,
              done: false,
              percentage: percent,
              progress: `更新中 ${percent}%`,
            }
          }))
          await sleep(90)
        }
        setImageUpdateActions(prev => ({
          ...prev,
          [key]: {
            action: 'update',
            loading: false,
            done: true,
            percentage: 100,
            progress: '更新成功',
          }
        }))
      }
      return targets.length
    }

    window.dcDebug = {
      ...(window.dcDebug || {}),
      mockImageCardUpdate: async (keyword = '', duration = 2600) => {
        setViewMode('card')
        return runMock(keyword, duration)
      },
      mockImageListUpdate: async (keyword = '', duration = 2600) => {
        setViewMode('table')
        return runMock(keyword, duration)
      },
      clearImageMocks: () => setImageUpdateActions({}),
    }

    return () => {
      if (typeof window !== 'undefined' && window.dcDebug) {
        delete window.dcDebug.mockImageCardUpdate
        delete window.dcDebug.mockImageListUpdate
        delete window.dcDebug.clearImageMocks
      }
    }
  }, [images])

  useEffect(() => {
    if (viewMode === 'table') {
      setIsBatchMode(false)
    }
  }, [viewMode])

  const openImageEditModal = (image) => {
    if (!image) return
    if (image.inUsed) {
      setError('该镜像正被容器引用(包括已停止容器),请先处理相关容器再修改')
      return
    }
    setEditImageModal({
      isOpen: true,
      image,
      name: image.name || '',
      tag: image.tag && image.tag !== 'None' && image.tag !== '<none>' ? image.tag : '',
      saving: false,
    })
  }

  const saveImageRetag = async () => {
    const image = editImageModal.image
    if (!image) return
    const name = String(editImageModal.name || '').trim()
    const tag = String(editImageModal.tag || '').trim()
    if (!name) {
      setError('镜像名不能为空')
      return
    }
    if (!tag) {
      setError('Tag 不能为空')
      return
    }
    if (image.inUsed) {
      setError('该镜像正在被容器使用,请先关闭相关容器再修改')
      return
    }
    try {
      setEditImageModal(prev => ({ ...prev, saving: true }))
      setError(null)
      const res = await imageAPI.retagImage(image.id, {
        name,
        tag,
        oldName: image.name,
        oldTag: image.tag,
      })
      const warning = res.data?.data?.warning
      setEditImageModal({ isOpen: false, image: null, name: '', tag: '', saving: false })
      if (warning) {
        setSuccess(warning)
      } else {
        setSuccess('镜像名称 / Tag 修改成功')
      }
      fetchImages()
    } catch (e) {
      setError(e.response?.data?.msg || e.message || '修改镜像名称 / Tag 失败')
      setEditImageModal(prev => ({ ...prev, saving: false }))
    }
  }

  if (isLoading && images.length === 0) {
    return (
      <div className="py-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-32"></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="card p-6 h-48 rounded-2xl"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full">
      {/* 状态消息 */}
      {error && (
        <div className="mx-4 sm:mx-6 mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900 rounded-lg flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <span className="text-red-800 dark:text-red-200 text-sm flex-1">{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 flex-shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="mx-4 sm:mx-6 mt-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-900 rounded-lg flex items-start gap-3">
          <CheckCircle className="h-5 w-5 text-green-500 dark:text-green-400 flex-shrink-0 mt-0.5" />
          <span className="text-green-800 dark:text-green-200 text-sm flex-1">{success}</span>
          <button
            onClick={() => setSuccess(null)}
            className="text-green-500 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300 flex-shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}



      {isRefreshing && images.length > 0 && (
        <div className="mx-2 sm:mx-6 my-3 rounded-3xl border border-primary-200/70 dark:border-primary-800/70 bg-primary-50/80 dark:bg-primary-950/30 p-8 shadow-inner overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 dark:via-white/5 to-transparent animate-pulse"></div>
          <div className="relative flex items-center justify-center gap-3 text-primary-700 dark:text-primary-300 font-medium">
            <RefreshCw className="h-5 w-5 animate-spin" />
            <span>正在刷新镜像数据、状态和列表元素...</span>
          </div>
        </div>
      )}

      {/* 统计信息 */}
      <div className="py-4">
        <div className="overflow-x-auto rounded-3xl shadow-lg">
          <div className="grid min-w-[410px] grid-flow-col auto-cols-fr gap-0 rounded-3xl overflow-hidden border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 min-h-[116px] sm:min-w-0 sm:grid-cols-6 sm:grid-flow-row">
          {/* 总镜像数 */}
          <button
            onClick={() => setFilterStatus(null)}
            className={cn(
              "p-4 sm:p-6 text-center transition-all duration-300 relative overflow-hidden group border-r border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center",
              filterStatus === null ? "bg-primary-50 dark:bg-primary-900/20" : "hover:bg-gray-50 dark:hover:bg-gray-700/50"
            )}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-primary-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative">
              <div className="text-2xl sm:text-3xl font-bold text-primary-600 dark:text-primary-400 transition-transform duration-300 group-hover:scale-110">
                {images.length}
              </div>
              <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">镜像</div>
            </div>
          </button>

          {/* 使用中 */}
          <button
            onClick={() => setFilterStatus('used')}
            className={cn(
              "p-4 sm:p-6 text-center transition-all duration-300 relative overflow-hidden group border-r border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center",
              filterStatus === 'used' ? "bg-green-50 dark:bg-green-900/20" : "hover:bg-gray-50 dark:hover:bg-gray-700/50"
            )}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative">
              <div className="text-2xl sm:text-3xl font-bold text-green-600 dark:text-green-400 transition-transform duration-300 group-hover:scale-110">
                {images.filter(img => img.inUsed).length}
              </div>
              <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">使用</div>
            </div>
          </button>

          {/* 未使用 */}
          <button
            onClick={() => setFilterStatus('unused')}
            className={cn(
              "p-4 sm:p-6 text-center transition-all duration-300 relative overflow-hidden group border-r border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center",
              filterStatus === 'unused' ? "bg-yellow-50 dark:bg-yellow-900/20" : "hover:bg-gray-50 dark:hover:bg-gray-700/50"
            )}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative">
              <div className="text-2xl sm:text-3xl font-bold text-yellow-600 dark:text-yellow-400 transition-transform duration-300 group-hover:scale-110">
                {images.filter(img => !img.inUsed).length}
              </div>
              <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">空闲</div>
            </div>
          </button>

          {/* 无Tag */}
          <button
            onClick={() => setFilterStatus('dangling')}
            className={cn(
              "p-4 sm:p-6 text-center transition-all duration-300 relative overflow-hidden group border-r border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center",
              filterStatus === 'dangling' ? "bg-orange-50 dark:bg-orange-900/20" : "hover:bg-gray-50 dark:hover:bg-gray-700/50"
            )}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative">
              <div className="text-2xl sm:text-3xl font-bold text-orange-600 dark:text-orange-400 transition-transform duration-300 group-hover:scale-110">
                {images.filter(img => img.tag === 'None' || img.tag === '<none>').length}
              </div>
              <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">无tag</div>
            </div>
          </button>

          {/* 有更新 */}
          <button
            onClick={() => setFilterStatus('updatable')}
            className={cn(
              "p-4 sm:p-6 text-center transition-all duration-300 relative overflow-hidden group border-r border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center",
              filterStatus === 'updatable' ? "bg-sky-50 dark:bg-sky-900/20" : "hover:bg-gray-50 dark:hover:bg-gray-700/50"
            )}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-sky-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative">
              <div className="text-2xl sm:text-3xl font-bold text-sky-600 dark:text-sky-400 transition-transform duration-300 group-hover:scale-110">
                {updatedImages.length}
              </div>
              <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">更新</div>
            </div>
          </button>

          {/* 加速源配置 */}
          <button
            onClick={() => openAcceleratorModal('')}
            className="p-4 sm:p-6 text-center transition-all duration-300 relative overflow-hidden group flex flex-col items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-700/50"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-sky-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative flex flex-col items-center">
              <Zap className="h-7 w-7 text-yellow-500 dark:text-yellow-400 mb-2 transition-transform duration-300 group-hover:scale-110 fill-current stroke-[2.2]" />
              <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">加速</div>
            </div>
          </button>
        </div>
        </div>

        <div className="mt-4 rounded-3xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 sm:p-4 shadow-sm">
          <div className="flex flex-col gap-3">
            <div className="overflow-x-auto pb-1">
              <div className="flex min-w-max items-center gap-1.5 sm:gap-2">
                {viewMode === 'card' && !isBatchMode && (
                  <button
                    onClick={() => setIsBatchMode(true)}
                    className="inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-lg bg-gray-100 px-2.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 sm:min-w-0 sm:px-3"
                    title="批量操作"
                  >
                    <CheckSquare className="h-4 w-4" />
                    <span className="hidden sm:inline">批量操作</span>
                  </button>
                )}
                {viewMode === 'card' && isBatchMode && (
                  <button
                    onClick={() => {
                      setIsBatchMode(false)
                      setSelectedImages([])
                    }}
                    className="inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-lg bg-gray-100 px-2.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 sm:min-w-0 sm:px-3"
                    title="退出批量"
                  >
                    <CheckSquare className="h-4 w-4" />
                    <span className="hidden sm:inline">退出批量</span>
                  </button>
                )}
                {(viewMode === 'table' || isBatchMode || selectedImages.length > 0) && (() => {
                  const allVisibleSelected = filteredImages.length > 0 && filteredImages.every(img => selectedImages.includes(img.id))
                  const hasIgnoredSelected = selectedImages.some(id => {
                    const img = images.find(item => item.id === id)
                    return img && isImageUpdateIgnored(img)
                  })
                  const hasNormalSelected = selectedImages.some(id => {
                    const img = images.find(item => item.id === id)
                    return img && !isImageUpdateIgnored(img)
                  })
                  return (
                    <div className="flex min-w-max items-center gap-1.5 sm:gap-2">
                      <button
                        onClick={toggleSelectAllImages}
                        disabled={isLoading || filteredImages.length === 0 || (viewMode === 'card' && !isBatchMode)}
                        className={batchButtonClass('border-gray-200 bg-gray-100 text-gray-700 hover:bg-gray-200 dark:border-gray-700 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600', isLoading || filteredImages.length === 0 || (viewMode === 'card' && !isBatchMode))}
                        title={allVisibleSelected ? '取消全选' : '全选'}
                      >
                        <CheckSquare className="h-4 w-4" />
                        <span className="hidden sm:inline">{allVisibleSelected ? '取消全选' : '全选'}</span>
                      </button>
                      {!allVisibleSelected && selectedImages.length > 0 && (
                        <button
                          onClick={() => setSelectedImages([])}
                          disabled={isLoading}
                          className="inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-lg bg-gray-100 px-2.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 sm:min-w-0 sm:px-3"
                        >
                          <X className="h-4 w-4" />
                          <span className="hidden sm:inline">取消选择</span>
                        </button>
                      )}
                      <button
                        onClick={handleBatchUpdate}
                        disabled={isLoading || selectedImages.length === 0 || !images.some(img => selectedImages.includes(img.id) && img.haveUpdate)}
                        className={batchButtonClass('border-sky-200 bg-sky-100 text-sky-700 hover:bg-sky-200 dark:border-sky-800/60 dark:bg-sky-900/40 dark:text-sky-200 dark:hover:bg-sky-900/60', isLoading || selectedImages.length === 0 || !images.some(img => selectedImages.includes(img.id) && img.haveUpdate))}
                      >
                        <RefreshCw className="h-4 w-4" />
                        <span className="hidden sm:inline">更新</span>
                      </button>
                      {hasNormalSelected && (
                        <button
                          onClick={handleBatchIgnore}
                          disabled={isLoading || selectedImages.length === 0}
                          className={batchButtonClass('border-yellow-200 bg-yellow-100 text-yellow-700 hover:bg-yellow-200 dark:border-yellow-800/60 dark:bg-yellow-900/40 dark:text-yellow-200 dark:hover:bg-yellow-900/60', isLoading || selectedImages.length === 0)}
                        >
                          <Ban className="h-4 w-4" />
                          <span className="hidden sm:inline">忽略</span>
                        </button>
                      )}
                      {hasIgnoredSelected && (
                        <button
                          onClick={handleBatchUnignore}
                          disabled={isLoading || selectedImages.length === 0}
                          className={batchButtonClass('border-amber-200 bg-amber-100 text-amber-700 hover:bg-amber-200 dark:border-amber-800/60 dark:bg-amber-900/40 dark:text-amber-200 dark:hover:bg-amber-900/60', isLoading || selectedImages.length === 0)}
                        >
                          <Ban className="h-4 w-4" />
                          <span className="hidden sm:inline">取消忽略</span>
                        </button>
                      )}
                      <button
                        onClick={openBatchDelete}
                        disabled={isLoading || selectedImages.length === 0}
                        className={batchButtonClass('border-red-200 bg-red-100 text-red-700 hover:bg-red-200 dark:border-red-800/60 dark:bg-red-900/40 dark:text-red-200 dark:hover:bg-red-900/60', isLoading || selectedImages.length === 0)}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="hidden sm:inline">删除{selectedImages.length > 0 ? `(${selectedImages.length})` : ''}</span>
                      </button>
                      <button
                        onClick={() => openConfirmBatchDelete(true)}
                        disabled={isLoading || selectedImages.length === 0}
                        className={batchButtonClass('border-red-200 bg-red-600 text-white hover:bg-red-700 dark:border-red-500 dark:bg-red-500 dark:hover:bg-red-400', isLoading || selectedImages.length === 0)}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="hidden sm:inline">强删{selectedImages.length > 0 ? `(${selectedImages.length})` : ''}</span>
                      </button>
                    </div>
                  )
                })()}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  placeholder="搜索"
                  className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-8 pr-2 text-xs sm:text-sm text-gray-900 placeholder-gray-400 focus:border-transparent focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>
              <button
                onClick={handleRefresh}
                disabled={isLoading || isRefreshing}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary-600 px-0 py-0 text-white transition-colors hover:bg-primary-700 disabled:opacity-50 sm:w-auto sm:px-4"
              >
                <RefreshCw className="h-4 w-4" />
                <span className="hidden sm:inline">刷新</span>
              </button>
              <button
                onClick={() => setViewMode(viewMode === 'card' ? 'table' : 'card')}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-gray-600 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900/30 dark:text-gray-300 dark:hover:bg-gray-700 sm:w-auto sm:px-3"
                title={viewMode === 'card' ? '切换到表格视图' : '切换到卡片视图'}
              >
                {viewMode === 'card' ? <LayoutList className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 筛选/批量提示 */}
      {(filterStatus || selectedImages.length > 0) && (
        <div className="pt-2 pb-0">
          <div className="mb-0 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-blue-700 dark:text-blue-300">
                {filterStatus ? (
                  <>
                    筛选：
                    {filterStatus === 'used' && '使用中'}
                    {filterStatus === 'unused' && '未使用'}
                    {filterStatus === 'dangling' && '无Tag'}
                    {filterStatus === 'updatable' && '有更新'}
                  </>
                ) : (
                  <>已选中 {selectedImages.length} 个镜像</>
                )}
                {filterStatus && selectedImages.length > 0 && ` · 已选中 ${selectedImages.length} 个镜像`}
              </span>
              {filterStatus && <button
                onClick={() => setFilterStatus(null)}
                className="inline-flex items-center justify-center rounded-md bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-600 transition-colors hover:text-blue-800 dark:bg-blue-800/50 dark:text-blue-300 dark:hover:text-blue-100"
              >
                清除筛选
              </button>}
              </div>
            </div>
          </div>
        </div>
      )}

      <ImageListView
        images={images}
        viewMode={viewMode}
        filteredImages={filteredImages}
        selectedImages={selectedImages}
        toggleSelectAllImages={toggleSelectAllImages}
        toggleImageSelection={toggleImageSelection}
        imageTableWidths={imageTableWidths}
        customIcons={customIcons}
        openImageEditModal={openImageEditModal}
        isImageUpdateIgnored={isImageUpdateIgnored}
        getImageUpdateActionState={getImageUpdateActionState}
        renderImageUpdateButtons={renderImageUpdateButtons}
        isBatchMode={isBatchMode}
        openAcceleratorModal={openAcceleratorModal}
        openImageRefLink={openImageRefLink}
        startImageUpdate={startImageUpdate}
        setDeleteModal={setDeleteModal}
        unignoreImageUpdate={unignoreImageUpdate}
        ignoreImageUpdate={ignoreImageUpdate}
      />

      <ImageModals
        successModal={successModal}
        setSuccessModal={setSuccessModal}
        pruneModal={pruneModal}
        setPruneModal={setPruneModal}
        handlePrune={handlePrune}
        isLoading={isLoading}
        customIcons={customIcons}
        acceleratorModal={acceleratorModal}
        setAcceleratorModal={setAcceleratorModal}
        testAcceleratorLatency={testAcceleratorLatency}
        testingAccelerators={testingAccelerators}
        acceleratorOptions={acceleratorOptions}
        formatLatency={formatLatency}
        selectAcceleratorSource={selectAcceleratorSource}
        startAcceleratedPull={startAcceleratedPull}
        newAccelerator={newAccelerator}
        setNewAccelerator={setNewAccelerator}
        addAccelerator={addAccelerator}
        latencyClassName={latencyClassName}
        setConfirmRemoveAccelerator={setConfirmRemoveAccelerator}
        confirmRemoveAccelerator={confirmRemoveAccelerator}
        removeAccelerator={removeAccelerator}
        editImageModal={editImageModal}
        setEditImageModal={setEditImageModal}
        openImageRefLink={openImageRefLink}
        saveImageRetag={saveImageRetag}
        confirmBatchDeleteModal={confirmBatchDeleteModal}
        setConfirmBatchDeleteModal={setConfirmBatchDeleteModal}
        handleBatchDelete={handleBatchDelete}
        deleteModal={deleteModal}
        setDeleteModal={setDeleteModal}
        handleDeleteImage={handleDeleteImage}
      />
    </div>
  )
}

export default Images
