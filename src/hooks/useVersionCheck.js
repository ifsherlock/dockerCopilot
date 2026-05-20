import { useEffect, useState, useCallback, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { versionAPI, programAPI } from '../api/client.js'

/**
 * 检查版本是否需要更新
 * @param {string} currentVersion 当前版本
 * @param {string} latestVersion 最新版本
 * @returns {boolean} 是否需要更新
 */
function shouldUpdate(currentVersion, latestVersion) {
  if (currentVersion === 'unknown' || latestVersion === 'unknown') {
    return false
  }

  const current = parseVersion(currentVersion)
  const latest = parseVersion(latestVersion)

  if (current === null || latest === null) {
    return false
  }

  // 比较 major.minor.patch
  if (latest.major > current.major) return true
  if (latest.major === current.major && latest.minor > current.minor) return true
  if (latest.major === current.major && latest.minor === current.minor && latest.patch > current.patch) return true

  return false
}

/**
 * 解析版本号
 * @param {string} version 版本号字符串 (e.g., "1.0.0")
 * @returns {Object|null} 解析后的版本对象或 null
 */
function parseVersion(version) {
  if (!version || typeof version !== 'string') return null

  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-.+)?$/)
  if (!match) return null

  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    raw: version,
  }
}

/**
 * 版本检查 Hook
 * 用于检查后端版本，并提示用户是否有更新
 */
