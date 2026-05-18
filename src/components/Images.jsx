import React, { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { HardDrive, Trash2, RefreshCw, Link, X, AlertCircle, CheckCircle, LayoutGrid, Search, CheckSquare, LayoutList, Zap, Logs, Plus } from 'lucide-react'
import { imageAPI, botAPI, progressAPI } from '../api/client.js'
import { cn } from '../utils/cn.js'
import { getImageLogo } from '../config/imageLogos.js'

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
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('docker_copilot_images_view_mode') || 'card')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [selectedImages, setSelectedImages] = useState([])
  const [isBatchMode, setIsBatchMode] = useState(false)
  const [acceleratorModal, setAcceleratorModal] = useState({ isOpen: false, imageName: '', taskId: '', logs: '', selectedSource: '' })
  const [accelerators, setAccelerators] = useState([])
  const [newAccelerator, setNewAccelerator] = useState('')
  const [defaultAccelerator, setDefaultAccelerator] = useState('')

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

  const fetchImages = async () => {
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
      const errorMsg = error.response?.data?.msg || error.message || '网络错误，请检查后端服务'
      setError(errorMsg)
      setImages([])
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
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

  const handleDeleteImage = async (imageId, force = false) => {
    try {
      setIsLoading(true)
      setDeleteModal({ isOpen: false, image: null })

      await imageAPI.deleteImage(imageId, force)

      setSuccessModal({ isOpen: true, message: '镜像删除成功' })
      fetchImages()
      setTimeout(() => setSuccessModal({ isOpen: false, message: '' }), 3000)
    } catch (error) {
      const errorMsg = error.response?.data?.msg || error.message || '删除镜像失败'
      setError(errorMsg)
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
    setIsBatchMode(!allSelected && ids.length > 0)
  }

  const openBatchDelete = () => {
    const selected = images.filter(img => selectedImages.includes(img.id))
    setPruneModal({ isOpen: true, type: 'selected', images: selected })
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
      setSuccessModal({ isOpen: true, message: `成功删除 ${imagesToDelete.length} 个镜像` })
      setSelectedImages([])
      setIsBatchMode(false)
      fetchImages()
      setTimeout(() => setSuccessModal({ isOpen: false, message: '' }), 3000)
    } catch (error) {
      const errorMsg = error.response?.data?.msg || error.message || '批量删除镜像失败'
      setError(errorMsg)
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

  const formatImageSize = (sizeStr) => {
    if (!sizeStr) return '0 MB'
    return sizeStr.replace(/mb/gi, 'MB')
      .replace(/gb/gi, 'GB')
      .replace(/kb/gi, 'KB')
  }

  const getSizeColor = (size) => {
    const sizeInMB = parseInt(size)
    if (sizeInMB < 100) return 'text-green-600 dark:text-green-400'
    if (sizeInMB < 300) return 'text-yellow-600 dark:text-yellow-400'
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

  const openAcceleratorModal = (imageName = '') => {
    setAcceleratorModal({ isOpen: true, imageName, taskId: '', logs: '', selectedSource: defaultAccelerator || accelerators[0] || '' })
  }

  const startAcceleratedPull = async () => {
    const imageName = acceleratorModal.imageName.trim()
    if (!imageName) {
      setError('镜像名不能为空')
      return
    }
    const source = acceleratorModal.selectedSource || defaultAccelerator || accelerators[0] || ''
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

  const filteredImages = images.filter((image) => {
    const keyword = searchKeyword.trim().toLowerCase()
    const matchesKeyword = !keyword || [image.name, image.tag, image.id, image.size, image.createTime, image.inUsed ? '使用中' : '未使用'].some(value => String(value || '').toLowerCase().includes(keyword))
    if (!matchesKeyword) return false
    if (!filterStatus) return true
    if (filterStatus === 'used') return image.inUsed
    if (filterStatus === 'unused') return !image.inUsed
    if (filterStatus === 'dangling') return image.tag === 'None' || image.tag === '<none>'
    return true
  })

  const shortImageId = (id) => (id || '').replace(/^sha256:/, '').slice(0, 12)
  const dockerHubUrl = (name) => name && name !== 'None' ? `https://hub.docker.com/r/${name}` : '#'

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
          <div className="flex flex-wrap items-center justify-end gap-2 sm:max-w-[78%]">
            {(viewMode === 'card' || isBatchMode || selectedImages.length > 0) && (
              <button
                onClick={() => {
                  setIsBatchMode(!isBatchMode)
                  if (isBatchMode) setSelectedImages([])
                }}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm font-medium"
              >
                <CheckSquare className="h-4 w-4" />
                <span>{isBatchMode ? '退出批量' : '批量操作'}</span>
              </button>
            )}
            <button
              onClick={toggleSelectAllImages}
              disabled={isLoading || filteredImages.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/60 transition-colors disabled:opacity-50 text-sm font-medium"
            >
              <span>{filteredImages.length > 0 && filteredImages.every(img => selectedImages.includes(img.id)) ? '取消全选' : '全选'}</span>
            </button>
            <button
              onClick={openBatchDelete}
              disabled={isLoading || selectedImages.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/60 transition-colors disabled:opacity-50 text-sm font-medium"
            >
              <Trash2 className="h-4 w-4" />
              <span>删除{selectedImages.length > 0 ? `(${selectedImages.length})` : ''}</span>
            </button>
            <div className="flex items-center rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-1">
              <button
                onClick={() => setViewMode('card')}
                className={cn('p-2 rounded-lg transition-colors', viewMode === 'card' ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700')}
                title="卡片视图"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={cn('p-2 rounded-lg transition-colors', viewMode === 'table' ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700')}
                title="表格视图"
              >
                <LayoutList className="h-4 w-4" />
              </button>
            </div>
            <button
              onClick={() => { setIsRefreshing(true); fetchImages() }}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 text-sm font-medium"
            >
              <RefreshCw className="h-4 w-4" />
              <span>刷新</span>
            </button>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="搜索镜像/Tag/ID"
                className="w-48 sm:w-60 pl-9 pr-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
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
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-0 rounded-3xl overflow-hidden shadow-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 min-h-[116px]">
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
              <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">总镜像</div>
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
              <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">使用中</div>
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
              <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">未使用</div>
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
              <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">无Tag</div>
            </div>
          </button>

          {/* 加速源配置 */}
          <button
            onClick={() => setAcceleratorModal({ isOpen: true, imageName: '', taskId: '', logs: '', selectedSource: defaultAccelerator || accelerators[0] || '' })}
            className="p-4 sm:p-6 text-center transition-all duration-300 relative overflow-hidden group flex flex-col items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-700/50"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-sky-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative flex flex-col items-center">
              <Zap className="h-7 w-7 text-sky-600 dark:text-sky-400 mb-2 transition-transform duration-300 group-hover:scale-110" />
              <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">加速源配置</div>
            </div>
          </button>
        </div>
      </div>

      {/* 筛选/批量提示 */}
      {(filterStatus || selectedImages.length > 0) && (
        <div className="px-4 sm:px-6 pt-2 pb-0">
          <div className="mb-0 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="flex flex-wrap items-center gap-2 justify-between">
              <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-blue-700 dark:text-blue-300">
                筛选中：
                {filterStatus === 'used' && '使用中的镜像'}
                {filterStatus === 'unused' && '未使用的镜像'}
                {filterStatus === 'dangling' && '无Tag的镜像'}
                {selectedImages.length > 0 && ` · 已选中 ${selectedImages.length} 个镜像`}
              </span>
              {filterStatus && <button
                onClick={() => setFilterStatus(null)}
                className="px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-100 bg-blue-100 dark:bg-blue-800/50 rounded transition-colors"
              >
                清除筛选
              </button>}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={toggleSelectAllImages} className="px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-100 bg-blue-100 dark:bg-blue-800/50 rounded transition-colors">全选结果</button>
                <button onClick={openBatchDelete} disabled={selectedImages.length === 0} className="px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-300 hover:text-red-800 dark:hover:text-red-100 bg-red-100 dark:bg-red-800/50 rounded transition-colors disabled:opacity-50">删除所选</button>
                {selectedImages.length > 0 && <button onClick={() => setSelectedImages([])} className="px-2 py-0.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100 bg-gray-100 dark:bg-gray-700 rounded transition-colors">取消选择</button>}
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
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
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
                    {['镜像名称', '状态', 'Tag', '大小', '创建时间', '镜像ID', '加速', '操作'].map((title) => (
                      <th key={title} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">{title}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700 bg-white dark:bg-gray-800">
                  {filteredImages.map((image) => (
                    <tr key={image.id} onClick={() => toggleImageSelection(image.id)} className={cn("hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer", selectedImages.includes(image.id) && "bg-primary-50 dark:bg-primary-900/20")}>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <label className="inline-flex items-center justify-center w-8 h-8 cursor-pointer">
                          <input type="checkbox" checked={selectedImages.includes(image.id)} onChange={() => toggleImageSelection(image.id)} className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500" />
                        </label>
                      </td>
                      <td className="px-4 py-3 min-w-[260px]">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
                            <SafeImage
                              src={getImageLogo(image.name, customIcons)}
                              alt={image.name}
                              className="h-9 w-9 object-cover"
                              fallback={<HardDrive className="h-4 w-4 text-gray-500 dark:text-gray-400" />}
                            />
                          </div>
                          <span className="font-semibold text-gray-900 dark:text-white truncate max-w-[320px]" title={image.name}>{image.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={cn('inline-flex items-center gap-2 px-2 py-1 rounded-full text-xs font-medium', image.inUsed ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300')}>
                          <span className={cn('h-2 w-2 rounded-full', image.inUsed ? 'bg-green-500' : 'bg-gray-400')} />
                          {image.inUsed ? '使用中' : '未使用'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap" title={image.tag}>{image.tag}</td>
                      <td className={cn('px-4 py-3 text-sm font-semibold whitespace-nowrap', getSizeColor(image.size))}>{formatImageSize(image.size)}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">{image.createTime || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 font-mono whitespace-nowrap" title={image.id}>{shortImageId(image.id)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <button onClick={(e) => { e.stopPropagation(); openAcceleratorModal(image.name) }} className="inline-flex items-center gap-1 text-sm text-sky-600 dark:text-sky-400 hover:underline">
                          加速 <Zap className="h-3.5 w-3.5" />
                        </button>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <button onClick={(e) => { e.stopPropagation(); setDeleteModal({ isOpen: true, image, force: false }) }} className="px-2 py-1 text-xs rounded-md text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 border border-gray-200 dark:border-gray-700">删除</button>
                        {image.inUsed && <button onClick={(e) => { e.stopPropagation(); setDeleteModal({ isOpen: true, image, force: true }) }} className="ml-1 px-2 py-1 text-xs rounded-md text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 border border-gray-200 dark:border-gray-700 whitespace-nowrap min-w-[64px]">强制删除</button>}
                      </td>
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
                <div key={image.id} onClick={() => isBatchMode && toggleImageSelection(image.id)} className={cn("group card p-4 rounded-2xl hover:shadow-lg transition-all cursor-pointer", selectedImages.includes(image.id) && "ring-2 ring-primary-500 bg-primary-50 dark:bg-primary-900/20")}>
                  {isBatchMode && (
                    <div className="flex justify-end mb-2">
                      <input type="checkbox" checked={selectedImages.includes(image.id)} onChange={() => toggleImageSelection(image.id)} onClick={(e) => e.stopPropagation()} className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500" />
                    </div>
                  )}
                  {/* 头部：图标、名字、状态指示器和大小 */}
                  <div className="flex items-start gap-3 mb-4">
                    <div className="h-10 w-10 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
                      <SafeImage
                        src={getImageLogo(image.name, customIcons)}
                        alt={image.name}
                        className="h-10 w-10 object-cover"
                        fallback={<HardDrive className="h-5 w-5 text-gray-500 dark:text-gray-400" />}
                      />
                    </div>

                    {/* 竖线状态指示器 */}
                    <div className="flex flex-col items-center justify-center h-10">
                      {image.inUsed && (
                        <div className="w-1 h-6 bg-gradient-to-b from-green-500 to-green-600 rounded-full flex-shrink-0" />
                      )}
                      {!image.inUsed && (
                        <div className="w-1 h-6 bg-gray-300 dark:bg-gray-600 rounded-full flex-shrink-0" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-gray-900 dark:text-white truncate text-sm">
                        {image.name}
                      </h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex items-center justify-between gap-2">
                        <span className="truncate">{image.tag}</span>
                        <span className={cn("font-semibold flex-shrink-0 whitespace-nowrap", getSizeColor(image.size))}>
                          大小: {formatImageSize(image.size)}
                        </span>
                      </p>
                    </div>

                    {/* 加速按钮 */}
                    <div className="flex gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); openAcceleratorModal(image.name) }}
                        className="p-1.5 text-sky-500 hover:text-sky-600 dark:hover:text-sky-400 rounded transition-colors active:scale-95"
                        title="加速拉取镜像"
                      >
                        <Zap className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* 镜像信息 */}
                  <div className="space-y-2 text-xs mb-4">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500 dark:text-gray-400 flex-shrink-0">ID:</span>
                      <span className="font-mono text-gray-700 dark:text-gray-300 truncate text-xs">
                        {image.id}
                      </span>
                    </div>
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex gap-2 pt-4 border-t border-gray-100 dark:border-gray-700">
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteModal({ isOpen: true, image, force: false }) }}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors active:scale-95"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>删除</span>
                    </button>
                    {image.inUsed && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteModal({ isOpen: true, image, force: true }) }}
                        className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors active:scale-95"
                        title="强制删除正在使用的镜像"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>强制删除</span>
                      </button>
                    )}
                  </div>
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
                    将永久删除 <span className="font-semibold text-orange-600 dark:text-orange-400">{pruneModal.images.length} 个</span> 镜像，此操作不可恢复
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
                        src={getImageLogo(img.name, customIcons)}
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
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-3xl w-full overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-sky-400 via-blue-500 to-cyan-500"></div>
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-2xl bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center"><Zap className="h-6 w-6 text-sky-600 dark:text-sky-300" /></div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">加速拉取镜像</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">选择加速源后拉取镜像，并实时输出日志</p>
                </div>
              </div>
              <button onClick={() => setAcceleratorModal({ isOpen: false, imageName: '', taskId: '', logs: '', selectedSource: '' })} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">镜像名</label>
                  <input value={acceleratorModal.imageName} onChange={(e) => setAcceleratorModal(prev => ({ ...prev, imageName: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm" placeholder="例如 library/nginx:latest" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">镜像源</label>
                  <select value={acceleratorModal.selectedSource} onChange={(e) => { setAcceleratorModal(prev => ({ ...prev, selectedSource: e.target.value })); persistAccelerators(accelerators, e.target.value) }} className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm">
                    {accelerators.map(src => <option key={src} value={src}>{src}</option>)}
                  </select>
                </div>
              </div>
              <div className="rounded-2xl border border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-900/40">
                <div className="flex gap-2">
                  <input value={newAccelerator} onChange={(e) => setNewAccelerator(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addAccelerator() }} className="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm" placeholder="输入加速源，回车保存" />
                  <button onClick={addAccelerator} className="px-4 py-2 rounded-xl bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 flex items-center gap-1"><Plus className="h-4 w-4" />添加</button>
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  {accelerators.map(src => <button key={src} onClick={() => setAcceleratorModal(prev => ({ ...prev, selectedSource: src }))} className={cn("px-2 py-1 text-xs rounded-lg border", acceleratorModal.selectedSource === src ? "bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-900/30 dark:text-sky-300" : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300")}>{src}</button>)}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2"><Logs className="h-4 w-4" />日志输出</label>
                  <button onClick={startAcceleratedPull} className="px-4 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-500 text-white text-sm font-semibold hover:from-sky-600 hover:to-blue-600">开始加速拉取</button>
                </div>
                <pre className="h-56 overflow-auto rounded-2xl bg-gray-950 text-green-300 text-xs p-4 whitespace-pre-wrap">{acceleratorModal.logs || '等待开始拉取...'}</pre>
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
                    {' '}吗？这将删除正在使用的镜像！
                  </>
                ) : (
                  <>
                    确定要删除镜像{' '}
                    <span className="font-semibold text-red-600 dark:text-red-400">"{deleteModal.image?.name}"</span>
                    {' '}吗？
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
