import React, { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { HardDrive, Trash2, RefreshCw, Link, X, AlertCircle, CheckCircle, LayoutGrid, Search, CheckSquare, LayoutList, Zap, Logs, Plus, Gauge, CircleHelp, Pencil, ExternalLink, Ban } from 'lucide-react'
import { imageAPI, botAPI, progressAPI } from '../api/client.js'
import { cn } from '../utils/cn.js'
import { getImageLogo } from '../config/imageLogos.js'
import { useResizableTableColumns } from '../hooks/useResizableTableColumns.js'

function stripEnglishConflictPrefix(rawMsg) {
  const msg = String(rawMsg || '').trim()
  if (!msg) return ''
  const lines = msg.split('\n').map(s => s.trim()).filter(Boolean)
  return lines.length > 1 ? lines.join('\n') : ''
}

// 安全的图片组件
function SafeImage({ src, alt, className, fallback }) {
  const [hasError, setHasError] = React.useState(false)

  if (hasError || !src) {
    return fallback
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setHasError(true)}
    />
  )
}

const MIN_REFRESH_VISIBLE_MS = 500

function humanizeImageDeleteError(rawMsg, image, force) {
  const msg = String(rawMsg || '').trim()
  if (!msg) return force ? '强制删除镜像失败' : '删除镜像失败'
  const lower = msg.toLowerCase()
  let human = `删除失败:${msg}`
  if (lower.includes('conflict') && lower.includes('container')) {
    human = '删除失败:这个镜像仍被容器引用,Docker 不允许直接删除。请先删除/替换相关容器,或改用"强制删除"。'
  } else if (lower.includes('conflict') && (lower.includes('repository reference') || lower.includes('must be forced'))) {
    human = '删除失败:这个镜像还有多个标签或仓库引用,普通删除不会生效。请改用"强制删除"。'
  } else if (lower.includes('image is being used by running container')) {
    human = '删除失败:这个镜像正被运行中的容器使用,必须先停掉或替换容器,或使用"强制删除"。'
  } else if (lower.includes('no such image')) {
    human = '删除失败:这个镜像已经不存在了,刷新列表后再看一下。'
  }
  const raw = stripEnglishConflictPrefix(msg)
  return raw ? `${raw}\n\n${human}` : human
}

function imageRiskHints(image) {
  const hints = []
  if (image?.multiRef) {
    hints.push('这是多引用镜像:同一个镜像 ID 仍挂着多个 tag 或多个仓库引用。')
    hints.push('普通删除可能失败,因为 Docker 往往只允许在无额外引用时直接删除。')
    hints.push('如果普通删除失败,可改用"强制删除"。')
  }
  return hints
}

