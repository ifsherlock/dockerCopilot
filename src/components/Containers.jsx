import React, { useEffect, useState } from 'react'
import {
  Play,
  Square,
  RotateCcw,
  RefreshCw,
  Upload,
  Clock,
  Calendar,
  Package,
  X,
  Info,
  Search,
  LayoutList,
  LayoutGrid,
  Ban,
  Undo2,
  CheckSquare
} from 'lucide-react'
import { containerAPI, progressAPI, imageAPI, botAPI, versionAPI } from '../api/client.js'
import { cn } from '../utils/cn.js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getImageLogo } from '../config/imageLogos.js'
import icons8Img from '../assets/icons8.png'

// 格式化运行时间为中文
function formatRunningTime(runningTime) {
  if (!runningTime) return '未知'

  // 如果已经是中文格式，直接返回
  if (runningTime.includes('小时') || runningTime.includes('分钟') || runningTime.includes('秒')) {
    return runningTime
  }

  // 尝试解析英文格式
  // 支持格式: "2h 30m", "2 hours 30 minutes", "30m", "30 minutes", "1 day 2h 30m" 等
  let hours = 0
  let minutes = 0
  let days = 0

  // 提取天数
  const dayMatch = runningTime.match(/(\d+)\s*(?:day|d)/)
  if (dayMatch) {
    days = parseInt(dayMatch[1])
  }

  // 提取小时
  const hourMatch = runningTime.match(/(\d+)\s*(?:hour|h)/)
  if (hourMatch) {
    hours = parseInt(hourMatch[1])
  }

  // 提取分钟
  const minMatch = runningTime.match(/(\d+)\s*(?:minute|min|m)/)
  if (minMatch) {
    minutes = parseInt(minMatch[1])
  }

  // 构建中文输出
  let result = ''
  if (days > 0) {
    result += `${days}天 `
  }
  if (hours > 0) {
    result += `${hours}小时 `
  }
  if (minutes > 0 || (days === 0 && hours === 0)) {
    result += `${minutes}分钟`
  }

  return result.trim()
}

function compactText(value, max = 12) {
  const text = String(value || '')
  if (!text) return '-'
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function firstWord(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  return text.split(/\s+/)[0]
}

function splitStoppedRuntime(value) {
  const text = String(value || '').trim()
  if (!text) return ['', '-']
  const match = text.match(/^(Exited\s*\([^)]*\)|Exited)\s+(.+)$/i)
  if (match) return [match[1], match[2]]
  return ['', text]
}