export function useVersionCheck() {
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [updateMessage, setUpdateMessage] = useState('')
  const [showForceUpdate, setShowForceUpdate] = useState(false)
  const [updateProgress, setUpdateProgress] = useState(0)
  const [updateTaskId, setUpdateTaskId] = useState('')
  const [isReconnectChecking, setIsReconnectChecking] = useState(false)
  const [postUpdateNeedsRefresh, setPostUpdateNeedsRefresh] = useState(false)
  const pollTimerRef = useRef(null)
  const reconnectTimerRef = useRef(null)

  // 查询后端版本信息
  const { data: versionData, refetch } = useQuery({
    queryKey: ['version'],
    queryFn: async () => {
      try {
        // 获取本地版本信息
        const localResponse = await versionAPI.getVersion('local')

        let backendVersion = ''
        let buildDate = ''

        if (localResponse.data.code === 200 || localResponse.data.code === 0) {
          const localData = localResponse.data.data
          if (localData && typeof localData === 'object') {
            backendVersion = localData.version && String(localData.version).trim() !== '' ? String(localData.version).trim() : ''
            buildDate = localData.buildDate || ''
          } else if (typeof localData === 'string') {
            backendVersion = localData.trim()
          }
        }

        // 获取远端版本信息
        let remoteVersion = ''

        try {
          const remoteResponse = await versionAPI.getVersion('remote')

          if (remoteResponse.data.code === 200 || remoteResponse.data.code === 0) {
            const remoteData = remoteResponse.data.data
            if (remoteData && typeof remoteData === 'object') {
              remoteVersion = remoteData.remoteVersion ? String(remoteData.remoteVersion).trim() : remoteVersion
            } else if (typeof remoteData === 'string') {
              remoteVersion = remoteData.trim()
            }
          }
        } catch (error) {
          console.warn('获取远端版本信息失败:', error)
        }

        return {
          backendVersion,
          remoteVersion,
          buildDate,
          hasBackendUpdate: shouldUpdate(backendVersion, remoteVersion)
        }
      } catch (error) {
        console.error('获取版本信息失败:', error)
        return {
          backendVersion: '',
          remoteVersion: '',
          buildDate: '',
          hasBackendUpdate: false
        }
      }
    },
    refetchInterval: 60000, // 每分钟自动刷新
    refetchOnWindowFocus: false,
    staleTime: 30000 // 30秒内不重新请求
  })

  const clearPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [])

  const clearReconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
  }, [])

  const startReconnectCheck = useCallback(async () => {
    setIsReconnectChecking(true)
    const intervals = [1000, 2000, 2000, 3000, 3000, 5000, 5000, 8000, 8000, 10000]
    let idx = 0

    const tryOnce = async () => {
      try {
        const localRes = await versionAPI.getVersion('local')
        if ((localRes?.data?.code === 200 || localRes?.data?.code === 0) && localRes?.data?.data) {
          setUpdateProgress(100)
          setUpdateMessage('更新完成，服务已恢复')
          setPostUpdateNeedsRefresh(true)
          await refetch()
          setTimeout(() => {
            setIsUpdating(false)
            setIsReconnectChecking(false)
            setUpdateTaskId('')
          }, 800)
          return
        }
      } catch (_) {
        // 服务重启窗口内失败是预期行为，继续重试
      }

      if (idx >= intervals.length) {
        setUpdateMessage('服务重启较慢，请稍后手动刷新页面确认版本')
        setPostUpdateNeedsRefresh(true)
        setIsUpdating(false)
        setIsReconnectChecking(false)
        return
      }

      const delay = intervals[idx++]
      reconnectTimerRef.current = setTimeout(tryOnce, delay)
    }

    await tryOnce()
  }, [refetch])

  const pollUpdateTask = useCallback((taskId) => {
    clearPolling()

    const pollOnce = async () => {
      try {
        const resp = await programAPI.getUpdateProgress(taskId)
        const body = resp?.data || {}
        const code = Number(body.code ?? 200)
        const msg = String(body.msg || '').trim()

        if (code !== 200) {
          const taskMissing = msg.includes('taskID 未找到') || msg.includes('未找到')
          if (taskMissing) {
            setUpdateMessage('更新进度任务已结束，正在等待服务重启恢复...')
            startReconnectCheck()
            return
          }
        }

        const data = body.data || {}
        const percentage = Number(data.percentage || 0)
        const message = String(data.message || '').trim()
        const detailMsg = String(data.detailMsg || '').trim()
        const isDone = Boolean(data.isDone)

        setUpdateProgress(Number.isFinite(percentage) ? percentage : 0)
        if (message) {
          setUpdateMessage(detailMsg ? `${message}（${detailMsg}）` : message)
        }

        if (isDone) {
          if (message.includes('失败')) {
            setIsUpdating(false)
            return
          }
          setUpdateProgress(100)
          setUpdateMessage('更新包已就绪，正在自动重启并恢复连接...')
          startReconnectCheck()
          return
        }
      } catch (error) {
        const status = error?.response?.status
        const msg = String(error?.response?.data?.msg || '').trim()
        const taskMissing = status === 404 || msg.includes('taskID 未找到') || msg.includes('未找到')

        if (taskMissing) {
          setUpdateMessage('更新进度任务已结束，正在等待服务重启恢复...')
          startReconnectCheck()
          return
        }
      }

      pollTimerRef.current = setTimeout(pollOnce, 900)
    }

    pollOnce()
  }, [clearPolling, startReconnectCheck])

  // 更新后端
  const updateBackend = useCallback(async () => {
    try {
      clearPolling()
      clearReconnect()
      setIsUpdating(true)
      setPostUpdateNeedsRefresh(false)
      setShowForceUpdate(false)
      setUpdateProgress(1)
      setUpdateMessage('正在提交更新请求...')
      const response = await versionAPI.updateProgram()

      if (response.data?.data?.updated === false || response.data?.msg === '当前已是最新版本') {
        setShowForceUpdate(true)
        setUpdateProgress(100)
        setUpdateMessage('当前已是最新版本（如需重下并覆盖，可点“强制覆盖更新”）')
        await refetch()
        setTimeout(() => {
          setIsUpdating(false)
        }, 800)
        return
      }

      const taskId = response?.data?.data?.taskID || response?.data?.data?.taskId || ''
      if (!taskId) {
        setUpdateMessage('更新任务已提交，正在等待状态...')
        setTimeout(() => startReconnectCheck(), 1500)
        return
      }

      setUpdateTaskId(taskId)
      setUpdateMessage('更新任务已创建，正在获取进度...')
      pollUpdateTask(taskId)
    } catch (error) {
      console.error('后端更新失败:', error)
      setUpdateMessage(error.response?.data?.msg || error.message || '后端更新失败，请手动重试')
      setIsUpdating(false)
    }
  }, [clearPolling, clearReconnect, refetch, pollUpdateTask, startReconnectCheck])

  const uploadProgramUpdate = useCallback(async (file) => {
    if (!file) return
    try {
      clearPolling()
      clearReconnect()
      setIsUpdating(true)
      setPostUpdateNeedsRefresh(false)
      setShowForceUpdate(false)
      setUpdateProgress(1)
      setUpdateMessage(`正在上传更新包：${file.name}`)
      const response = await versionAPI.uploadProgram(file)
      const taskId = response?.data?.data?.taskID || response?.data?.data?.taskId || ''
      if (!taskId) {
        setUpdateMessage('上传更新任务已提交，正在等待服务恢复...')
        setTimeout(() => startReconnectCheck(), 1500)
        return
      }
      setUpdateTaskId(taskId)
      setUpdateMessage('上传更新任务已创建，正在获取进度...')
      pollUpdateTask(taskId)
    } catch (error) {
      console.error('上传更新失败:', error)
      const status = error?.response?.status
      const serverMsg = error?.response?.data?.msg
      const networkLike = !status && (String(error?.message || '').toLowerCase().includes('network error') || String(error?.code || '').includes('ERR_NETWORK') || String(error?.code || '').includes('ECONNRESET'))
      if (status === 413) {
        setUpdateMessage('上传失败：文件过大，当前服务上传上限过小，请升级到已放宽上传限制的版本后重试')
        setIsUpdating(false)
      } else if (networkLike) {
        setUpdateMessage('上传请求已发送，服务可能正在切换新程序并重启；正在等待恢复连接...')
        setUpdateProgress((prev) => Math.max(prev || 0, 90))
        startReconnectCheck()
      } else {
        setUpdateMessage(serverMsg || error.message || '上传更新失败，请检查文件架构后重试')
        setIsUpdating(false)
      }
    }
  }, [clearPolling, clearReconnect, pollUpdateTask, startReconnectCheck])

  const forceUpdateBackend = useCallback(async () => {
    try {
      clearPolling()
      clearReconnect()
      setIsUpdating(true)
      setPostUpdateNeedsRefresh(false)
      setUpdateProgress(1)
      setUpdateMessage('正在强制覆盖更新（跳过版本相同检查）...')
      const response = await versionAPI.updateProgram(true)

      if (response.data?.data?.updated === false) {
        setUpdateMessage('强制更新未执行，请稍后重试')
        setIsUpdating(false)
        return
      }

      const taskId = response?.data?.data?.taskID || response?.data?.data?.taskId || ''
      if (!taskId) {
        setUpdateMessage('强制更新任务已提交，正在等待状态...')
        setTimeout(() => startReconnectCheck(), 1500)
        return
      }

      setUpdateTaskId(taskId)
      setShowForceUpdate(false)
      setUpdateMessage('强制更新任务已创建，正在获取进度...')
      pollUpdateTask(taskId)
    } catch (error) {
      console.error('强制更新失败:', error)
      setUpdateMessage(error.response?.data?.msg || error.message || '强制更新失败，请手动重试')
      setIsUpdating(false)
    }
  }, [clearPolling, clearReconnect, pollUpdateTask, startReconnectCheck])
  useEffect(() => {
    return () => {
      clearPolling()
      clearReconnect()
    }
  }, [clearPolling, clearReconnect])

  // 手动检查更新
  const checkForUpdates = useCallback(async () => {
    await refetch()
    // 若已完成更新且当前已追平版本，则自动恢复普通按钮
    try {
      const localResponse = await versionAPI.getVersion('local')
      const remoteResponse = await versionAPI.getVersion('remote')
      const localData = localResponse?.data?.data
      const remoteData = remoteResponse?.data?.data
      const localVersion = typeof localData === 'object' ? String(localData?.version || '').trim() : String(localData || '').trim()
      const remoteVersion = typeof remoteData === 'object' ? String(remoteData?.remoteVersion || '').trim() : String(remoteData || '').trim()
      if (localVersion && remoteVersion && !shouldUpdate(localVersion, remoteVersion)) {
        setPostUpdateNeedsRefresh(false)
      }
    } catch (_) {}
  }, [refetch])

  return {
    // 状态
    showUpdatePrompt,
    isUpdating,
    updateMessage,
    showForceUpdate,
    updateProgress,
    updateTaskId,
    isReconnectChecking,
    postUpdateNeedsRefresh,

    // 版本数据
    backendVersion: versionData?.backendVersion,
    remoteVersion: versionData?.remoteVersion,
    buildDate: versionData?.buildDate,
    hasBackendUpdate: versionData?.hasBackendUpdate,

    // 方法
    setShowUpdatePrompt,
    updateBackend,
    forceUpdateBackend,
    uploadProgramUpdate,
    checkForUpdates,
    setUpdateMessage,
    setIsUpdating,
    setPostUpdateNeedsRefresh
  }
}