function ImageRiskHint({ image }) {
  const hints = imageRiskHints(image)
  const [open, setOpen] = useState(false)

  if (!image?.multiRef || image?.inUsed || hints.length === 0) return null

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(v => !v)
        }}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-amber-600 hover:bg-amber-50 hover:text-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/20 dark:hover:text-amber-200"
        title="查看镜像说明"
      >
        <CircleHelp className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute left-6 top-1/2 z-[120] w-72 -translate-y-1/2 rounded-xl border border-amber-200 bg-white p-3 text-left shadow-2xl dark:border-amber-800 dark:bg-gray-900">
          <div className="mb-2 text-xs font-semibold text-amber-700 dark:text-amber-300">镜像说明</div>
          <div className="space-y-1.5 text-xs leading-5 text-gray-700 dark:text-gray-200">
            {hints.map((hint, idx) => <div key={idx}>{hint}</div>)}
          </div>
        </div>
      )}
    </div>
  )
}

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

  const normalizeImageName = (value) => String(value || '')
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/^registry-1\.docker\.io\//, '')
    .replace(/^docker\.io\//, '')
    .replace(/^library\//, '')
    .toLowerCase()

  const canonicalImageName = (value) => {
    let v = normalizeImageName(value)
    if (!v) return ''
    const slash = v.lastIndexOf('/')
    const colon = v.lastIndexOf(':')
    if (colon <= slash && !v.includes('@')) v = `${v}:latest`
    return v
  }

  const getImageBlacklistCandidates = (image) => {
    const refs = [
      image?.name && image?.tag && image.tag !== 'None' && image.tag !== '<none>' ? `${image.name}:${image.tag}` : '',
      image?.name,
    ].map(canonicalImageName).filter(Boolean)
    return Array.from(new Set(refs))
  }

  const matchesImageBlacklistItem = (image, item) => {
    const normalizedItem = canonicalImageName(item)
    if (!normalizedItem) return false
    return getImageBlacklistCandidates(image).some(candidate => candidate === normalizedItem || candidate.startsWith(`${normalizedItem}:`) || normalizedItem.startsWith(`${candidate}:`))
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

  const formatImageSize = (sizeStr) => {
    if (!sizeStr) return '0 MB'
    return sizeStr.replace(/mb/gi, 'MB')
      .replace(/gb/gi, 'GB')
      .replace(/kb/gi, 'KB')
  }

  const formatTableDateTime = (value) => {
    const raw = String(value || '').trim()
    if (!raw) return '-'
    const normalized = raw
      .replace('T', ' ')
      .replace(/\//g, '-')
      .replace(/\.\d+Z?$/, '')
      .replace(/\s*UTC$/i, '')
      .trim()
    const matched = normalized.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})/)
    if (matched) return `${matched[1]} ${matched[2]}`
    const parsed = new Date(raw)
    if (!Number.isNaN(parsed.getTime())) {
      const pad = (n) => String(n).padStart(2, '0')
      return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}:${pad(parsed.getSeconds())}`
    }
    return normalized
  }

  const getSizeInMB = (size) => {
    const raw = String(size || '').trim().toLowerCase()
    const value = parseFloat(raw) || 0
    if (raw.includes('gb')) return value * 1024
    if (raw.includes('kb')) return value / 1024
    return value
  }

  const getSizeColor = (size) => {
    const sizeInMB = getSizeInMB(size)
    if (sizeInMB < 200) return 'text-green-600 dark:text-green-400'
    if (sizeInMB < 1024) return 'text-yellow-600 dark:text-yellow-400'
    return 'text-red-600 dark:text-red-400'
  }


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
  const shortImageId = (id) => (id || '').replace(/^sha256:/, '').slice(0, 12)
  const buildPullTarget = (image) => {
    const name = String(image?.name || '').trim()
    const tag = String(image?.tag || '').trim()
    if (!name || name === 'None' || !tag || tag === 'None' || tag === '<none>') return ''
    return `${name}:${tag}`
  }

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

  const canonicalRepoLink = (image) => {
    const name = String(image?.name || '').trim()
    if (!name || name === 'None') return ''
    if (name.startsWith('ghcr.io/')) {
      const parts = name.split('/').filter(Boolean)
      if (parts.length >= 3) {
        const owner = parts[1]
        const pkg = parts.slice(2).join('/')
        return `https://github.com/users/${owner}/packages/container/package/${pkg}`
      }
      return image?.repoLinks?.github || ''
    }
    return image?.repoLinks?.dockerHub || `https://hub.docker.com/r/${name.includes('/') ? name : `library/${name}`}`
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
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 py-4">
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
    <div className="max-w-[1800px] mx-auto">
      {/* 页面头部 */}
      <div className="px-2 sm:px-6 py-4 pt-4 sm:pt-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">镜像管理</h2>
            <p className="text-gray-600 dark:text-gray-400 mt-1">查看和管理Docker镜像</p>
          </div>
        </div>
      </div>

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
      <div className="px-2 sm:px-6 py-4">
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
                    className="inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-lg bg-gray-100 px-2.5 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 sm:h-auto sm:min-w-0 sm:px-3"
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
                    className="inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-lg bg-gray-100 px-2.5 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 sm:h-auto sm:min-w-0 sm:px-3"
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
                        className="inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-lg bg-blue-100 px-2.5 py-2 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-200 disabled:opacity-50 dark:bg-blue-900/40 dark:text-blue-200 dark:hover:bg-blue-900/60 sm:h-auto sm:min-w-0 sm:px-3"
                        title={allVisibleSelected ? '取消全选' : '全选'}
                      >
                        <CheckSquare className="h-4 w-4" />
                        <span className="hidden sm:inline">{allVisibleSelected ? '取消全选' : '全选'}</span>
                      </button>
                      {!allVisibleSelected && selectedImages.length > 0 && (
                        <button
                          onClick={() => setSelectedImages([])}
                          disabled={isLoading}
                          className="inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-lg bg-gray-100 px-2.5 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 sm:h-auto sm:min-w-0 sm:px-3"
                        >
                          <X className="h-4 w-4" />
                          <span className="hidden sm:inline">取消选择</span>
                        </button>
                      )}
                      <button
                        onClick={handleBatchUpdate}
                        disabled={isLoading || selectedImages.length === 0 || !images.some(img => selectedImages.includes(img.id) && img.haveUpdate)}
                        className="inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-lg bg-sky-100 px-2.5 py-2 text-xs font-medium text-sky-700 transition-colors hover:bg-sky-200 disabled:opacity-50 dark:bg-sky-900/40 dark:text-sky-200 dark:hover:bg-sky-900/60 sm:h-auto sm:min-w-0 sm:px-3"
                      >
                        <RefreshCw className="h-4 w-4" />
                        <span className="hidden sm:inline">更新</span>
                      </button>
                      {hasNormalSelected && (
                        <button
                          onClick={handleBatchIgnore}
                          disabled={isLoading || selectedImages.length === 0}
                          className="inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-lg bg-gray-100 px-2.5 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 sm:h-auto sm:min-w-0 sm:px-3"
                        >
                          <Ban className="h-4 w-4" />
                          <span className="hidden sm:inline">忽略</span>
                        </button>
                      )}
                      {hasIgnoredSelected && (
                        <button
                          onClick={handleBatchUnignore}
                          disabled={isLoading || selectedImages.length === 0}
                          className="inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-lg bg-amber-100 px-2.5 py-2 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-200 disabled:opacity-50 dark:bg-amber-900/40 dark:text-amber-200 dark:hover:bg-amber-900/60 sm:h-auto sm:min-w-0 sm:px-3"
                        >
                          <Ban className="h-4 w-4" />
                          <span className="hidden sm:inline">取消忽略</span>
                        </button>
                      )}
                      <button
                        onClick={openBatchDelete}
                        disabled={isLoading || selectedImages.length === 0}
                        className="inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-lg bg-red-100 px-2.5 py-2 text-xs font-medium text-red-700 transition-colors hover:bg-red-200 disabled:opacity-50 dark:bg-red-900/40 dark:text-red-200 dark:hover:bg-red-900/60 sm:h-auto sm:min-w-0 sm:px-3"
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="hidden sm:inline">删除{selectedImages.length > 0 ? `(${selectedImages.length})` : ''}</span>
                      </button>
                      <button
                        onClick={() => openConfirmBatchDelete(true)}
                        disabled={isLoading || selectedImages.length === 0}
                        className="inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-lg bg-orange-100 px-2.5 py-2 text-xs font-medium text-orange-700 transition-colors hover:bg-orange-200 disabled:opacity-50 dark:bg-orange-900/40 dark:text-orange-200 dark:hover:bg-orange-900/60 sm:h-auto sm:min-w-0 sm:px-3"
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
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary-600 px-0 py-0 text-white transition-colors hover:bg-primary-700 disabled:opacity-50 sm:h-auto sm:w-auto sm:px-4 sm:py-2"
              >
                <RefreshCw className="h-4 w-4" />
                <span className="hidden sm:inline">刷新</span>
              </button>
              <button
                onClick={() => setViewMode(viewMode === 'card' ? 'table' : 'card')}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-gray-600 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900/30 dark:text-gray-300 dark:hover:bg-gray-700 sm:h-auto sm:w-auto sm:px-3 sm:py-2"
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
        <div className="px-3 sm:px-6 pt-2 pb-0">
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

      {/* 镜像网格 */}
      <div className="px-2 sm:px-6 py-4">
        {images.length === 0 ? (
          <div className="card p-12 text-center rounded-2xl">
            <HardDrive className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">暂无镜像</h3>
            <p className="text-gray-500 dark:text-gray-400">您还没有任何Docker镜像</p>
          </div>
        ) : viewMode === 'table' ? (
          <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full table-fixed divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900/60">
                  <tr>
                    <th className="w-14 px-4 py-3 text-left">
                      <label className="inline-flex items-center justify-center w-8 h-8 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={filteredImages.length > 0 && filteredImages.every(img => selectedImages.includes(img.id))}
                          onChange={toggleSelectAllImages}
                          className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                        />
                      </label>
                    </th>
                    {[
                      { key: 'name', title: '镜像名称', minWidth: 240 },
                      { key: 'tag', title: 'Tag', minWidth: 110 },
                      { key: 'statusIcon', title: '', minWidth: 52 },
                      { key: 'imageId', title: '镜像ID', minWidth: 120 },
                      { key: 'size', title: '占用空间', minWidth: 110 },
                      { key: 'createTime', title: '创建时间', minWidth: 170 },
                      { key: 'actions', title: '操作', minWidth: 300 },
                    ].map((col) => (
                      <th
                        key={col.key}
                        className="group relative px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap"
                        style={{ width: `${imageTableWidths[col.key]}px`, minWidth: `${col.minWidth}px` }}
                      >
                        {col.title}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700 bg-white dark:bg-gray-800">
                  {filteredImages.map((image) => (
                    <tr key={image.id} onClick={() => toggleImageSelection(image.id)} className={cn(
                      "hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer",
                      selectedImages.includes(image.id) && "bg-primary-50 dark:bg-primary-900/20",
                      isImageUpdateIgnored(image) && "opacity-55 grayscale"
                    )}>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <label className="inline-flex items-center justify-center w-8 h-8 cursor-pointer">
                          <input type="checkbox" checked={selectedImages.includes(image.id)} onChange={() => toggleImageSelection(image.id)} className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500" />
                        </label>
                      </td>
                      <td className="px-4 py-3 min-w-[260px]" style={{ width: `${imageTableWidths.name}px`, minWidth: '220px' }}>
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
                            <SafeImage
                              src={getImageLogo(buildPullTarget(image) || image.name, customIcons)}
                              alt={image.name}
                              className="h-9 w-9 object-cover"
                              fallback={<HardDrive className="h-4 w-4 text-gray-500 dark:text-gray-400" />}
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1 min-w-0">
                              <button
                                onClick={(e) => { e.stopPropagation(); openImageEditModal(image) }}
                                className="font-semibold text-gray-900 dark:text-white truncate max-w-[320px] hover:text-sky-600 dark:hover:text-sky-400 text-left"
                                title={image.inUsed ? '该镜像正被容器引用(包括已停止容器),不能直接修改,请先处理相关容器' : '修改镜像名和 Tag'}
                              >{image.name}</button>
                              <ImageRiskHint image={image} />
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-1">
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap text-left" title={image.tag} style={{ width: `${imageTableWidths.tag}px`, minWidth: '110px' }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); openImageEditModal(image) }}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700"
                          title={image.inUsed ? '该镜像正被容器引用(包括已停止容器),不能直接修改,请先处理相关容器' : '修改镜像名和 Tag'}
                        >
                          <span>{image.tag}</span>
                          <Pencil className="h-3.5 w-3.5 text-gray-400" />
                        </button>
                      </td>
                      <td className="pl-2 pr-0 py-3 whitespace-nowrap" style={{ width: `${imageTableWidths.statusIcon}px`, minWidth: '24px' }}>
                        <div className="flex items-center justify-end" title={image.usageState === 'running' ? '使用中' : image.usageState === 'stopped' ? '已使用（相关容器已停止）' : '未使用'}>
                          <span className={cn(
                            'h-2.5 w-2.5 rounded-full flex-shrink-0',
                            image.usageState === 'running'
                              ? 'bg-green-500'
                              : image.usageState === 'stopped'
                                ? 'bg-amber-500'
                                : 'bg-gray-400'
                          )} />
                        </div>
                      </td>
                      <td className="pl-1 pr-4 py-3 text-sm text-gray-600 dark:text-gray-300 font-mono whitespace-nowrap text-left" title={image.id} style={{ width: `${imageTableWidths.imageId}px`, minWidth: '120px' }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); openImageRefLink(image) }}
                          className="inline-flex items-center gap-1 text-sky-600 dark:text-sky-400 hover:underline"
                          title={canonicalRepoLink(image) || image.name}
                        >
                          <span>{shortImageId(image.id)}</span>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                      </td>
                      <td className={cn('px-4 py-3 text-sm font-semibold whitespace-nowrap text-left', getSizeColor(image.size))} style={{ width: `${imageTableWidths.size}px`, minWidth: '110px' }}>{formatImageSize(image.size)}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap" style={{ width: `${imageTableWidths.createTime}px`, minWidth: '170px' }}>{formatTableDateTime(image.createTime)}</td>
                      {(() => {
                        const actionState = getImageUpdateActionState(image)
                        const showTableProgress = ['update', 'delete', 'force-delete', 'ignore'].includes(actionState?.action) && (actionState?.loading || actionState?.done)
                        return (
                          <td className={cn("px-4 whitespace-nowrap", showTableProgress ? "py-0" : "py-3")} style={{ width: `${imageTableWidths.actions}px`, minWidth: '260px' }}>
                            <div className="flex items-stretch justify-start gap-1.5 min-w-0 h-full">
                              {renderImageUpdateButtons(image, { compact: true })}
                            </div>
                          </td>
                        )
                      })()}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-4">
            {filteredImages
              .map((image) => (
                <div
                  key={image.id}
                  className={cn(
                    "group card p-3 sm:p-4 rounded-2xl hover:shadow-lg transition-all relative",
                    isBatchMode && "cursor-pointer select-none",
                    selectedImages.includes(image.id) && "ring-2 ring-primary-500 bg-primary-50 dark:bg-primary-900/20",
                    isImageUpdateIgnored(image) && "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 hover:border-gray-300 dark:hover:border-gray-600"
                  )}
                  onClick={() => {
                    if (isBatchMode) toggleImageSelection(image.id)
                  }}
                >
                  {(() => {
                    const actionState = getImageUpdateActionState(image)
                    const showCardProgress = actionState?.action === 'update' && (actionState?.loading || actionState?.done)
                    return showCardProgress ? (
                      <div className="absolute inset-0 pointer-events-none rounded-2xl overflow-hidden">
                        <div
                          className={cn(
                            "absolute top-0 left-0 bottom-0 transition-all duration-500 ease-out",
                            actionState?.done
                              ? "bg-gradient-to-r from-green-500/25 via-green-400/25 to-green-500/25"
                              : "bg-gradient-to-r from-primary-500/30 via-primary-400/30 to-primary-500/30"
                          )}
                          style={{ width: `${actionState?.done ? 100 : (actionState?.percentage || 0)}%` }}
                        >
                          <div
                            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer"
                            style={{
                              backgroundSize: '200% 100%',
                              animation: 'shimmer 2s infinite linear'
                            }}
                          />
                        </div>
                      </div>
                    ) : null
                  })()}

                  {isBatchMode && (
                    <div className="absolute top-2 right-2 z-[70]">
                      <input
                        type="checkbox"
                        checked={selectedImages.includes(image.id)}
                        onChange={() => toggleImageSelection(image.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-4 w-4 rounded border-gray-300 bg-white/95 shadow-sm dark:border-gray-600 dark:bg-gray-900/90 text-primary-600 focus:ring-primary-500"
                      />
                    </div>
                  )}
                  {/* 头部:图标、名字、状态指示器和大小 */}
                  <div className="flex items-start gap-2.5 sm:gap-3 mb-2">
                    <div className="h-9 w-9 sm:h-10 sm:w-10 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
                      <SafeImage
                        src={getImageLogo(buildPullTarget(image) || image.name, customIcons)}
                        alt={image.name}
                        className="h-9 w-9 sm:h-10 sm:w-10 object-cover"
                        fallback={<HardDrive className="h-4 w-4 sm:h-5 sm:w-5 text-gray-500 dark:text-gray-400" />}
                      />
                    </div>

                    {/* 竖线状态指示器 */}
                    <div className="flex flex-col items-center justify-center h-9 sm:h-10">
                      {image.usageState === 'running' && (
                        <div className="w-1 h-5 sm:h-6 bg-gradient-to-b from-green-500 to-green-600 rounded-full flex-shrink-0" />
                      )}
                      {image.usageState === 'stopped' && (
                        <div className="w-1 h-5 sm:h-6 bg-gradient-to-b from-amber-400 to-amber-500 rounded-full flex-shrink-0" />
                      )}
                      {(!image.usageState || image.usageState === 'unused') && (
                        <div className="w-1 h-5 sm:h-6 bg-gray-300 dark:bg-gray-600 rounded-full flex-shrink-0" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-gray-900 dark:text-white truncate text-[13px] sm:text-sm flex items-center gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); openImageEditModal(image) }}
                          className="truncate text-left hover:underline"
                          title={image.inUsed ? '该镜像正被容器引用(包括已停止容器),不能直接修改,请先处理相关容器' : '修改镜像名和 Tag'}
                        >
                          {image.name}
                        </button>
                        <ImageRiskHint image={image} />
                      </h4>
                      <p className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); openImageEditModal(image) }}
                          className="truncate inline-flex items-center gap-1 hover:text-primary-600 dark:hover:text-primary-400 text-sm sm:text-base"
                          title={image.inUsed ? '该镜像正被容器引用(包括已停止容器),不能直接修改,请先处理相关容器' : '修改镜像名和 Tag'}
                        >
                          <span className="truncate">{image.tag}</span>
                          <Pencil className="h-3 w-3 flex-shrink-0" />
                        </button>
                      </p>
                    </div>

                    <div className="absolute top-0 right-0 z-10">
                      <button
                        onClick={(e) => { e.stopPropagation(); openAcceleratorModal(buildPullTarget(image) || image.name) }}
                        className="inline-flex items-center justify-center p-0.5 text-amber-500 hover:text-amber-600 dark:hover:text-amber-300 transition-colors active:scale-95"
                        title={`为 ${image.name}:${image.tag} 打开加速拉取`}
                      >
                        <Zap className="h-3.5 w-3.5 fill-current stroke-[2.2]" />
                      </button>
                    </div>
                  </div>

                  {image.haveUpdate && (
                    <div className="absolute -top-[2px] -right-[2px] w-[80px] h-[80px] pointer-events-none overflow-hidden z-40 rounded-tr-2xl">
                      <div className="absolute top-0 right-0 w-full h-full flex items-center justify-center">
                        <div className="absolute transform rotate-45 translate-x-[26px] -translate-y-[26px] w-[120px] h-[24px] bg-gradient-to-r from-yellow-400 to-yellow-500 dark:from-yellow-500 dark:to-yellow-600 shadow-sm flex items-center justify-center">
                          <span className="relative text-[10px] font-bold text-white tracking-widest uppercase w-full text-center">
                            NEW
                            <div className="absolute top-0 left-0 animate-flow-light"></div>
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {isImageUpdateIgnored(image) && (
                    <div className="absolute -top-[2px] -right-[2px] w-[86px] h-[86px] pointer-events-none overflow-hidden z-50 rounded-tr-2xl">
                      <div className="absolute top-0 right-0 w-full h-full flex items-center justify-center">
                        <div className="absolute transform rotate-45 translate-x-[28px] -translate-y-[28px] w-[128px] h-[24px] bg-gradient-to-r from-gray-400 to-gray-500 dark:from-gray-600 dark:to-gray-700 shadow-sm flex items-center justify-center">
                          <span className="relative text-[10px] font-bold text-white tracking-widest w-full text-center">忽略</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 镜像信息 */}
                  {!isBatchMode && (
                    <div className="space-y-1.5 text-[11px] sm:text-xs mb-2 ml-[58px] sm:ml-[68px] mr-5 sm:mr-6">
                      <div className={cn('mt-1 text-xs font-mono truncate', getSizeColor(image.size))}>
                        占用:{formatImageSize(image.size).replace(/\s+/g, '')}
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); openImageRefLink(image) }}
                        className="mt-1 font-mono text-gray-500 dark:text-gray-400 truncate text-xs hover:text-sky-600 dark:hover:text-sky-400 hover:underline inline-flex items-center gap-1 text-left min-w-0"
                        title={canonicalRepoLink(image) || image.name}
                      >
                        <span>ID:</span>
                        <span className="truncate">{shortImageId(image.id)}</span>
                        <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
                      </button>
                    </div>
                  )}

                  {(() => {
                    const actionState = getImageUpdateActionState(image)
                    const showCardProgress = actionState?.action === 'update' && (actionState?.loading || actionState?.done)
                    return !isBatchMode ? (
                      <div className="grid grid-cols-2 gap-1 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700/50 sm:flex">
                        {showCardProgress ? (
                          <div className={cn(
                            "flex-1 flex items-center justify-center space-x-2 px-1 py-1.5 rounded-lg border whitespace-nowrap",
                            actionState?.done ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800" : "bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800"
                          )}>
                            {actionState?.done ? <span className="h-4 w-4 text-green-600 dark:text-green-400 text-center leading-4">✓</span> : <RefreshCw className="h-4 w-4 animate-spin text-primary-600 dark:text-primary-400" />}
                            <span className={cn(
                              "text-xs font-medium",
                              actionState?.done ? "text-green-600 dark:text-green-400" : "text-primary-600 dark:text-primary-400"
                            )}>
                              {actionState?.done ? (actionState?.progress || '更新完成') : `更新中${actionState?.percentage ? ` ${Math.round(actionState.percentage)}%` : ''}`}
                            </span>
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={(e) => { e.stopPropagation(); startImageUpdate(image) }}
                              disabled={!image.haveUpdate || isImageUpdateIgnored(image)}
                              className={cn(
                                "flex-1 flex items-center justify-center gap-1 px-1 py-1.5 border rounded-lg transition-all duration-200 shadow-sm text-xs font-medium whitespace-nowrap",
                                isImageUpdateIgnored(image)
                                  ? "text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 cursor-not-allowed opacity-70"
                                  : image.haveUpdate
                                    ? "text-yellow-600 dark:text-yellow-400 bg-white dark:bg-gray-800 border-yellow-400 dark:border-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 hover:shadow active:scale-95"
                                    : "text-purple-600 dark:text-purple-400 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:border-purple-200 dark:hover:border-purple-800 hover:shadow active:scale-95"
                              )}
                              title={isImageUpdateIgnored(image) ? '这个镜像已在更新黑名单中' : image.haveUpdate ? '直接按系统默认源更新' : '当前没有检测到可用更新'}
                            >
                              <RefreshCw className="h-4 w-4" />
                              <span className="hidden sm:inline">更新</span>
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setDeleteModal({ isOpen: true, image, force: false }) }}
                              className="flex-1 flex items-center justify-center gap-1 px-1 py-1.5 text-red-600 dark:text-red-400 bg-white dark:bg-gray-800 hover:bg-red-50 dark:hover:bg-red-900/20 border border-gray-200 dark:border-gray-700 hover:border-red-200 dark:hover:border-red-800 rounded-lg transition-all duration-200 shadow-sm hover:shadow active:scale-95 text-xs font-medium whitespace-nowrap"
                            >
                              <Trash2 className="h-4 w-4" />
                              <span className="hidden sm:inline">删除</span>
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setDeleteModal({ isOpen: true, image, force: true }) }}
                              className="flex-1 flex items-center justify-center gap-1 px-1 py-1.5 text-orange-600 dark:text-orange-400 bg-white dark:bg-gray-800 hover:bg-orange-50 dark:hover:bg-orange-900/20 border border-gray-200 dark:border-gray-700 hover:border-orange-200 dark:hover:border-orange-800 rounded-lg transition-all duration-200 shadow-sm hover:shadow active:scale-95 text-xs font-medium whitespace-nowrap"
                              title="强制删除镜像"
                            >
                              <Trash2 className="h-4 w-4" />
                              <span className="hidden sm:inline">强删</span>
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); (isImageUpdateIgnored(image) ? unignoreImageUpdate(image) : ignoreImageUpdate(image)) }}
                              className={cn(
                                "flex-1 flex items-center justify-center gap-1 px-1 py-1.5 border rounded-lg transition-all duration-200 shadow-sm text-xs font-medium whitespace-nowrap",
                                isImageUpdateIgnored(image)
                                  ? "text-amber-700 dark:text-amber-300 bg-white dark:bg-gray-800 border-amber-400 dark:border-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:shadow active:scale-95"
                                  : "text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 hover:shadow active:scale-95"
                              )}
                            >
                              <Ban className="h-4 w-4" />
                              <span className="hidden sm:inline">{isImageUpdateIgnored(image) ? '取消' : '忽略'}</span>
                            </button>
                          </>
                        )}
                      </div>
                    ) : null
                  })()}
                </div>
              ))}
          </div>
        )}
      </div>

      {/* 批量删除确认弹窗 */}
      {pruneModal.isOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-2xl w-full max-h-96 flex flex-col overflow-hidden transform transition-all duration-300 scale-100">
            {/* 顶部装饰条 */}
            <div className="h-1 bg-gradient-to-r from-orange-400 via-red-500 to-orange-600"></div>

            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-start gap-4">
                <div className="relative h-12 w-12 bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-900/30 dark:to-red-900/30 rounded-full flex items-center justify-center flex-shrink-0 border border-orange-200 dark:border-orange-700 flex-shrink-0">
                  <AlertCircle className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                    {pruneModal.type === 'dangling' ? '删除无Tag镜像' : pruneModal.type === 'unused' ? '删除未使用的镜像' : '删除所选镜像'}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                    将永久删除 <span className="font-semibold text-orange-600 dark:text-orange-400">{pruneModal.images.length} 个</span> 镜像,此操作不可恢复
                  </p>
                </div>
              </div>
            </div>

            {/* 镜像列表 */}
            <div className="flex-1 overflow-y-auto px-6 py-4 bg-gray-50/50 dark:bg-gray-700/20">
              <div className="space-y-2">
                {pruneModal.images.map((img) => (
                  <div key={img.id} className="flex items-center gap-3 p-3 bg-white dark:bg-gray-700 rounded-xl hover:shadow-md transition-all duration-200">
                    <div className="h-8 w-8 bg-gray-200 dark:bg-gray-600 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
                      <SafeImage
                        src={getImageLogo(buildPullTarget(img) || img.name, customIcons)}
                        alt={img.name}
                        className="h-8 w-8 object-cover"
                        fallback={<HardDrive className="h-4 w-4 text-gray-500 dark:text-gray-400" />}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {img.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {img.tag}
                      </p>
                    </div>
                    <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 flex-shrink-0 bg-gray-100 dark:bg-gray-600 px-2 py-1 rounded-lg">
                      {formatImageSize(img.size)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 底部按钮 */}
            <div className="p-6 border-t border-gray-200 dark:border-gray-700 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700/50 flex gap-3">
              <button
                onClick={() => setPruneModal({ isOpen: false, type: null, images: [] })}
                className="flex-1 px-4 py-2.5 text-sm font-semibold bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-600 transition-all duration-300 transform hover:shadow-md active:scale-95 border border-gray-200 dark:border-gray-600"
              >
                取消
              </button>
              <button
                onClick={() => {
                  handlePrune(pruneModal.type)
                  setPruneModal({ isOpen: false, type: null, images: [] })
                }}
                disabled={isLoading}
                className="flex-1 px-4 py-2.5 text-sm font-semibold bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 text-white rounded-xl transition-all duration-300 transform hover:shadow-lg hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    删除中...
                  </span>
                ) : (
                  '确认删除'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {acceleratorModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm p-2 sm:p-4 animate-fadeIn">
          <div className="mx-auto flex h-full w-full max-w-3xl items-center justify-center">
            <div className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-gray-800">
              <div className="h-1 bg-gradient-to-r from-sky-400 via-blue-500 to-cyan-500"></div>
              <div className="flex items-center justify-between gap-3 border-b border-gray-200 p-4 dark:border-gray-700 sm:p-6">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-sky-100 dark:bg-sky-900/40 sm:h-11 sm:w-11">
                    <Zap className="h-5 w-5 fill-current stroke-[2.2] text-sky-600 dark:text-sky-300 sm:h-6 sm:w-6" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-bold text-gray-900 dark:text-white sm:text-lg">加速拉取镜像</h3>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">410 宽度下按移动端卡片布局自适应显示</p>
                  </div>
                </div>
                <button
                  onClick={() => setAcceleratorModal({ isOpen: false, imageName: '', taskId: '', logs: '', selectedSource: '' })}
                  className="rounded-xl p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4 overflow-y-auto p-4 sm:space-y-5 sm:p-6">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-800/40">
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">镜像名称</label>
                  <input
                    value={acceleratorModal.imageName}
                    onChange={(e) => setAcceleratorModal(prev => ({ ...prev, imageName: e.target.value }))}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500"
                    placeholder="例如 library/nginx:latest"
                  />

                  <div className="mt-3 flex items-center justify-between gap-2">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">拉取源</label>
                    <button
                      type="button"
                      onClick={testAcceleratorLatency}
                      className="inline-flex items-center gap-1 text-xs text-slate-500 transition-colors hover:text-sky-600 dark:text-slate-400 dark:hover:text-sky-300"
                    >
                      <Gauge className={cn("h-3.5 w-3.5", testingAccelerators && "animate-pulse text-sky-500")} />
                      {testingAccelerators ? '测速中...' : '重新测速'}
                    </button>
                  </div>
                  <select
                    value={acceleratorModal.selectedSource}
                    onChange={(e) => selectAcceleratorSource(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                  >
                    {acceleratorOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label} · {formatLatency(opt.value)}</option>)}
                  </select>

                  <div className="mt-2 rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                    当前默认源：{acceleratorOptions.find(opt => opt.value === acceleratorModal.selectedSource)?.label || '未选择'}
                  </div>

                  <button
                    onClick={startAcceleratedPull}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-500 px-4 py-3 text-sm font-semibold text-white transition-colors hover:from-sky-600 hover:to-blue-600"
                  >
                    <Zap className="h-4 w-4 fill-current stroke-[2.2]" />
                    开始加速拉取
                  </button>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-800/40">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">镜像加速源</h3>
                      <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">添加自定义源后，可在上方拉取源下拉中直接选择，并保存为默认拉取源。</p>
                    </div>
                    <span className="flex-shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500 shadow-sm dark:bg-slate-900 dark:text-slate-300">
                      {acceleratorOptions.length} 个
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
                    <input
                      value={newAccelerator}
                      onChange={(e) => setNewAccelerator(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') addAccelerator() }}
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500"
                      placeholder="输入加速源,回车保存"
                    />
                    <button
                      onClick={addAccelerator}
                      className="inline-flex items-center justify-center gap-1 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-sky-700"
                    >
                      <Plus className="h-4 w-4" />
                      添加并设为可选
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {acceleratorOptions.map(opt => (
                      <div
                        key={opt.value}
                        className={cn(
                          "flex max-w-full items-center gap-2 rounded-xl border px-3 py-2 text-xs",
                          acceleratorModal.selectedSource === opt.value
                            ? "border-sky-300 bg-sky-100 text-sky-700 dark:border-sky-700 dark:bg-sky-900/30 dark:text-sky-300"
                            : "border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-300"
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => selectAcceleratorSource(opt.value)}
                          className="inline-flex min-w-0 items-center gap-1 text-left"
                        >
                          <span className="truncate">{opt.label}</span>
                          <span className={cn("font-mono", latencyClassName(opt.value))}>{formatLatency(opt.value)}</span>
                        </button>
                        {!opt.value.startsWith('__') && (
                          <button
                            type="button"
                            onClick={() => setConfirmRemoveAccelerator({ isOpen: true, source: opt.value })}
                            className="rounded p-0.5 text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
                            title="删除这个加速源"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-800/40">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                      <Logs className="h-4 w-4" />
                      日志输出
                    </label>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      {acceleratorModal.taskId ? '任务进行中' : '等待开始'}
                    </span>
                  </div>
                  <pre className="h-48 overflow-auto rounded-2xl bg-gray-950 p-4 text-xs text-green-300 whitespace-pre-wrap sm:h-56">{acceleratorModal.logs || '等待开始拉取...'}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmRemoveAccelerator.isOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="w-full max-w-md rounded-3xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">删除加速源</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">确认后会从配置里移除这个镜像加速源。</p>
              </div>
              <button onClick={() => setConfirmRemoveAccelerator({ isOpen: false, source: '' })} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 text-sm text-amber-800 dark:text-amber-200">
              确定删除加速源 <span className="font-mono font-semibold break-all">{confirmRemoveAccelerator.source}</span> 吗?删错了可以稍后再手动添加回来。
            </div>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setConfirmRemoveAccelerator({ isOpen: false, source: '' })} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">取消</button>
              <button onClick={() => removeAccelerator(confirmRemoveAccelerator.source)} className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl bg-gradient-to-r from-red-500 to-orange-500 text-white hover:from-red-600 hover:to-orange-600 shadow-lg">确认删除</button>
            </div>
          </div>
        </div>
      )}

      {editImageModal.isOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-sky-400 via-blue-500 to-cyan-500"></div>
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">修改镜像名 / Tag</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">仅允许修改未使用的镜像;如果镜像正在被容器使用,请先关闭相关容器。</p>
              </div>
              <button onClick={() => setEditImageModal({ isOpen: false, image: null, name: '', tag: '', saving: false })} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">镜像名</label>
                <input value={editImageModal.name} onChange={(e) => setEditImageModal(prev => ({ ...prev, name: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm" placeholder="例如 nginx / ghcr.io/owner/repo" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tag</label>
                <input value={editImageModal.tag} onChange={(e) => setEditImageModal(prev => ({ ...prev, tag: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm" placeholder="例如 latest / 1.27 / dev" />
              </div>
              <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-4 text-xs space-y-1 text-gray-600 dark:text-gray-300">
                <div>当前镜像:<span className="font-mono">{editImageModal.image?.name}:{editImageModal.image?.tag}</span></div>
                <div>
                  来源链接:
                  {canonicalRepoLink(editImageModal.image) ? (
                    <button
                      onClick={() => openImageRefLink(editImageModal.image)}
                      className="ml-1 font-mono break-all text-sky-600 dark:text-sky-400 hover:underline text-left inline-flex items-center gap-1"
                      title={canonicalRepoLink(editImageModal.image)}
                    >
                      <span>{canonicalRepoLink(editImageModal.image)}</span>
                      <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
                    </button>
                  ) : (
                    <span className="ml-1 font-mono break-all">无</span>
                  )}
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex gap-3">
              <button onClick={() => setEditImageModal({ isOpen: false, image: null, name: '', tag: '', saving: false })} className="flex-1 px-4 py-2.5 text-sm font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600">取消</button>
              <button onClick={saveImageRetag} disabled={editImageModal.saving} className="flex-1 px-4 py-2.5 text-sm font-semibold bg-gradient-to-r from-sky-500 to-blue-500 hover:from-sky-600 hover:to-blue-600 text-white rounded-xl transition-all disabled:opacity-50 shadow-lg">
                {editImageModal.saving ? '保存中...' : '保存修改'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 批量强制删除确认弹窗 */}
      {confirmBatchDeleteModal.isOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-xl w-full overflow-hidden transform transition-all duration-300 scale-100">
            <div className="h-1 bg-gradient-to-r from-orange-400 via-red-500 to-orange-600"></div>
            <div className="p-6">
              <div className="flex items-start gap-4 mb-5">
                <div className="relative h-12 w-12 bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-900/30 dark:to-red-900/30 rounded-full flex items-center justify-center flex-shrink-0 border border-orange-200 dark:border-orange-700">
                  <AlertCircle className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">批量强制删除镜像</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">此操作不可恢复,请再次确认</p>
                </div>
              </div>
              <div className="text-sm leading-relaxed text-gray-600 dark:text-gray-300 mb-6">
                确定要强制删除 <span className="font-semibold text-orange-600 dark:text-orange-300">{confirmBatchDeleteModal.images.length}</span> 个镜像吗?
                <span className="block mt-2 text-orange-600 dark:text-orange-300">强制删除会跳过常规保护,适合处理多标签/多仓库引用或普通删除冲突的镜像。</span>
              </div>
              <div className="max-h-40 overflow-auto rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-3 text-xs text-gray-600 dark:text-gray-300 mb-6">
                <div className="space-y-1.5">
                  {confirmBatchDeleteModal.images.slice(0, 12).map(img => (
                    <div key={img.id} className="flex items-center justify-between gap-3">
                      <span className="truncate">{img.name}:{img.tag}</span>
                      <span className="font-mono text-[11px] text-gray-400">{String(img.id || '').slice(0, 12)}</span>
                    </div>
                  ))}
                  {confirmBatchDeleteModal.images.length > 12 && (
                    <div className="text-gray-400">... 还有 {confirmBatchDeleteModal.images.length - 12} 个镜像</div>
                  )}
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmBatchDeleteModal({ isOpen: false, images: [], force: false })}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-all border border-gray-200 dark:border-gray-600"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    const imgs = confirmBatchDeleteModal.images
                    const force = confirmBatchDeleteModal.force
                    setConfirmBatchDeleteModal({ isOpen: false, images: [], force: false })
                    handleBatchDelete(imgs, force)
                  }}
                  disabled={isLoading}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white rounded-xl transition-all disabled:opacity-50 shadow-lg"
                >
                  确认强制删除
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {deleteModal.isOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-md w-full overflow-hidden transform transition-all duration-300 scale-100">
            {/* 顶部装饰条 */}
            {/*<div className="h-1 bg-gradient-to-r from-red-400 via-rose-500 to-red-600"></div>*/}

            <div className="p-8 flex flex-col">
              {/* 图标和标题 */}
              <div className="flex items-start gap-4 mb-6">
                <div className="relative h-12 w-12 bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-900/30 dark:to-rose-900/30 rounded-full flex items-center justify-center flex-shrink-0 border border-red-200 dark:border-red-700">
                  <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                    {deleteModal.force ? '强制删除镜像' : '删除镜像'}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">此操作不可恢复</p>
                </div>
              </div>

              {/* 分隔线 */}
              <div className="w-full h-px bg-gradient-to-r from-transparent via-red-200 dark:via-red-800 to-transparent mb-6"></div>

              {/* 消息内容 */}
              <div className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed mb-8">
                {deleteModal.force ? (
                  <>
                    确定要强制删除镜像{' '}
                    <span className="font-semibold text-red-600 dark:text-red-400">"{deleteModal.image?.name}"</span>
                    {' '}吗?这会跳过常规保护,适合处理"多标签/多仓库引用"或普通删除冲突的镜像。
                  </>
                ) : (
                  <>
                    确定要删除镜像{' '}
                    <span className="font-semibold text-red-600 dark:text-red-400">"{deleteModal.image?.name}"</span>
                    {' '}吗?
                    {!deleteModal.image?.inUsed && deleteModal.image?.multiRef && (
                      <span className="block mt-2 text-orange-600 dark:text-orange-300">这个镜像存在多引用,普通删除很可能失败,建议直接使用"强制删除"。</span>
                    )}
                  </>
                )}
              </div>

              {/* 按钮组 */}
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteModal({ isOpen: false, image: null })}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-all duration-300 transform hover:shadow-md active:scale-95 border border-gray-200 dark:border-gray-600"
                >
                  取消
                </button>
                <button
                  onClick={() => deleteModal.image && handleDeleteImage(deleteModal.image.id, deleteModal.force)}
                  disabled={isLoading}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600 text-white rounded-xl transition-all duration-300 transform hover:shadow-lg hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      删除中
                    </span>
                  ) : (
                    '确认删除'
                  )}
                </button>
              </div>
            </div>

            {/* 底部装饰 */}
            <div className="h-0.5 bg-gradient-to-r from-transparent via-red-200 dark:via-red-800 to-transparent"></div>
          </div>
        </div>
      )}
    </div>
  )
}