export function Containers() {
  const queryClient = useQueryClient()
  const [selectedContainer, setSelectedContainer] = useState(null)
  // 添加批量操作相关的状态
  const [selectedContainers, setSelectedContainers] = useState([])
  const [isBatchMode, setIsBatchMode] = useState(false)
  // 添加操作状态跟踪
  const [containerActions, setContainerActions] = useState({}) // 跟踪每个容器的操作状态
  const [updateTasks, setUpdateTasks] = useState({}) // 跟踪更新任务
  const [updateFilterPinnedKeys, setUpdateFilterPinnedKeys] = useState([]) // 临时保留在"有更新"筛选中的容器键，避免点击更新后瞬间消失
  const [updateFilterPinnedSnapshots, setUpdateFilterPinnedSnapshots] = useState({}) // 保留点击更新时的容器快照，避免后端短暂换 id / 消失导致列表闪跳
  const [updateFilterPinnedPositions, setUpdateFilterPinnedPositions] = useState({}) // 记录容器在“有更新”列表中的原始位置，避免保留态被补到列表末尾造成跳位
  // 添加筛选状态
  const [filterStatus, setFilterStatus] = useState(null) // null 表示显示全部
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('docker_copilot_containers_view_mode') || 'card') // 'card' | 'table'
  const [updateBlacklist, setUpdateBlacklist] = useState([])
  const [searchKeyword, setSearchKeyword] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)

  // 自定义确认弹窗状态
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null,
    onCancel: null,
    type: 'info' // info, warning, danger
  })



  // 使用React Query获取容器列表
  const { data: containers = [], isLoading, refetch } = useQuery({
    queryKey: ['containers'],
    queryFn: async () => {
      const response = await containerAPI.getContainers()
      if (response.data.code === 200 || response.data.code === 0) {
        console.log('容器数据:', response.data.data)
        return response.data.data || []
      } else {
        throw new Error(response.data.msg)
      }
    },
    refetchInterval: () => Object.values(containerActions).some(action => action?.action === 'update' && (action?.loading || action?.done)) ? false : 10000, // 更新动画期间暂停自动刷新，避免卡片被新 id 替换后一闪而过
  })

  // 获取自定义图标配置
  const { data: customIcons = {} } = useQuery({
    queryKey: ['customIcons'],
    queryFn: async () => {
      console.log('[Debug] 开始从服务器获取图标配置...')
      try {
        const response = await imageAPI.getIcons()
        console.log('[Debug] 图标API响应:', response.data)
        if (response.data.code === 200 || response.data.code === 0) {
          const icons = response.data.data || {}
          console.log('[Debug] 获取到的图标数据:', icons)
          // update localStorage
          localStorage.setItem('docker_copilot_image_logos', JSON.stringify(icons))
          return icons
        }
      } catch (err) {
        console.error('[Debug] 获取图标失败:', err)
      }
      return {}
    },
    // 初始数据尝试从localStorage获取，避免闪烁
    initialData: () => {
      const saved = localStorage.getItem('docker_copilot_image_logos')
      if (saved) {
        try {
          const parsed = JSON.parse(saved)
          // 只有当有实际数据时才作为初始数据
          if (Object.keys(parsed).length > 0) {
            return parsed
          }
        } catch (e) {
          console.error('解析本地图标配置失败:', e)
        }
      }
      return undefined
    },
    // 即使有初始数据，也立即在后台刷新
    refetchOnMount: true,
  })

  useEffect(() => {
    localStorage.setItem('docker_copilot_containers_view_mode', viewMode)
  }, [viewMode])

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

  const getBlacklistCandidates = (container) => {
    const imageCandidates = [container?.usingImage, container?.createImage]
      .map(canonicalImageName)
      .filter(Boolean)
    const nameCandidates = [container?.name].map(normalizeImageName).filter(Boolean)
    return Array.from(new Set([...imageCandidates, ...nameCandidates]))
  }
  const getBlacklistKey = (container) => canonicalImageName(container?.usingImage || container?.createImage) || normalizeImageName(container?.name)
  const getUpdateFilterPinKey = (containerOrName, containerId = '') => {
    if (typeof containerOrName === 'string') {
      return normalizeImageName(containerOrName) || String(containerId || '')
    }
    return getBlacklistKey(containerOrName) || String(containerOrName?.id || containerId || '')
  }
  const getContainerRenderKey = (container) => {
    if (filterStatus === 'update') {
      return `update:${getUpdateFilterPinKey(container)}`
    }
    return container?.id || `name:${container?.name || 'unknown'}`
  }
  const matchesBlacklistItem = (container, item) => {
    const normalizedItem = canonicalImageName(item)
    if (!normalizedItem) return false
    return getBlacklistCandidates(container).some(candidate => candidate === normalizedItem || candidate.startsWith(`${normalizedItem}:`) || normalizedItem.startsWith(`${candidate}:`))
  }

  const loadUpdateBlacklist = async () => {
    try {
      const res = await botAPI.getUpdateBlacklist()
      const list = res.data?.data || []
      setUpdateBlacklist(Array.isArray(list) ? list : [])
    } catch (err) {
      console.error('读取更新黑名单失败:', err)
    }
  }

  useEffect(() => {
    loadUpdateBlacklist()
  }, [])

  const saveUpdateBlacklist = async (nextList) => {
    const normalized = Array.from(new Set(nextList.map(item => canonicalImageName(item) || normalizeImageName(item)).filter(Boolean)))
    const previous = updateBlacklist
    setUpdateBlacklist(normalized)
    try {
      const res = await botAPI.saveUpdateBlacklist(normalized)
      const saved = res.data?.data || normalized
      setUpdateBlacklist(Array.isArray(saved) ? saved : normalized)
      await queryClient.invalidateQueries(['containers'])
    } catch (err) {
      setUpdateBlacklist(previous)
      console.error('保存更新黑名单失败:', err)
      setConfirmModal({
        isOpen: true,
        title: '保存失败',
        message: err.response?.data?.msg || err.message || '更新黑名单保存失败',
        onConfirm: () => setConfirmModal({ isOpen: false }),
        onCancel: null,
        type: 'danger'
      })
    }
  }
  const isUpdateIgnored = (container) => updateBlacklist.some(item => matchesBlacklistItem(container, item))
  const ignoreUpdate = async (container) => saveUpdateBlacklist([...updateBlacklist, ...getBlacklistCandidates(container)])
  const unignoreUpdate = async (container) => saveUpdateBlacklist(updateBlacklist.filter(item => !matchesBlacklistItem(container, item)))
  const getContainerActionState = (container) => containerActions[container.id] || containerActions[`name:${container.name}`]

  const flushUIFrame = () => new Promise(resolve => {
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => setTimeout(resolve, 0))
      return
    }
    setTimeout(resolve, 0)
  })

  const setContainerUpdateAction = (containerId, containerName, actionState) => {
    setContainerActions(prev => ({
      ...prev,
      [containerId]: actionState,
      ...(containerName ? { [`name:${containerName}`]: actionState } : {})
    }))
  }

  const clearContainerUpdateAction = (containerId, containerName) => {
    setContainerActions(prev => {
      const newState = { ...prev }
      delete newState[containerId]
      if (containerName) delete newState[`name:${containerName}`]
      return newState
    })
  }

  const pinContainerInUpdateFilter = (containerOrName, containerId = '') => {
    const pinKey = getUpdateFilterPinKey(containerOrName, containerId)
    if (!pinKey) return
    setUpdateFilterPinnedKeys(prev => prev.includes(pinKey) ? prev : [...prev, pinKey])
    if (containerOrName && typeof containerOrName === 'object') {
      setUpdateFilterPinnedSnapshots(prev => ({
        ...prev,
        [pinKey]: { ...containerOrName }
      }))
      setUpdateFilterPinnedPositions(prev => {
        if (prev[pinKey] !== undefined) return prev
        const visibleUpdateContainers = containers.filter(item => !isUpdateIgnored(item) && item.haveUpdate)
        const pinnedIndex = visibleUpdateContainers.findIndex(item => getUpdateFilterPinKey(item) === pinKey)
        return {
          ...prev,
          [pinKey]: pinnedIndex >= 0 ? pinnedIndex : visibleUpdateContainers.length
        }
      })
    }
  }

  const unpinContainerInUpdateFilter = (containerOrName, containerId = '') => {
    const pinKey = getUpdateFilterPinKey(containerOrName, containerId)
    if (!pinKey) return
    setUpdateFilterPinnedKeys(prev => prev.filter(item => item !== pinKey))
    setUpdateFilterPinnedSnapshots(prev => {
      const next = { ...prev }
      delete next[pinKey]
      return next
    })
    setUpdateFilterPinnedPositions(prev => {
      const next = { ...prev }
      delete next[pinKey]
      return next
    })
  }

  const displayedHaveUpdate = (container) => {
    const action = getContainerActionState(container)
    return container.haveUpdate && !isUpdateIgnored(container) && !(action?.action === 'update' && (action?.loading || action?.done))
  }

  const visibleInUpdateFilter = (container) => {
    const action = getContainerActionState(container)
    const isUpdatingOrJustDone = action?.action === 'update' && (action?.loading || action?.done)
    const isPinnedInUpdateFilter = updateFilterPinnedKeys.includes(getUpdateFilterPinKey(container))
    return !isUpdateIgnored(container) && (container.haveUpdate || isUpdatingOrJustDone || isPinnedInUpdateFilter)
  }
  const selectedContainerItems = containers.filter(c => selectedContainers.includes(c.id))
  const hasSelectedIgnored = selectedContainerItems.some(isUpdateIgnored)
  const getUpdateImageRef = (container) => container?.createImage || container?.usingImage || ''
  const isSelfContainer = (container) => !!container?.isSelf
  const topButtonClass = (enabledClass, disabled) => cn(
    'flex items-center gap-2 px-4 py-2 rounded-lg transition-colors text-sm font-medium',
    disabled
      ? 'bg-gray-200 text-gray-500 border border-gray-300 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600 cursor-not-allowed'
      : enabledClass
  )
  const unignoreSelected = async () => {
    const selected = containers.filter(c => selectedContainers.includes(c.id))
    await saveUpdateBlacklist(updateBlacklist.filter(item => !selected.some(container => matchesBlacklistItem(container, item))))
    setSelectedContainers([])
    setIsBatchMode(false)
  }

  const handleDeleteContainer = (container) => {
    const name = container?.name || '该容器'
    setConfirmModal({
      isOpen: true,
      title: '删除容器',
      message: `确定要删除已停止的容器「${name}」吗？此操作不会删除镜像。`,
      type: 'danger',
      onCancel: null,
      onConfirm: async () => {
        setConfirmModal({ isOpen: false })
        await handleContainerAction(container.id, 'delete')
      }
    })
  }

  const handleContainerAction = async (containerId, action) => {
    try {
      // 设置操作状态为加载中
      setContainerActions(prev => ({
        ...prev,
        [containerId]: { action, loading: true }
      }))

      switch (action) {
        case 'start':
          await containerAPI.startContainer(containerId)
          break
        case 'stop':
          await containerAPI.stopContainer(containerId)
          break
        case 'restart':
          await containerAPI.restartContainer(containerId)
          break
        case 'delete':
          await containerAPI.deleteContainer(containerId)
          break
        default:
          break
      }

      // 立即更新本地状态，提供即时反馈
      queryClient.setQueryData(['containers'], (oldData) => {
        if (!oldData) return oldData

        return oldData.map(container => {
          if (action === 'delete' && container.id === containerId) {
            return null
          }
          if (container.id === containerId) {
            let newStatus = container.status
            switch (action) {
              case 'start':
                newStatus = 'running'
                break
              case 'stop':
                newStatus = 'stopped'
                break
              case 'restart':
                newStatus = 'running'
                break
              default:
                break
            }
            return { ...container, status: newStatus }
          }
          return container
        }).filter(Boolean)
      })

      // 清除操作状态
      setContainerActions(prev => {
        const newState = { ...prev }
        delete newState[containerId]
        return newState
      })

      // 延迟刷新以获取最新数据
      setTimeout(() => {
        refetch()
      }, 1500)

    } catch (error) {
      console.error('操作失败:', error)
      // 清除操作状态
      setContainerActions(prev => {
        const newState = { ...prev }
        delete newState[containerId]
        return newState
      })
      unpinContainerInUpdateFilter(container.name, containerId)

      // 增加超时错误的处理
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        console.error(`操作超时，请稍后手动刷新页面查看操作结果`)
      } else {
        console.error(`操作失败: ${error.response?.data?.msg || error.message}`)
      }
    }
  }

  // 批量操作处理函数
  const handleBatchAction = async (action) => {
    try {
      // 为所有选中的容器设置加载状态
      selectedContainers.forEach(containerId => {
        setContainerActions(prev => ({
          ...prev,
          [containerId]: { action, loading: true }
        }))
      })

      // 立即更新本地状态提供即时反馈
      if (action === 'start' || action === 'stop' || action === 'restart') {
        queryClient.setQueryData(['containers'], (oldData) => {
          if (!oldData) return oldData

          return oldData.map(container => {
            if (selectedContainers.includes(container.id)) {
              let newStatus = container.status
              switch (action) {
                case 'start':
                  newStatus = 'running'
                  break
                case 'stop':
                  newStatus = 'stopped'
                  break
                case 'restart':
                  newStatus = 'running'
                  break
                default:
                  break
              }
              return { ...container, status: newStatus }
            }
            return container
          })
        })
      }

      const actionableContainerIds = action === 'update'
        ? selectedContainers.filter(containerId => {
          const container = containers.find(c => c.id === containerId)
          return container && !isUpdateIgnored(container) && displayedHaveUpdate(container)
        })
        : selectedContainers

      if (action === 'update') {
        actionableContainerIds.forEach(containerId => {
          const container = containers.find(c => c.id === containerId)
          pinContainerInUpdateFilter(container, containerId)
          setContainerUpdateAction(containerId, container?.name, { action: 'update', loading: true, progress: '正在准备更新...', percentage: 1 })
        })
      }

      // 对每个选中的容器执行操作；批量启停/重启允许单个请求超时，不让整批直接弹红色失败
      const failedItems = []
      for (const containerId of actionableContainerIds) {
        const container = containers.find(c => c.id === containerId)
        try {
          switch (action) {
            case 'start':
              await containerAPI.startContainer(containerId)
              break
            case 'stop':
              await containerAPI.stopContainer(containerId)
              break
            case 'restart':
              await containerAPI.restartContainer(containerId)
              break
            case 'update':
              if (container) {
                const response = await containerAPI.updateContainer(
                  containerId,
                  container.name,
                  getUpdateImageRef(container),
                  true
                )

                if (response.data.code === 200 || response.data.code === 0) {
                  const taskID = response.data.data?.taskID
                  if (taskID) {
                    // 保存任务ID并开始轮询进度
                    setUpdateTasks(prev => ({
                      ...prev,
                      [containerId]: taskID
                    }))
                    // 调用轮询进度函数
                    pollProgress(containerId, taskID, container?.name)
                  }
                }
              }
              break
            default:
              break
          }
        } catch (error) {
          const isTimeout = error.code === 'ECONNABORTED' || error.message?.includes('timeout')
          // Docker stop/restart 可能已经提交成功但响应超过前端超时，先不按失败打断整批，刷新后以实际状态为准
          if (isTimeout && action !== 'update') {
            console.warn(`批量${action}请求超时，稍后刷新确认实际状态:`, container?.name || containerId)
          } else {
            failedItems.push({
              name: container?.name || containerId,
              message: error.response?.data?.msg || error.message || '未知错误'
            })
          }
        } finally {
          // 对于非更新操作，立即清除操作状态
          if (action !== 'update') {
            setContainerActions(prev => {
              const newState = { ...prev }
              delete newState[containerId]
              return newState
            })
          }
        }
      }

      // 如果不是更新操作，延迟刷新以获取最新数据
      if (action !== 'update') {
        setTimeout(() => {
          refetch()
        }, 1500)
        setTimeout(() => {
          refetch()
        }, 5000)
      }

      // 清除选中状态
      setSelectedContainers([])
      setIsBatchMode(false)

      if (failedItems.length > 0) {
        setConfirmModal({
          isOpen: true,
          title: '部分操作失败',
          message: failedItems.slice(0, 3).map(item => `${item.name}: ${item.message}`).join('；') + (failedItems.length > 3 ? `；另有 ${failedItems.length - 3} 个失败` : ''),
          onConfirm: () => setConfirmModal({ isOpen: false }),
          onCancel: null,
          type: 'danger'
        })
      }
    } catch (error) {
      console.error('批量操作失败:', error)
      // 清除所有操作状态
      selectedContainers.forEach(containerId => {
        setContainerActions(prev => {
          const newState = { ...prev }
          delete newState[containerId]
          return newState
        })
      })

      const isTimeout = error.code === 'ECONNABORTED' || error.message?.includes('timeout')
      if (isTimeout && action !== 'update') {
        setTimeout(() => refetch(), 1500)
        return
      }

      // 使用自定义弹窗显示错误信息
      setConfirmModal({
        isOpen: true,
        title: '操作失败',
        message: '批量操作失败: ' + (error.response?.data?.msg || error.message || '未知错误'),
        onConfirm: () => setConfirmModal({ isOpen: false }),
        onCancel: null,
        type: 'danger'
      });
    }
  }

  const handleRenameContainer = async (containerId, newName) => {
    try {
      const response = await containerAPI.renameContainer(containerId, newName)
      if (response.data.code === 200 || response.data.code === 0) {
        await refetch()
        console.log('重命名成功')
      }
    } catch (error) {
      console.error('重命名容器失败:', error)
      console.error(`重命名失败: ${error.response?.data?.msg || error.message}`)
    }
  }

  const handleUpdateContainer = async (containerId, existingTaskID = null) => {
    try {
      const container = containers.find(c => c.id === containerId)
      if (!container) {
        console.error('容器未找到')
        return
      }

      if (isUpdateIgnored(container)) {
        console.log(`容器 "${container.name}" 已在更新黑名单，跳过更新`)
        return
      }

      if (isSelfContainer(container)) {
        setConfirmModal({
          isOpen: true,
          title: '更新 DockerCopilot',
          message: '这是当前正在运行的 DockerCopilot 容器。普通容器重建流程会先停止自身，导致更新中断，所以这里会改走程序自身更新流程。执行后当前页面可能会短暂断开，请稍后刷新重连。',
          onConfirm: async () => {
            setConfirmModal({ isOpen: false })
            pinContainerInUpdateFilter(container, containerId)
            setContainerUpdateAction(containerId, container.name, { action: 'update', loading: true, progress: '正在检查远端版本...', percentage: 10 })
            try {
              await flushUIFrame()
              setContainerUpdateAction(containerId, container.name, { action: 'update', loading: true, progress: '正在下载并准备新的 DockerCopilot 二进制...', percentage: 35 })
              await flushUIFrame()
              const response = await versionAPI.updateProgram()
              if (response.data.code === 200 || response.data.code === 0) {
                if (response.data.data?.updated === false || response.data.msg === '当前已是最新版本') {
                  setContainerUpdateAction(containerId, container.name, { action: 'update', loading: false, done: true, progress: '当前已是最新版本', percentage: 100 })
                  setTimeout(() => {
                    setContainerActions(prev => {
                      const newState = { ...prev }
                      delete newState[containerId]
                      return newState
                    })
                    unpinContainerInUpdateFilter(container.name, containerId)
                  }, 2500)
                  return
                }
                setContainerUpdateAction(containerId, container.name, { action: 'update', loading: true, progress: '新版本已就绪，正在等待进程重启接管...', percentage: 90 })
                setTimeout(() => {
                  setContainerUpdateAction(containerId, container.name, { action: 'update', loading: false, done: true, progress: '已提交自更新，稍后重连', percentage: 100 })
                }, 800)
                setTimeout(() => {
                  window.location.reload()
                }, 12000)
              } else {
                throw new Error(response.data.msg || '自更新失败')
              }
            } catch (error) {
              console.error('自更新失败:', error)
              setContainerActions(prev => {
                const newState = { ...prev }
                delete newState[containerId]
                return newState
              })
              unpinContainerInUpdateFilter(container.name, containerId)
              setConfirmModal({
                isOpen: true,
                title: '更新失败',
                message: error.response?.data?.msg || error.message || '自更新失败',
                onConfirm: () => setConfirmModal({ isOpen: false }),
                onCancel: null,
                type: 'danger'
              })
            }
          },
          onCancel: () => setConfirmModal({ isOpen: false }),
          type: 'warning'
        })
        return
      }

      const updateImageRef = getUpdateImageRef(container)
      console.log(`开始更新容器 "${container.name}"，使用镜像: ${updateImageRef}`)

      pinContainerInUpdateFilter(container, containerId)
      setContainerUpdateAction(containerId, container.name, { action: 'update', loading: true, progress: '正在准备更新...', percentage: 1 })
      await flushUIFrame()

      if (existingTaskID) {
        console.log('复用已有更新任务, taskID:', existingTaskID)
        setUpdateTasks(prev => ({
          ...prev,
          [containerId]: existingTaskID
        }))
        pollProgress(containerId, existingTaskID, container.name)
        return
      }

      // 注意参数顺序: id, containerName, imageNameAndTag, delOldContainer
      const response = await containerAPI.updateContainer(
        containerId,
        container.name,
        updateImageRef,
        true
      )

      console.log('更新容器响应:', response.data)

      if (response.data.code === 200 || response.data.code === 0) {
        const taskID = response.data.data?.taskID

        if (taskID) {
          console.log('开始轮询进度, taskID:', taskID)
          // 保存任务ID并开始轮询进度
          setUpdateTasks(prev => ({
            ...prev,
            [containerId]: taskID
          }))

          pollProgress(containerId, taskID, container?.name)
        } else {
          // 没有 taskID 通常是后端快速完成/短路完成。
          // 先展示一小段完成动画，再刷新列表，避免“金色更新按钮一闪就跳到前面”。
          setContainerUpdateAction(containerId, container.name, {
            action: 'update',
            loading: false,
            done: true,
            progress: response.data.msg || '更新完成',
            percentage: 100
          })
          setTimeout(async () => {
            setContainerActions(prev => {
              const newState = { ...prev }
              delete newState[containerId]
              return newState
            })
            unpinContainerInUpdateFilter(container.name, containerId)
            await refetch()
          }, 2200)

        }
      } else {
        throw new Error(response.data.msg || '更新失败')
      }
    } catch (error) {
      console.error('更新容器失败:', error)
      setContainerActions(prev => {
        const newState = { ...prev }
        delete newState[containerId]
        return newState
      })

      // 增加超时错误的处理
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        console.error(`更新操作已提交，但连接超时。请稍后手动刷新页面查看操作结果`)
        // 即使超时也触发轮询，因为操作可能仍在进行中
        // 这里我们不知道taskID，所以无法启动轮询，只能提示用户稍后查看
      } else {
        // 针对名称冲突提供特定的解决方案
        let errorMessage = error.response?.data?.msg || error.message;
        if (errorMessage.includes('重命名') || errorMessage.includes('name conflict') || errorMessage.includes('名称冲突')) {
          errorMessage += '\n\n检测到容器名称冲突问题，建议解决方案：\n' +
            '1. 手动删除或重命名冲突的容器\n' +
            '2. 使用不同的容器名称进行更新\n' +
            '3. 先停止并重命名当前容器，再进行更新操作';
        }

        // 使用自定义弹窗显示错误信息
        setConfirmModal({
          isOpen: true,
          title: '更新失败',
          message: errorMessage,
          onConfirm: () => setConfirmModal({ isOpen: false }),
          onCancel: null,
          type: 'danger'
        });
      }
    }
  }

  // 轮询进度
  const pollProgress = async (containerId, taskID, containerName = null) => {
    const maxAttempts = 60 // 最多轮询60次 (2分钟)
    let attempts = 0
    let pollTimer = null

    const clearPollState = () => {
      if (pollTimer) {
        clearTimeout(pollTimer)
        pollTimer = null
      }
      setContainerActions(prev => {
        const newState = { ...prev }
        delete newState[containerId]
        return newState
      })
      setUpdateTasks(prev => {
        const newState = { ...prev }
        delete newState[containerId]
        return newState
      })
      unpinContainerInUpdateFilter(containerName, containerId)
    }

    const poll = async () => {
      try {
        attempts++
        const response = await progressAPI.getProgress(taskID)
        console.log(`进度查询[${attempts}/${maxAttempts}]:`, response.data)

        const data = response.data

        // 提取进度信息
        let progressMsg = '处理中...'
        let percentage = 0

        if (data.data?.progress) {
          progressMsg = data.data.progress
        } else if (data.data?.message) {
          progressMsg = data.data.message
        } else if (data.msg) {
          progressMsg = data.msg
        }

        // 提取百分比
        if (data.data?.percentage !== undefined) {
          percentage = Math.min(100, Math.max(0, parseFloat(data.data.percentage)))
        } else if (data.data?.percent !== undefined) {
          percentage = Math.min(100, Math.max(0, parseFloat(data.data.percent)))
        } else {
          // 尝试从进度消息中提取百分比
          const percentMatch = progressMsg.match(/(\d+(?:\.\d+)?)\s*%/)
          if (percentMatch) {
            percentage = Math.min(100, Math.max(0, parseFloat(percentMatch[1])))
          } else {
            // 根据轮询次数估算进度
            percentage = Math.min(95, (attempts / maxAttempts) * 100)
          }
        }

        // 检查是否完成 - 兼容多种响应格式
        const status = data.data?.status || data.status
        const isDone = data.data?.isDone === true ||
          status === 'completed' ||
          status === 'success' ||
          status === 'done' ||
          status === 'finish' ||
          status === 'finished'

        // 检查是否失败
        const isFailed = status === 'failed' ||
          status === 'error' ||
          progressMsg.includes('失败') ||
          progressMsg.includes('错误') ||
          data.code === 500 ||
          data.code === 400

        const isCompleted = isDone && !isFailed

        if (isCompleted) {
          // 任务完成 - 先把最终状态展示出来，再清理并刷新，避免“已是最新”这种秒完成任务看起来卡住/没反应
          console.log('容器更新完成，停止轮询')
          if (pollTimer) {
            clearTimeout(pollTimer)
            pollTimer = null
          }
          const doneState = {
            ...(containerActions[containerId] || {}),
            action: 'update',
            loading: false,
            done: true,
            progress: progressMsg || '更新完成',
            percentage: 100
          }
          setContainerUpdateAction(containerId, containerName, doneState)
          setUpdateTasks(prev => {
            const newState = { ...prev }
            delete newState[containerId]
            return newState
          })
          setTimeout(async () => {
            clearContainerUpdateAction(containerId, containerName)
            unpinContainerInUpdateFilter(containerName, containerId)
            await refetch()
          }, 2200)
          console.log('✅ 容器更新完成!')
          return // 确保不再继续执行
        }

        if (isFailed) {
          // 任务失败 - 立即停止轮询
          console.log('容器更新失败，停止轮询')
          clearPollState()
          // 添加更详细的错误信息
          const errorMsg = data.data?.error || data.data?.message || data.msg || '更新失败'
          console.error(`❌ 更新失败: ${errorMsg}`)

          return // 确保不再继续执行
        }

        // 更新容器操作状态，显示进度
        setContainerUpdateAction(containerId, containerName, {
          ...(containerActions[containerId] || {}),
          action: 'update',
          loading: true,
          progress: progressMsg,
          percentage: percentage
        })

        // 继续轮询
        if (attempts < maxAttempts) {
          pollTimer = setTimeout(poll, 2000) // 2秒后再次查询
        } else {
          clearPollState()
          console.error('⏱️ 更新超时，请检查容器状态')

        }
      } catch (error) {
        console.error('查询进度失败:', error)
        clearPollState()
        console.error(`❌ 更新失败: ${error.response?.data?.msg || error.message}`)
        // 显示网络错误或其他异常情况的友好提示

      }
    }

    // 开始轮询
    poll()
  }

  // 容器选择处理函数
  const toggleContainerSelection = (containerId) => {
    if (selectedContainers.includes(containerId)) {
      setSelectedContainers(selectedContainers.filter(id => id !== containerId))
    } else {
      setSelectedContainers([...selectedContainers, containerId])
    }
  }

  // 全选/取消全选
  const toggleSelectAll = () => {
    const ids = renderedContainers.map(container => container.id)
    const allSelected = ids.length > 0 && ids.every(id => selectedContainers.includes(id))
    setSelectedContainers(allSelected ? selectedContainers.filter(id => !ids.includes(id)) : Array.from(new Set([...selectedContainers, ...ids])))
  }

  const handleRefresh = async () => {
    try {
      setIsRefreshing(true)
      await Promise.allSettled([
        containerAPI.checkUpdates(),
        refetch()
      ])
      setTimeout(() => refetch(), 3000)
    } finally {
      setTimeout(() => setIsRefreshing(false), 400)
    }
  }

  // 获取状态指示器颜色
  const getStatusIndicatorColor = (status) => {
    const statusConfig = {
      running: 'bg-green-500',
      stopped: 'bg-red-500',
      restarting: 'bg-yellow-500',
      paused: 'bg-blue-500'
    }

    return statusConfig[status?.toLowerCase()] || 'bg-gray-500'
  }

  // 获取状态颜色（用于小圆点）
  const getStatusColor = (status) => {
    const statusConfig = {
      running: 'bg-green-500',
      stopped: 'bg-red-500',
      restarting: 'bg-yellow-500',
      paused: 'bg-blue-500'
    }

    return statusConfig[status?.toLowerCase()] || 'bg-gray-500'
  }

  const baseFilteredContainers = containers.filter((container) => {
    const keyword = searchKeyword.trim().toLowerCase()
    const matchesKeyword = !keyword || [
      container.name,
      container.status,
      container.usingImage,
      container.createImage,
      container.createTime,
      container.runningTime,
      ...getBlacklistCandidates(container)
    ].some(value => String(value || '').toLowerCase().includes(keyword))
    if (!matchesKeyword) return false
    if (!filterStatus) return true
    if (filterStatus === 'running') return container.status && container.status.toLowerCase() === 'running'
    if (filterStatus === 'stopped') return container.status && container.status.toLowerCase() !== 'running'
    if (filterStatus === 'update') return visibleInUpdateFilter(container)
    if (filterStatus === 'ignored') return isUpdateIgnored(container)
    return true
  })

  const filteredContainers = (() => {
    let next = [...baseFilteredContainers]

    if (filterStatus === 'update') {
      const missingPinned = updateFilterPinnedKeys
        .map(pinKey => ({
          pinKey,
          snapshot: updateFilterPinnedSnapshots[pinKey],
          position: updateFilterPinnedPositions[pinKey]
        }))
        .filter(({ pinKey, snapshot }) => snapshot && !next.some(container => getUpdateFilterPinKey(container) === pinKey))
        .sort((a, b) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER))

      for (const { snapshot, position } of missingPinned) {
        const insertAt = typeof position === 'number' ? Math.max(0, Math.min(position, next.length)) : next.length
        next.splice(insertAt, 0, snapshot)
      }
    }

    return next
  })()

  const renderedContainers = (() => {
    if (filterStatus !== 'update') return filteredContainers

    const pinnedItems = updateFilterPinnedKeys
      .map(pinKey => ({
        pinKey,
        snapshot: updateFilterPinnedSnapshots[pinKey],
        position: updateFilterPinnedPositions[pinKey]
      }))
      .filter(({ snapshot }) => !!snapshot)
      .sort((a, b) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER))
      .map(({ snapshot }) => snapshot)

    const pinnedKeySet = new Set(updateFilterPinnedKeys)
    const normalItems = filteredContainers.filter(container => !pinnedKeySet.has(getUpdateFilterPinKey(container)))

    return [...pinnedItems, ...normalItems]
  })()

  const getUpdateProgressPercent = (container) => {
    const action = getContainerActionState(container)
    if (!action || !action.loading) return 0
    if (typeof action.percentage === 'number') return Math.max(0, Math.min(100, Math.round(action.percentage)))
    return action.action === 'update' ? 5 : 0
  }

  const getContainerImageRef = (container) => container?.createImage || container?.usingImage || ''

  const renderContainerIcon = (container, sizeClass = 'h-9 w-9') => {
    const imageRef = getContainerImageRef(container)
    let iconUrl = container.iconUrl
    if (!iconUrl && imageRef) {
      const builtInLogo = getImageLogo(imageRef)
      if (builtInLogo) {
        iconUrl = builtInLogo
      } else {
        for (const [imageName, logoUrl] of Object.entries(customIcons || {})) {
          if (imageRef.startsWith(imageName) || imageRef.includes(`${imageName}:`)) {
            iconUrl = logoUrl
            break
          }
        }
      }
    }

    if (iconUrl) {
      return <img src={iconUrl} alt={container.name} className={`${sizeClass} rounded-lg object-cover shadow-sm flex-shrink-0`} />
    }

    return (
      <div className={`${sizeClass} bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center shadow-sm flex-shrink-0`}>
        <Package className="h-5 w-5 text-white" />
      </div>
    )
  }

  const renderTableActionButtons = (container) => {
    const actionState = getContainerActionState(container)
    const isBusy = actionState?.loading

    if (isBusy || actionState?.done) {
      return (
        <div className={cn("inline-flex items-center gap-2 px-2 py-1 text-xs rounded-md whitespace-nowrap", actionState?.done ? "text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/30" : "text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-900/30")}>
          {actionState?.done ? <span className="h-3 w-3 text-center leading-3">✓</span> : <RefreshCw className="h-3 w-3 animate-spin" />}
          <span>
            {actionState.action === 'start' && '启动中'}
            {actionState.action === 'stop' && '停止中'}
            {actionState.action === 'restart' && '重启中'}
            {actionState.action === 'update' && (actionState?.done ? (actionState.progress || '更新完成') : `更新中${actionState.percentage ? ` ${Math.round(actionState.percentage)}%` : ''}`)}
            {actionState.action === 'delete' && '删除中'}
          </span>
        </div>
      )
    }

    return (
      <div className="flex items-center gap-1 justify-start">
        {container.status === 'running' ? (
          <>
            <button onClick={(e) => { e.stopPropagation(); handleContainerAction(container.id, 'stop') }} className="px-2 py-1 text-xs rounded-md text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 border border-gray-200 dark:border-gray-700" title="停止">
              停止
            </button>
            <button onClick={(e) => { e.stopPropagation(); handleContainerAction(container.id, 'restart') }} className="px-2 py-1 text-xs rounded-md text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-gray-200 dark:border-gray-700" title="重启">
              重启
            </button>
          </>
        ) : (
          <>
            <button onClick={(e) => { e.stopPropagation(); handleContainerAction(container.id, 'start') }} className="px-2 py-1 text-xs rounded-md text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 border border-gray-200 dark:border-gray-700" title="启动">
              启动
            </button>
            <button onClick={(e) => { e.stopPropagation(); handleDeleteContainer(container) }} className="px-2 py-1 text-xs rounded-md text-white bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-500 border border-red-500 dark:border-red-600 shadow-sm" title="删除已停止容器">
              删除
            </button>
          </>
        )}
        <button onClick={(e) => { e.stopPropagation(); handleUpdateContainer(container.id) }} disabled={isUpdateIgnored(container)} className={cn(
          "px-2 py-1 text-xs rounded-md border transition-colors",
          isUpdateIgnored(container)
            ? "text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 cursor-not-allowed opacity-70"
            : displayedHaveUpdate(container)
              ? "text-yellow-700 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700 hover:bg-yellow-50 dark:hover:bg-yellow-900/20"
              : "text-purple-600 dark:text-purple-400 border-gray-200 dark:border-gray-700 hover:bg-purple-50 dark:hover:bg-purple-900/20"
        )} title={isUpdateIgnored(container) ? '已忽略更新，无法更新；请先取消忽略' : '更新'}>
          更新
        </button>
        {isUpdateIgnored(container) ? (
          <button onClick={(e) => { e.stopPropagation(); unignoreUpdate(container) }} className="px-2 py-1 text-xs rounded-md border text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 font-semibold" title="取消忽略更新">取消忽略</button>
        ) : (
          <button onClick={(e) => { e.stopPropagation(); ignoreUpdate(container) }} className="px-2 py-1 text-xs rounded-md border text-yellow-700 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700 hover:bg-yellow-50 dark:hover:bg-yellow-900/20" title="忽略更新">忽略</button>
        )}
      </div>
    )
  }

  const renderTableView = () => (
    <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900/60">
            <tr>
              <th className="w-14 px-4 py-3 text-left">
                <label className="inline-flex items-center justify-center w-8 h-8 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={renderedContainers.length > 0 && renderedContainers.every(c => selectedContainers.includes(c.id))}
                    onChange={() => {
                      const ids = renderedContainers.map(c => c.id)
                      const allSelected = ids.length > 0 && ids.every(id => selectedContainers.includes(id))
                      setSelectedContainers(allSelected ? selectedContainers.filter(id => !ids.includes(id)) : Array.from(new Set([...selectedContainers, ...ids])))
                      setIsBatchMode(true)
                    }}
                    className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                  />
                </label>
              </th>
              {['容器名称', '状态', '使用镜像', '创建时间', '运行时长', '操作', '进度'].map((title) => (
                <th key={title} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                  {title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700 bg-white dark:bg-gray-800">
            {renderedContainers.map((container) => {
              const isSelected = selectedContainers.includes(container.id)
              const progressPercent = getUpdateProgressPercent(container)
              return (
                <tr key={getContainerRenderKey(container)} onClick={() => toggleContainerSelection(container.id)} className={cn(
                  "hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer",
                  isSelected && "bg-primary-50 dark:bg-primary-900/20",
                  isUpdateIgnored(container) && "opacity-55 grayscale"
                )}>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <label className="inline-flex items-center justify-center w-8 h-8 cursor-pointer">
                      <input type="checkbox" checked={isSelected} onChange={() => toggleContainerSelection(container.id)} className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500" />
                    </label>
                  </td>
                  <td className="px-4 py-3 min-w-[220px]">
                    <div className="flex items-center gap-3">
                      {renderContainerIcon(container)}
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-900 dark:text-white truncate flex items-center gap-2">
                          {container.name}
                          {displayedHaveUpdate(container) && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300">NEW</span>}
                          {isUpdateIgnored(container) && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">忽略</span>}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[260px]">{container.id?.slice(0, 12)}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <span className={cn("h-2.5 w-2.5 rounded-full", getStatusColor(container.status))} />
                      {container.status === 'running' ? '运行中' : '已停止'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm max-w-[280px] truncate" title={getContainerImageRef(container)}>
                    <button onClick={(e) => { e.stopPropagation(); setSelectedContainer(container) }} className="truncate text-primary-600 dark:text-primary-400 hover:underline font-medium text-left">
                      {getContainerImageRef(container)}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">{container.createTime || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">
                    {container.status === 'running' ? (
                      formatRunningTime(container.runningTime)
                    ) : (() => {
                      const [exitCode, exitAgo] = splitStoppedRuntime(container.runningTime)
                      return (
                        <div className="leading-5" title={container.runningTime || '-'}>
                          {exitCode && <div className="font-medium text-red-600 dark:text-red-400">{exitCode}</div>}
                          <div>{exitAgo}</div>
                        </div>
                      )
                    })()}
                  </td>
                  <td className="px-2 py-3 whitespace-nowrap min-w-[190px]" onClick={(e) => e.stopPropagation()}>
                    {renderTableActionButtons(container)}
                  </td>
                  <td className="px-3 py-3 min-w-[220px]">
                    <div className="flex items-center gap-2">
                      <span className="w-9 text-xs font-semibold text-gray-700 dark:text-gray-300 text-right">{progressPercent}%</span>
                      <div className="h-2.5 w-40 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div className={cn("h-full rounded-full transition-all duration-500", progressPercent > 0 ? "bg-primary-500" : "bg-gray-300 dark:bg-gray-600")} style={{ width: `${progressPercent}%` }} />
                      </div>
                    </div>
                    {getContainerActionState(container)?.progress && <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 truncate max-w-[220px]" title={getContainerActionState(container).progress}>{firstWord(getContainerActionState(container).progress)}</div>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )


  if (isLoading) {
    return (
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-4">
        <div className="animate-pulse space-y-4">
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
    <div className="max-w-[1800px] mx-auto">
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes bounceArrow {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
      `}</style>

      {/* 自定义确认弹窗 */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                {confirmModal.title}
              </h3>
              <button
                onClick={() => {
                  if (confirmModal.onCancel) confirmModal.onCancel();
                  setConfirmModal({ isOpen: false });
                }}
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
                onClick={() => {
                  if (confirmModal.onCancel) confirmModal.onCancel();
                  setConfirmModal({ isOpen: false });
                }}
                className="btn-secondary"
              >
                取消
              </button>
              <button
                onClick={() => {
                  if (confirmModal.onConfirm) confirmModal.onConfirm();
                }}
                className={cn(
                  "btn-primary",
                  confirmModal.type === 'danger' && "bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600"
                )}
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 页面标题和操作 */}
      <div className="px-2 sm:px-6 py-4 pt-4 sm:pt-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">容器管理</h2>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              管理您的Docker容器，包括启动、停止、重启等操作
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 sm:max-w-[78%]">
            {viewMode === 'card' && (
              <button
                onClick={() => {
                  setIsBatchMode(!isBatchMode)
                  if (isBatchMode) setSelectedContainers([])
                }}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm font-medium"
              >
                <CheckSquare className="h-4 w-4" />
                <span>{isBatchMode ? '退出批量' : '批量操作'}</span>
              </button>
            )}
            {(viewMode === 'table' || isBatchMode || selectedContainers.length > 0) && (
              <>
                <button
                  className="flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/60 transition-colors text-sm font-medium"
                  onClick={toggleSelectAll}
                  title={filteredContainers.length > 0 && filteredContainers.every(c => selectedContainers.includes(c.id)) ? '取消全选' : '全选'}
                >
                  <span>{filteredContainers.length > 0 && filteredContainers.every(c => selectedContainers.includes(c.id)) ? '取消全选' : '全选'}</span>
                </button>
                <button
                  className={topButtonClass('bg-primary-600 hover:bg-primary-700 text-white', selectedContainers.length === 0)}
                  disabled={selectedContainers.length === 0}
                  onClick={() => handleBatchAction('start')}
                  title="启动"
                >
                  <Play className="h-4 w-4" />
                  <span>启动</span>
                </button>
                <button
                  className={topButtonClass('bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200 hover:bg-red-200 dark:hover:bg-red-900/60', selectedContainers.length === 0)}
                  disabled={selectedContainers.length === 0}
                  onClick={() => handleBatchAction('stop')}
                  title="停止"
                >
                  <Square className="h-4 w-4" />
                  <span>停止</span>
                </button>
                <button
                  className={topButtonClass('bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200 hover:bg-blue-200 dark:hover:bg-blue-900/60', selectedContainers.length === 0)}
                  disabled={selectedContainers.length === 0}
                  onClick={() => handleBatchAction('restart')}
                  title="重启"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span>重启</span>
                </button>
                <button
                  className={topButtonClass('bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200 hover:bg-emerald-200 dark:hover:bg-emerald-900/60', selectedContainers.length === 0 || hasSelectedIgnored)}
                  disabled={selectedContainers.length === 0 || hasSelectedIgnored}
                  onClick={() => handleBatchAction('update')}
                  title={hasSelectedIgnored ? '已选择忽略更新的容器，请先取消忽略' : '更新'}
                >
                  <Upload className="h-4 w-4" />
                  <span>更新</span>
                </button>
                <button
                  className={topButtonClass(hasSelectedIgnored ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200 hover:bg-amber-200 dark:hover:bg-amber-900/60' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-200 hover:bg-yellow-200 dark:hover:bg-yellow-900/60', selectedContainers.length === 0)}
                  disabled={selectedContainers.length === 0}
                  onClick={async () => {
                    if (hasSelectedIgnored) {
                      await unignoreSelected()
                    } else {
                      const selected = containers.filter(c => selectedContainers.includes(c.id))
                      await saveUpdateBlacklist([...updateBlacklist, ...selected.flatMap(getBlacklistCandidates)])
                      setSelectedContainers([])
                    }
                  }}
                  title={hasSelectedIgnored ? '取消忽略' : '忽略更新'}
                >
                  <Ban className="h-4 w-4" />
                  <span>{hasSelectedIgnored ? '取消忽略' : '忽略'}</span>
                </button>
              </>
            )}

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
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 text-sm font-medium"
              onClick={handleRefresh}
              disabled={isRefreshing}
              title="刷新页面并检测容器更新"
            >
              <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
              <span>刷新</span>
            </button>
            <div className={cn('relative', viewMode === 'table' ? 'flex-1 min-w-[220px]' : '')}>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="搜索容器/镜像/状态"
                className="w-full sm:w-64 pl-9 pr-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>
      </div>

      {isRefreshing && containers.length > 0 && (
        <div className="mx-2 sm:mx-6 my-3 rounded-3xl border border-primary-200/70 dark:border-primary-800/70 bg-primary-50/80 dark:bg-primary-950/30 p-8 shadow-inner overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 dark:via-white/5 to-transparent animate-pulse"></div>
          <div className="relative flex items-center justify-center gap-3 text-primary-700 dark:text-primary-300 font-medium">
            <RefreshCw className="h-5 w-5 animate-spin" />
            <span>正在刷新容器状态、镜像信息和列表元素...</span>
          </div>
        </div>
      )}

      {/* 统计信息 */}
      <div className="px-2 sm:px-6 py-4">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-0 rounded-3xl overflow-hidden shadow-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 min-h-[116px]">
          {/* 总容器数 */}
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
                {containers.length}
              </div>
              <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">总容器</div>
            </div>
          </button>

          {/* 运行中 */}
          <button
            onClick={() => setFilterStatus('running')}
            className={cn(
              "p-4 sm:p-6 text-center transition-all duration-300 relative overflow-hidden group border-r border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center",
              filterStatus === 'running' ? "bg-green-50 dark:bg-green-900/20" : "hover:bg-gray-50 dark:hover:bg-gray-700/50"
            )}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative">
              <div className="text-2xl sm:text-3xl font-bold text-green-600 dark:text-green-400 transition-transform duration-300 group-hover:scale-110">
                {containers.filter(c => c.status === 'running').length}
              </div>
              <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">运行中</div>
            </div>
          </button>

          {/* 已停止 */}
          <button
            onClick={() => setFilterStatus('stopped')}
            className={cn(
              "p-4 sm:p-6 text-center transition-all duration-300 relative overflow-hidden group border-r border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center",
              filterStatus === 'stopped' ? "bg-red-50 dark:bg-red-900/20" : "hover:bg-gray-50 dark:hover:bg-gray-700/50"
            )}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative">
              <div className="text-2xl sm:text-3xl font-bold text-red-600 dark:text-red-400 transition-transform duration-300 group-hover:scale-110">
                {containers.filter(c => c.status && c.status.toLowerCase() !== 'running').length}
              </div>
              <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">已停止</div>
            </div>
          </button>

          {/* 有更新 */}
          <button
            onClick={() => setFilterStatus('update')}
            className={cn(
              "p-4 sm:p-6 text-center transition-all duration-300 relative overflow-hidden group flex flex-col items-center justify-center",
              filterStatus === 'update' ? "bg-yellow-50 dark:bg-yellow-900/20" : "hover:bg-gray-50 dark:hover:bg-gray-700/50"
            )}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative">
              <div className="text-2xl sm:text-3xl font-bold text-yellow-600 dark:text-yellow-400 transition-transform duration-300 group-hover:scale-110">
                {containers.filter(c => visibleInUpdateFilter(c)).length}
              </div>
              <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">有更新</div>
            </div>
          </button>

          {/* 更新黑名单 */}
          <button
            onClick={() => setFilterStatus('ignored')}
            className={cn(
              "p-4 sm:p-6 text-center transition-all duration-300 relative overflow-hidden group flex flex-col items-center justify-center",
              filterStatus === 'ignored' ? "bg-gray-100 dark:bg-gray-700/50" : "hover:bg-gray-50 dark:hover:bg-gray-700/50"
            )}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-gray-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative">
              <div className="text-2xl sm:text-3xl font-bold text-gray-600 dark:text-gray-300 transition-transform duration-300 group-hover:scale-110">
                {updateBlacklist.length}
              </div>
              <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">更新黑名单</div>
            </div>
          </button>
        </div>
      </div>

      {/* 容器列表 */}
      <div className="px-2 sm:px-6 py-4">
        {(filterStatus || selectedContainers.length > 0) && (
          <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-blue-700 dark:text-blue-300">
                  {filterStatus && (
                    <>
                      筛选中：
                      {filterStatus === 'running' && '运行中容器 '}
                      {filterStatus === 'stopped' && '已停止容器 '}
                      {filterStatus === 'update' && '有更新容器 '}
                      {filterStatus === 'ignored' && '更新黑名单 '}
                    </>
                  )}
                  {!filterStatus && selectedContainers.length > 0 && (
                    <>
                      已选中 {selectedContainers.length} 个容器（使用 Ctrl/Cmd+点击 来切换选择，或直接点击卡片打开详情）
                    </>
                  )}
                  {filterStatus && selectedContainers.length > 0 && (
                    <>
                      &nbsp;·&nbsp;已选中 {selectedContainers.length} 个容器
                    </>
                  )}
                </span>
                {filterStatus && (
                  <>
                    <button
                      onClick={() => {
                        setFilterStatus(null)
                        setSelectedContainers([])
                        setIsBatchMode(false)
                      }}
                      className="px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-100 bg-blue-100 dark:bg-blue-800/50 rounded transition-colors"
                    >
                      清除筛选
                    </button>
                    <button
                      onClick={() => {
                        const filteredContainers = renderedContainers.filter((container) => {
                          if (!filterStatus) return true
                          if (filterStatus === 'running') return container.status && container.status.toLowerCase() === 'running'
                          if (filterStatus === 'stopped') return container.status && container.status.toLowerCase() !== 'running'
                          if (filterStatus === 'update') return visibleInUpdateFilter(container)
                          if (filterStatus === 'ignored') return isUpdateIgnored(container)
                          return true
                        })
                        setSelectedContainers(filteredContainers.map(c => c.id))
                        setIsBatchMode(true)
                      }}
                      className="px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-100 bg-blue-100 dark:bg-blue-800/50 rounded transition-colors"
                    >
                      全选结果
                    </button>
                    {(filterStatus === 'update' || filterStatus === null) && (
                      <button
                        onClick={() => saveUpdateBlacklist([...updateBlacklist, ...renderedContainers.map(getBlacklistKey)])}
                        className="px-2 py-0.5 text-xs font-medium text-gray-700 dark:text-gray-200 hover:text-gray-900 dark:hover:text-white bg-gray-100 dark:bg-gray-700 rounded transition-colors"
                      >
                        忽略全部
                      </button>
                    )}
                    {filterStatus === 'ignored' && (
                      <button
                        onClick={() => saveUpdateBlacklist(updateBlacklist.filter(item => !renderedContainers.some(container => matchesBlacklistItem(container, item))))}
                        className="px-2 py-0.5 text-xs font-medium text-gray-700 dark:text-gray-200 hover:text-gray-900 dark:hover:text-white bg-gray-100 dark:bg-gray-700 rounded transition-colors"
                      >
                        取消忽略
                      </button>
                    )}
                  </>
                )}
              </div>
              {selectedContainers.length > 0 && !filterStatus && (
                <button
                  onClick={() => setSelectedContainers([])}
                  className="px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-100 bg-blue-100 dark:bg-blue-800/50 rounded transition-colors"
                >
                  取消选择
                </button>
              )}
            </div>
          </div>
        )}

        {containers.length > 0 ? (
          viewMode === 'table' ? renderTableView() : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-4">
            {renderedContainers.map((container) => {
                const isSelected = selectedContainers.includes(container.id)
                return (
                  <div key={getContainerRenderKey(container)} className="group">
                    {/* 容器卡片 - 简化设计，点击调起详情 */}
                    <div
                      onClick={(e) => {
                        // 如果启用批量模式，点击选择；否则打开详情
                        if (e.metaKey || e.ctrlKey || isBatchMode) {
                          e.stopPropagation()
                          toggleContainerSelection(container.id)
                        } else {
                          setSelectedContainer(container)
                        }
                      }}
                      className={cn(
                        "card relative overflow-hidden transition-all duration-200 hover:shadow-lg border rounded-2xl p-4 min-h-[188px] cursor-pointer active:scale-98",
                        isSelected
                          ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20 shadow-md"
                          : isUpdateIgnored(container)
                            ? "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 hover:border-gray-300 dark:hover:border-gray-600"
                            : "border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-600"
                      )}
                    >
                      {(isBatchMode || selectedContainers.length > 0) && (
                        <div className="absolute top-3 right-3 z-30" onClick={(e) => e.stopPropagation()}>
                          <label className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white/95 dark:bg-gray-900/90 border border-primary-200 dark:border-primary-700 shadow cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleContainerSelection(container.id)}
                              className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                            />
                          </label>
                        </div>
                      )}
                      {/* 背景进度条 */}
                      {getContainerActionState(container)?.action === 'update' && (getContainerActionState(container)?.loading || getContainerActionState(container)?.done) && (
                        <div className="absolute inset-0 pointer-events-none rounded-2xl overflow-hidden">
                          <div
                            className={cn("absolute top-0 left-0 bottom-0 transition-all duration-500 ease-out", getContainerActionState(container)?.done ? "bg-gradient-to-r from-green-500/25 via-green-400/25 to-green-500/25" : "bg-gradient-to-r from-primary-500/30 via-primary-400/30 to-primary-500/30")}
                            style={{
                              width: `${getContainerActionState(container).percentage || 0}%`
                            }}
                          >
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer"
                              style={{
                                backgroundSize: '200% 100%',
                                animation: 'shimmer 2s infinite linear'
                              }} />
                          </div>
                        </div>
                      )}

                      {/* NEW (有更新时显示) */}
                      {displayedHaveUpdate(container) && (
                        <div className="absolute -top-[2px] -right-[2px] w-[80px] h-[80px] pointer-events-none overflow-hidden z-20 rounded-tr-2xl">
                          <div className="absolute top-0 right-0 w-full h-full flex items-center justify-center">
                            <div className="absolute transform rotate-45 translate-x-[26px] -translate-y-[26px] w-[120px] h-[24px] bg-gradient-to-r from-yellow-400 to-yellow-500 dark:from-yellow-500 dark:to-yellow-600 shadow-sm flex items-center justify-center">
                              <span className="relative text-[10px] font-bold text-white tracking-widest uppercase w-full text-center">
                                NEW
                                {/* 流光效果 */}
                                <div className="absolute top-0 left-0 animate-flow-light"></div>
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {isUpdateIgnored(container) && (
                        <div className="absolute -top-[2px] -right-[2px] w-[86px] h-[86px] pointer-events-none overflow-hidden z-20 rounded-tr-2xl">
                          <div className="absolute top-0 right-0 w-full h-full flex items-center justify-center">
                            <div className="absolute transform rotate-45 translate-x-[28px] -translate-y-[28px] w-[128px] h-[24px] bg-gradient-to-r from-gray-400 to-gray-500 dark:from-gray-600 dark:to-gray-700 shadow-sm flex items-center justify-center">
                              <span className="relative text-[10px] font-bold text-white tracking-widest w-full text-center">忽略</span>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="relative z-10 flex items-center gap-3">
                        {/* 图标 */}
                        <div className="flex-shrink-0">
                          {(() => {
                            const imageRef = getContainerImageRef(container);
                            let iconUrl = container.iconUrl;
                            if (!iconUrl && imageRef) {
                              const builtInLogo = getImageLogo(imageRef);
                              if (builtInLogo) {
                                iconUrl = builtInLogo;
                              } else {
                                // 如果没有内置logo，则尝试从用户自定义中查找
                                // const imageLogos = JSON.parse(localStorage.getItem('docker_copilot_image_logos') || '{}');
                                // 使用 React Query 获取的数据
                                const imageLogos = customIcons;

                                for (const [imageName, logoUrl] of Object.entries(imageLogos)) {
                                  if (imageRef.startsWith(imageName) ||
                                    imageRef.includes(`${imageName}:`)) {
                                    iconUrl = logoUrl;
                                    break;
                                  }
                                }
                              }
                            }

                            if (iconUrl) {
                              return (
                                <img
                                  src={iconUrl}
                                  alt={container.name}
                                  className="h-12 w-12 rounded-xl object-cover shadow-sm flex-shrink-0"
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                    e.target.parentElement.innerHTML = `
                                    <div class="h-12 w-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-sm">
                                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-6 w-6 text-white">
                                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path>
                                      </svg>
                                    </div>
                                  `;
                                  }}
                                />
                              );
                            } else {
                              return (
                                <div className="h-12 w-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-sm flex-shrink-0">
                                  <Package className="h-6 w-6 text-white" />
                                </div>
                              );
                            }
                          })()}
                        </div>

                        {/* 状态指示器（放在图标和信息之间） */}
                        <div className="flex-shrink-0 flex items-center">
                          <div className={cn(
                            "w-1 h-8 rounded-full",
                            getStatusIndicatorColor(container.status)
                          )} />
                        </div>

                        {/* 容器信息 */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center">
                                <h3 className="font-semibold text-gray-900 dark:text-white truncate text-base group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                                  {container.name}
                                </h3>
                              </div>
                              <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                                {container.usingImage}
                              </p>
                            </div>
                          </div>

                          {/* 统一高度的信息行 - 显示运行时间或状态 */}
                          <div className="h-5 mt-1">
                            {getContainerActionState(container)?.action === 'update' && (getContainerActionState(container)?.loading || getContainerActionState(container)?.done) && getContainerActionState(container)?.progress ? (
                              <p className={cn("text-xs truncate flex items-center gap-1", getContainerActionState(container)?.done ? "text-green-600 dark:text-green-400" : "text-blue-600 dark:text-blue-400")}>
                                {getContainerActionState(container)?.done ? <span className="h-3 w-3 flex-shrink-0 text-center leading-3">✓</span> : <RefreshCw className="h-3 w-3 animate-spin flex-shrink-0" />}
                                <span>{getContainerActionState(container).progress}</span>
                              </p>
                            ) : container.status === 'running' ? (
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                运行: {formatRunningTime(container.runningTime)}
                              </div>
                            ) : (
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                状态: 已停止
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* 操作按钮栏 - 底部水平排列 */}
                      {!isBatchMode && (
                        <div className="flex gap-1 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700/50">
                          {getContainerActionState(container)?.loading || getContainerActionState(container)?.done ? (
                            <div className={cn("flex-1 flex items-center justify-center space-x-2 px-1 py-1.5 rounded-lg border whitespace-nowrap", getContainerActionState(container)?.done ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800" : "bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800")}>
                              {getContainerActionState(container)?.done ? <span className="h-4 w-4 text-green-600 dark:text-green-400 text-center leading-4">✓</span> : <RefreshCw className="h-4 w-4 animate-spin text-primary-600 dark:text-primary-400" />}
                              <span className={cn("text-xs font-medium", getContainerActionState(container)?.done ? "text-green-600 dark:text-green-400" : "text-primary-600 dark:text-primary-400")}>
                                {getContainerActionState(container).action === 'start' && '启动中'}
                                {getContainerActionState(container).action === 'stop' && '停止中'}
                                {getContainerActionState(container).action === 'restart' && '重启中'}
                                {getContainerActionState(container).action === 'update' && (getContainerActionState(container)?.done ? (getContainerActionState(container).progress || '更新完成') : `更新中${getContainerActionState(container).percentage ? ` ${Math.round(getContainerActionState(container).percentage)}%` : ''}`)}
                                {getContainerActionState(container).action === 'delete' && '删除中'}
                              </span>
                            </div>
                          ) : (
                            <>
                              {container.status === 'running' ? (
                                <>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleContainerAction(container.id, 'stop') }}
                                    className="flex-1 flex items-center justify-center gap-1 px-1 py-1.5 text-red-600 dark:text-red-400 bg-white dark:bg-gray-800 hover:bg-red-50 dark:hover:bg-red-900/20 border border-gray-200 dark:border-gray-700 hover:border-red-200 dark:hover:border-red-800 rounded-lg transition-all duration-200 shadow-sm hover:shadow active:scale-95 text-xs font-medium whitespace-nowrap"
                                    title="停止"
                                  >
                                    <Square className="h-4 w-4" />
                                    <span>停止</span>
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleContainerAction(container.id, 'restart') }}
                                    className="flex-1 flex items-center justify-center gap-1 px-1 py-1.5 text-blue-600 dark:text-blue-400 bg-white dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-gray-200 dark:border-gray-700 hover:border-blue-200 dark:hover:border-blue-800 rounded-lg transition-all duration-200 shadow-sm hover:shadow active:scale-95 text-xs font-medium whitespace-nowrap"
                                    title="重启"
                                  >
                                    <RotateCcw className="h-4 w-4" />
                                    <span>重启</span>
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleContainerAction(container.id, 'start') }}
                                    className="flex-1 flex items-center justify-center gap-1 px-1 py-1.5 text-green-600 dark:text-green-400 bg-white dark:bg-gray-800 hover:bg-green-50 dark:hover:bg-green-900/20 border border-gray-200 dark:border-gray-700 hover:border-green-200 dark:hover:border-green-800 rounded-lg transition-all duration-200 shadow-sm hover:shadow active:scale-95 text-xs font-medium whitespace-nowrap"
                                    title="启动"
                                  >
                                    <Play className="h-4 w-4" />
                                    <span>启动</span>
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleDeleteContainer(container) }}
                                    className="flex-1 flex items-center justify-center gap-1 px-1 py-1.5 text-white bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-500 border border-red-500 dark:border-red-600 rounded-lg transition-all duration-200 shadow-sm hover:shadow active:scale-95 text-xs font-medium whitespace-nowrap"
                                    title="删除已停止容器"
                                  >
                                    <X className="h-4 w-4" />
                                    <span>删除</span>
                                  </button>
                                </>
                              )}

                              <button
                                onClick={(e) => { e.stopPropagation(); handleUpdateContainer(container.id) }}
                                disabled={isUpdateIgnored(container)}
                                className={cn(
                                  "flex-1 flex items-center justify-center gap-1 px-1 py-1.5 border rounded-lg transition-all duration-200 shadow-sm text-xs font-medium whitespace-nowrap",
                                  isUpdateIgnored(container)
                                    ? "text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 cursor-not-allowed opacity-70"
                                    : displayedHaveUpdate(container)
                                      ? "text-yellow-600 dark:text-yellow-400 bg-white dark:bg-gray-800 border-yellow-400 dark:border-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 hover:shadow active:scale-95"
                                      : "text-purple-600 dark:text-purple-400 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:border-purple-200 dark:hover:border-purple-800 hover:shadow active:scale-95"
                                )}
                                title={isUpdateIgnored(container) ? '已忽略更新，无法更新；请先取消忽略' : '更新'}
                              >
                                <Upload className="h-4 w-4" />
                                <span>更新</span>
                              </button>
                              {isUpdateIgnored(container) ? (
                                <button
                                  onClick={(e) => { e.stopPropagation(); unignoreUpdate(container) }}
                                  className="flex-1 flex items-center justify-center gap-1 px-1 py-1.5 text-gray-700 dark:text-gray-200 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-600 rounded-lg transition-all duration-200 shadow-sm hover:shadow active:scale-95 text-xs font-semibold whitespace-nowrap"
                                  title="取消忽略更新"
                                >
                                  <Undo2 className="h-4 w-4" />
                                  <span>取消</span>
                                </button>
                              ) : (
                                <button
                                  onClick={(e) => { e.stopPropagation(); ignoreUpdate(container) }}
                                  className="flex-1 flex items-center justify-center gap-1 px-1 py-1.5 text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg transition-all duration-200 shadow-sm hover:shadow active:scale-95 text-xs font-medium whitespace-nowrap"
                                  title="忽略更新"
                                >
                                  <Ban className="h-4 w-4" />
                                  <span>忽略</span>
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
          </div>
          )
        ) : (
          <div className="text-center py-12">
            <Package className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">暂无容器</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              当前没有运行中的Docker容器
            </p>
          </div>
        )}
      </div>

      {/* 容器详情弹窗 */}
      {
        selectedContainer && (
          <ContainerDetailModal
            container={selectedContainer}
            onClose={() => setSelectedContainer(null)}
            onRename={handleRenameContainer}
            onUpdate={handleUpdateContainer}
            onAction={handleContainerAction}
            isUpdateIgnored={isUpdateIgnored}
            onIgnore={ignoreUpdate}
            onUnignore={unignoreUpdate}
          />
        )
      }
    </div >
  )
}

// 容器详情弹窗组件
function ContainerDetailModal({ container, onClose, onRename, onUpdate, onAction, isUpdateIgnored, onIgnore, onUnignore }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(container.name)
  const [imageNameAndTag, setImageNameAndTag] = useState(container.usingImage)
  const [isUpdating, setIsUpdating] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [isActionProcessing, setIsActionProcessing] = useState(false)
  const [currentAction, setCurrentAction] = useState('')
  const [currentContainer, setCurrentContainer] = useState(container)
  const fileInputRef = React.useRef(null)
  const [isUploadingIcon, setIsUploadingIcon] = useState(false)
  const ignored = isUpdateIgnored(currentContainer)

  // 获取自定义图标配置
  const { data: customIcons = {} } = useQuery({
    queryKey: ['customIcons'],
    queryFn: async () => {
      const response = await imageAPI.getIcons()
      if (response.data.code === 200 || response.data.code === 0) {
        return response.data.data || {}
      }
      return {}
    },
    initialData: () => JSON.parse(localStorage.getItem('docker_copilot_image_logos') || '{}'),
  })

  // 当容器切换时，更新表单字段的值
  React.useEffect(() => {
    setName(container.name)
    setImageNameAndTag(container.usingImage)
    setCurrentContainer(container)
  }, [container])

  // 实时更新容器状态
  React.useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const response = await containerAPI.getContainers();
        if (response.data.code === 0) {
          const containers = response.data.data;
          const updatedContainer = containers.find(c => c.id === container.id);
          if (updatedContainer) {
            // 检查是否有镜像图标
            const imageLogos = JSON.parse(localStorage.getItem('docker_copilot_image_logos') || '{}');

            // 如果容器没有自定义图标，则查找镜像图标
            if (!updatedContainer.iconUrl) {
              // 使用完整的镜像名称和标签进行匹配
              const imageFullName = updatedContainer.usingImage;

              // 首先尝试精确匹配（包含tag）
              if (imageLogos[imageFullName]) {
                updatedContainer.iconUrl = imageLogos[imageFullName];
              } else {
                // 如果精确匹配失败，尝试镜像名称匹配（不包含tag部分）
                const imageName = updatedContainer.usingImage.split(':')[0];

                // 遍历所有镜像图标，查找匹配的镜像名称
                for (const [imageId, logoUrl] of Object.entries(imageLogos)) {
                  // 检查镜像名称是否匹配（不包含tag部分）
                  const logoImageName = imageId.split(':')[0];
                  if (imageName === logoImageName) {
                    updatedContainer.iconUrl = logoUrl;
                    break;
                  }
                }
              }
            }

            setCurrentContainer(updatedContainer);
          }
        }
      } catch (error) {
        console.error('获取容器状态失败:', error);
      }
    }, 3000); // 每3秒获取一次最新状态

    return () => clearInterval(interval);
  }, [container.id]);

  const handleIconUpload = async (event) => {
    const file = event.target.files[0]
    if (!file) return

    // 限制文件大小 (例如 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setConfirmModal({
        isOpen: true,
        title: '上传失败',
        message: '图标文件大小不能超过 2MB',
        onConfirm: () => setConfirmModal({ isOpen: false }),
        onCancel: null,
        type: 'danger'
      })
      event.target.value = '' // 重置 input
      return
    }

    try {
      setIsUploadingIcon(true)
      // 使用容器当前的镜像名作为 Key
      // 如果有自定义镜像名配置(容器更新时可能改变)，优先使用新的
      const targetImageName = imageNameAndTag || currentContainer.usingImage

      const response = await imageAPI.uploadIcon(file, targetImageName, currentContainer.name)

      if (response.data.code === 200 || response.data.code === 0) {
        // 上传成功，更新 localStorage
        const filename = response.data.data // 后端返回的文件名
        if (filename) {
          const newPath = `/src/config/image/${filename}`
          const imageLogos = JSON.parse(localStorage.getItem('docker_copilot_image_logos') || '{}')

          // 更新映射: 镜像名 -> 新路径
          imageLogos[targetImageName] = newPath
          localStorage.setItem('docker_copilot_image_logos', JSON.stringify(imageLogos))

          // 强制更新当前容器视图
          setCurrentContainer(prev => ({
            ...prev,
            iconUrl: newPath
          }))

          // 触发全局事件以便其他组件（如列表）更新
          window.dispatchEvent(new Event('storage'))

          // 无效化查询以刷新列表和图标
          await queryClient.invalidateQueries(['containers'])
          await queryClient.invalidateQueries(['customIcons'])

          console.log('✅ 图标上传成功并已应用')
        }
      } else {
        throw new Error(response.data.msg || '上传失败')
      }
    } catch (error) {
      console.error('图标上传失败:', error)
      setConfirmModal({
        isOpen: true,
        title: '上传失败',
        message: '图标上传失败: ' + (error.response?.data?.msg || error.message),
        onConfirm: () => setConfirmModal({ isOpen: false }),
        onCancel: null,
        type: 'danger'
      })
    } finally {
      setIsUploadingIcon(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleContainerAction = async (action) => {
    try {
      setIsActionProcessing(true);
      setCurrentAction(action);

      // 调用传入的onAction函数执行实际操作
      if (action === 'update') {
        await onUpdate(container.id);
      } else {
        await onAction(container.id, action);
      }

      // 无效化查询以触发重新获取数据
      await queryClient.invalidateQueries(['containers'])

      setIsActionProcessing(false);
      setCurrentAction('');
    } catch (error) {
      console.error('操作失败:', error);
      setIsActionProcessing(false);
      setCurrentAction('');
    }
  };

  const handleRename = async () => {
    if (name !== currentContainer.name) {
      try {
        setIsRenaming(true)
        console.log(`重命名容器: ${currentContainer.name} -> ${name}`)

        await onRename(container.id, name)

        // 无效化查询以触发重新获取数据
        await queryClient.invalidateQueries(['containers'])

        // 更新当前容器状态
        setCurrentContainer({ ...currentContainer, name: name })
        // 同时更新表单中的名称
        setName(name);

        console.log('✅ 容器重命名成功')
        setIsRenaming(false)
      } catch (error) {
        console.error('重命名失败:', error)
        setIsRenaming(false)
      }
    }
  }

  const handleSave = async () => {
    // 如果镜像tag发生变化，则更新容器
    if (imageNameAndTag !== currentContainer.usingImage) {
      try {
        setIsUpdating(true)

        console.log(`开始更新容器镜像: ${currentContainer.name}`)
        console.log(`原镜像: ${currentContainer.usingImage}`)
        console.log(`新镜像: ${imageNameAndTag}`)

        // 直接调用API更新容器
        const response = await containerAPI.updateContainer(
          container.id,
          container.name,
          imageNameAndTag,
          true // 删除旧容器
        )

        console.log('更新容器响应:', response.data)

        if (response.data.code === 200 || response.data.code === 0) {
          const taskID = response.data.data?.taskID

          if (taskID) {
            // 如果返回了taskID，我们需要触发进度轮询
            console.log('更新任务已创建，taskID:', taskID)

            // 关闭弹窗
            onClose()

            // 触发父组件中的进度轮询
            onUpdate(container.id, taskID)

            console.log('✅ 容器更新任务已启动，请在列表中查看进度')
          } else {
            // 没有taskID，更新完成
            await queryClient.invalidateQueries(['containers'])
            setImageNameAndTag(imageNameAndTag) // 更新本地状态
            console.log('✅ 容器镜像更新完成')
          }
        } else {
          throw new Error(response.data.msg || '更新失败')
        }

        setIsUpdating(false)
      } catch (error) {
        console.error('更新容器镜像失败:', error)
        // 增加超时错误的处理
        if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
          console.error(`更新操作已提交，但连接超时。请稍后手动刷新页面查看操作结果`)
          // 即使超时也关闭弹窗并触发轮询，因为操作可能仍在进行中
          onClose()
          onUpdate(container.id)
        }
        setIsUpdating(false)
      }
    }
  }





  // 获取状态指示器颜色
  const getStatusIndicatorColor = (status) => {
    const statusConfig = {
      running: 'bg-green-500',
      stopped: 'bg-red-500',
      restarting: 'bg-yellow-500',
      paused: 'bg-blue-500'
    }

    return statusConfig[status?.toLowerCase()] || 'bg-gray-500'
  }

  // 获取容器图标 - 与列表显示逻辑一致
  const getContainerIcon = () => {
    let iconUrl = currentContainer.iconUrl;

    // 如果容器没有自定义图标，则查找镜像图标
    if (!iconUrl && currentContainer.usingImage) {
      // 优先使用内置logo配置（不依赖localStorage）
      const builtInLogo = getImageLogo(currentContainer.usingImage);
      if (builtInLogo) {
        iconUrl = builtInLogo;
      } else {
        // 如果没有内置logo，则尝试从用户自定义中查找
        // const imageLogos = JSON.parse(localStorage.getItem('docker_copilot_image_logos') || '{}');
        const imageLogos = customIcons;
        const imageFullName = currentContainer.usingImage;

        if (imageLogos[imageFullName]) {
          iconUrl = imageLogos[imageFullName];
        } else {
          // 降级匹配逻辑
          const imageName = imageFullName.split(':')[0];
          for (const [imageId, logoUrl] of Object.entries(imageLogos)) {
            if (imageId === imageName || imageFullName.startsWith(imageId)) {
              iconUrl = logoUrl;
              break;
            }
          }
        }
      }
    }

    const IconContent = () => {
      if (iconUrl) {
        return (
          <img
            src={iconUrl}
            alt={currentContainer.name}
            className="h-12 w-12 rounded-xl object-cover"
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.nextSibling.style.display = 'flex';
            }}
          />
        );
      }
      return null;
    };

    const FallbackIcon = () => (
      <div className="h-12 w-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl flex items-center justify-center text-white" style={{ display: iconUrl ? 'none' : 'flex' }}>
        <Package className="h-6 w-6" />
      </div>
    );

    return (
      <div
        className="relative group cursor-pointer"
        onClick={() => !isUploadingIcon && fileInputRef.current?.click()}
        title="点击上传自定义图标"
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleIconUpload}
          className="hidden"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
        />

        <IconContent />
        <FallbackIcon />

        {/* 悬停覆盖层 */}
        <div className="absolute inset-0 bg-black bg-opacity-50 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          {isUploadingIcon ? (
            <RefreshCw className="h-5 w-5 text-white animate-spin" />
          ) : (
            <Upload className="h-5 w-5 text-white" />
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        {/* 弹窗头部 */}
        <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">容器详情</h3>
              <div className="flex items-center mt-1">
                {getContainerIcon()}
                {/* 状态指示器竖线 */}
                <div className="flex flex-col items-center justify-center h-full ml-3">
                  <div className={cn(
                    "w-1 h-8 rounded-full",
                    getStatusIndicatorColor(currentContainer.status)
                  )}></div>
                </div>
                <div className="ml-3">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {currentContainer.name}
                  </span>
                  <div className="flex items-center mt-1">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {currentContainer.id.substring(0, 12)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* 弹窗内容 */}
        <div className="px-6 py-4 space-y-4">
          {/* 容器名称 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              容器名称
            </label>
            <div className="flex space-x-2">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input flex-1"
                placeholder="输入容器名称"
              />
              <button
                onClick={handleRename}
                disabled={isRenaming || (name === currentContainer.name) || isActionProcessing || isUpdating}
                className={`px-3 py-2 text-sm rounded-lg transition-colors ${isRenaming || (name === currentContainer.name)
                  ? 'bg-gray-200 text-gray-500 cursor-not-allowed dark:bg-gray-700 dark:text-gray-400'
                  : 'bg-primary-600 text-white hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600'
                  }`}
              >
                {isRenaming ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                    重命名中
                  </>
                ) : '重命名'}
              </button>
            </div>
          </div>

          {/* 镜像信息 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              镜像名称和标签
            </label>
            <div className="flex space-x-2">
              <input
                type="text"
                value={imageNameAndTag}
                onChange={(e) => setImageNameAndTag(e.target.value)}
                className="input flex-1"
                placeholder="例如: nginx:latest"
                disabled={isActionProcessing || isUpdating}
              />
              <button
                onClick={handleSave}
                disabled={isUpdating || (imageNameAndTag === currentContainer.usingImage) || !imageNameAndTag.trim()}
                className={`px-3 py-2 text-sm rounded-lg transition-colors flex items-center ${isUpdating || (imageNameAndTag === currentContainer.usingImage) || !imageNameAndTag.trim()
                  ? 'bg-gray-200 text-gray-500 cursor-not-allowed dark:bg-gray-700 dark:text-gray-400'
                  : 'bg-primary-600 text-white hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600'
                  }`}
              >
                {isUpdating ? (
                  <>
                    <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                    更新中
                  </>
                ) : (
                  '更换镜像'
                )}
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              修改镜像后点击"更换镜像"按钮将重新创建容器
            </p>
          </div>
        </div>

        {/* 弹窗底部操作按钮 */}
        <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4 bg-gray-50 dark:bg-gray-700/30">
          <div className="flex justify-end gap-2">

            <div className="flex gap-2 w-full sm:w-auto">
              <button
                onClick={() => onUpdate(container.id)}
                disabled={isActionProcessing || isUpdating || ignored}
                className={`flex-1 sm:flex-none px-2 sm:px-4 py-2 text-sm rounded-lg transition-colors flex items-center justify-center sm:justify-start gap-1 sm:gap-2 ${(isActionProcessing && currentAction === 'update') || ignored
                  ? 'bg-gray-200 text-gray-500 cursor-not-allowed dark:bg-gray-700 dark:text-gray-400'
                  : 'bg-purple-600 text-white hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600'
                  }`}
                title={ignored ? '已忽略更新，无法更新；请先取消忽略' : '更新'}
              >
                {isActionProcessing && currentAction === 'update' ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin flex-shrink-0" />
                    <span>更新中</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 flex-shrink-0" />
                    <span>更新</span>
                  </>
                )}
              </button>

              {currentContainer.status === 'running' ? (
                <>
                  <button
                    onClick={() => handleContainerAction('stop')}
                    disabled={isActionProcessing || isUpdating}
                    className={`flex-1 sm:flex-none px-2 sm:px-4 py-2 text-sm rounded-lg transition-colors flex items-center justify-center sm:justify-start gap-1 sm:gap-2 ${isActionProcessing && currentAction === 'stop'
                      ? 'bg-gray-200 text-gray-500 cursor-not-allowed dark:bg-gray-700 dark:text-gray-400'
                      : 'bg-red-600 text-white hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600'
                      }`}
                    title="停止"
                  >
                    {isActionProcessing && currentAction === 'stop' ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin flex-shrink-0" />
                        <span>停止中</span>
                      </>
                    ) : (
                      <>
                        <Square className="h-4 w-4 flex-shrink-0" />
                        <span>停止</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleContainerAction('restart')}
                    disabled={isActionProcessing || isUpdating}
                    className={`flex-1 sm:flex-none px-2 sm:px-4 py-2 text-sm rounded-lg transition-colors flex items-center justify-center sm:justify-start gap-1 sm:gap-2 ${isActionProcessing && currentAction === 'restart'
                      ? 'bg-gray-200 text-gray-500 cursor-not-allowed dark:bg-gray-700 dark:text-gray-400'
                      : 'bg-yellow-500 text-white hover:bg-yellow-600 dark:bg-yellow-500 dark:hover:bg-yellow-600'
                      }`}
                    title="重启"
                  >
                    {isActionProcessing && currentAction === 'restart' ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin flex-shrink-0" />
                        <span>重启中</span>
                      </>
                    ) : (
                      <>
                        <RotateCcw className="h-4 w-4 flex-shrink-0" />
                        <span>重启</span>
                      </>
                    )}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => handleContainerAction('start')}
                  disabled={isActionProcessing || isUpdating}
                  className={`flex-1 sm:flex-none px-2 sm:px-4 py-2 text-sm rounded-lg transition-colors flex items-center justify-center sm:justify-start gap-1 sm:gap-2 ${isActionProcessing && currentAction === 'start'
                    ? 'bg-gray-200 text-gray-500 cursor-not-allowed dark:bg-gray-700 dark:text-gray-400'
                    : 'bg-green-600 text-white hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600'
                    }`}
                  title="启动"
                >
                  {isActionProcessing && currentAction === 'start' ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin flex-shrink-0" />
                      <span>启动中</span>
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 flex-shrink-0" />
                      <span>启动</span>
                    </>
                  )}
                </button>
              )}
            </div>

            <div className="flex gap-2 w-full sm:w-auto">
              {ignored ? (
                <button
                  onClick={() => onUnignore(currentContainer)}
                  disabled={isActionProcessing || isUpdating}
                  className="flex-1 sm:flex-none px-2 sm:px-4 py-2 text-sm rounded-lg transition-colors flex items-center justify-center sm:justify-start gap-1 sm:gap-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium"
                  title="取消忽略更新"
                >
                  <Undo2 className="h-4 w-4 flex-shrink-0" />
                  <span>取消忽略</span>
                </button>
              ) : (
                <button
                  onClick={() => onIgnore(currentContainer)}
                  disabled={isActionProcessing || isUpdating}
                  className="flex-1 sm:flex-none px-2 sm:px-4 py-2 text-sm rounded-lg transition-colors flex items-center justify-center sm:justify-start gap-1 sm:gap-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
                  title="忽略更新"
                >
                  <Ban className="h-4 w-4 flex-shrink-0" />
                  <span>忽略更新</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
