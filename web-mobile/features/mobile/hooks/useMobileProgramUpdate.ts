import { useCallback, useEffect, useRef, useState } from "react"

import { ApiError, mobileApi } from "@/lib/api"
import type { VersionInfo } from "@/lib/api"
import { getErrorMessage, shouldUpdateVersion } from "./useMobileDashboardData"

type SetVersion = (version: VersionInfo | null) => void

export function useMobileProgramUpdate(setVersion: SetVersion) {
  const [backendVersion, setBackendVersion] = useState("")
  const [remoteVersion, setRemoteVersion] = useState("")
  const [hasBackendUpdate, setHasBackendUpdate] = useState(false)
  const [isUpdatingProgram, setIsUpdatingProgram] = useState(false)
  const [showForceUpdate, setShowForceUpdate] = useState(false)
  const [updateMessage, setUpdateMessage] = useState("")
  const [updateProgress, setUpdateProgress] = useState(0)
  const [updateTaskId, setUpdateTaskId] = useState("")
  const [isReconnectChecking, setIsReconnectChecking] = useState(false)
  const [postUpdateNeedsRefresh, setPostUpdateNeedsRefresh] = useState(false)
  const [pendingProgramFile, setPendingProgramFile] = useState<File | null>(null)
  const programPollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const programReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadVersionStatus = useCallback(async () => {
    try {
      const [localDetail, remoteDetail] = await Promise.all([
        mobileApi.getVersionDetail("local"),
        mobileApi.getVersionDetail("remote").catch(() => null),
      ])

      const localVersion = String(localDetail?.version || "").trim()
      const buildDate = String(localDetail?.buildDate || localDetail?.build_date || "").trim()
      const latestVersion = String(remoteDetail?.remoteVersion || "").trim()
      const hasUpdate = shouldUpdateVersion(localVersion, latestVersion)

      if (localVersion || buildDate) {
        setVersion({
          version: localVersion,
          build_date: buildDate,
        })
      }

      setBackendVersion(localVersion)
      setRemoteVersion(latestVersion)
      setHasBackendUpdate(hasUpdate)

      return {
        localVersion,
        remoteVersion: latestVersion,
        hasUpdate,
      }
    } catch {
      setBackendVersion("")
      setRemoteVersion("")
      setHasBackendUpdate(false)
      return {
        localVersion: "",
        remoteVersion: "",
        hasUpdate: false,
      }
    }
  }, [setVersion])

  const clearProgramPollTimer = useCallback(() => {
    if (programPollTimerRef.current) {
      clearTimeout(programPollTimerRef.current)
      programPollTimerRef.current = null
    }
  }, [])

  const clearProgramReconnectTimer = useCallback(() => {
    if (programReconnectTimerRef.current) {
      clearTimeout(programReconnectTimerRef.current)
      programReconnectTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      clearProgramPollTimer()
      clearProgramReconnectTimer()
    }
  }, [clearProgramPollTimer, clearProgramReconnectTimer])

  const startReconnectCheck = useCallback(async () => {
    clearProgramReconnectTimer()
    setIsReconnectChecking(true)
    const intervals = [1000, 2000, 2000, 3000, 3000, 5000, 5000, 8000, 8000, 10000]
    let idx = 0

    const tryOnce = async (): Promise<void> => {
      try {
        const localDetail = await mobileApi.getVersionDetail("local")
        const localVersion = String(localDetail?.version || "").trim()
        if (localVersion) {
          setUpdateProgress(100)
          setUpdateMessage("更新完成，服务已恢复")
          setPostUpdateNeedsRefresh(true)
          await loadVersionStatus()
          setTimeout(() => {
            setIsUpdatingProgram(false)
            setIsReconnectChecking(false)
            setUpdateTaskId("")
          }, 800)
          return
        }
      } catch {
        // 服务重启窗口内失败是预期行为，继续重试
      }

      if (idx >= intervals.length) {
        setUpdateMessage("服务重启较慢，请稍后手动刷新页面确认版本")
        setPostUpdateNeedsRefresh(true)
        setIsUpdatingProgram(false)
        setIsReconnectChecking(false)
        return
      }

      const delay = intervals[idx++]
      programReconnectTimerRef.current = setTimeout(() => {
        void tryOnce()
      }, delay)
    }

    await tryOnce()
  }, [clearProgramReconnectTimer, loadVersionStatus])

  const pollProgramUpdateTask = useCallback(
    (taskId: string) => {
      clearProgramPollTimer()

      const pollOnce = async (): Promise<void> => {
        try {
          const data = await mobileApi.getProgress(taskId)
          const percentage = Number(data.percentage || 0)
          const message = String(data.message || "").trim()
          const detailMsg = String(data.detailMsg || "").trim()
          const isDone = Boolean(data.isDone)

          setUpdateProgress(Number.isFinite(percentage) ? percentage : 0)
          if (message) {
            setUpdateMessage(detailMsg ? `${message}（${detailMsg}）` : message)
          }

          if (isDone) {
            if (message.includes("失败")) {
              setIsUpdatingProgram(false)
              return
            }
            setUpdateProgress(100)
            setUpdateMessage("更新包已就绪，正在自动重启并恢复连接...")
            void startReconnectCheck()
            return
          }
        } catch (error) {
          const message = getErrorMessage(error, "")
          const taskMissing =
            (error instanceof ApiError && error.status === 404) ||
            message.includes("taskID 未找到") ||
            message.includes("未找到")

          if (taskMissing) {
            setUpdateMessage("更新进度任务已结束，正在等待服务重启恢复...")
            void startReconnectCheck()
            return
          }
        }

        programPollTimerRef.current = setTimeout(() => {
          void pollOnce()
        }, 900)
      }

      void pollOnce()
    },
    [clearProgramPollTimer, startReconnectCheck]
  )

  const handleCheckProgramUpdates = useCallback(async () => {
    const status = await loadVersionStatus()
    if (status.localVersion && status.remoteVersion && !status.hasUpdate) {
      setPostUpdateNeedsRefresh(false)
    }
  }, [loadVersionStatus])

  const handleRemoteProgramUpdate = useCallback(
    async (force = false) => {
      try {
        clearProgramPollTimer()
        clearProgramReconnectTimer()
        setIsUpdatingProgram(true)
        setPostUpdateNeedsRefresh(false)
        setShowForceUpdate(false)
        setPendingProgramFile(null)
        setUpdateProgress(1)
        setUpdateMessage(force ? "正在强制覆盖更新（跳过版本相同检查）..." : "正在提交更新请求...")
        const response = await mobileApi.updateProgram(force)

        if (!force && (response.updated === false || response.currentVersion === response.remoteVersion)) {
          setShowForceUpdate(true)
          setUpdateProgress(100)
          setUpdateMessage("当前已是最新版本（如需重下并覆盖，可点“强制覆盖更新”）")
          await loadVersionStatus()
          setTimeout(() => {
            setIsUpdatingProgram(false)
          }, 800)
          return
        }

        if (force && response.updated === false) {
          setUpdateMessage("强制更新未执行，请稍后重试")
          setIsUpdatingProgram(false)
          return
        }

        const taskId = response.taskID || response.taskId || ""
        if (!taskId) {
          setUpdateMessage(force ? "强制更新任务已提交，正在等待状态..." : "更新任务已提交，正在等待状态...")
          programReconnectTimerRef.current = setTimeout(() => {
            void startReconnectCheck()
          }, 1500)
          return
        }

        setUpdateTaskId(taskId)
        setUpdateMessage(force ? "强制更新任务已创建，正在获取进度..." : "更新任务已创建，正在获取进度...")
        pollProgramUpdateTask(taskId)
      } catch (error) {
        setUpdateMessage(getErrorMessage(error, force ? "强制更新失败，请手动重试" : "后端更新失败，请手动重试"))
        setIsUpdatingProgram(false)
      }
    },
    [clearProgramPollTimer, clearProgramReconnectTimer, loadVersionStatus, pollProgramUpdateTask, startReconnectCheck]
  )

  const handleUploadProgramUpdate = useCallback(
    async (file: File) => {
      if (!file) {
        return
      }

      try {
        clearProgramPollTimer()
        clearProgramReconnectTimer()
        setIsUpdatingProgram(true)
        setPostUpdateNeedsRefresh(false)
        setShowForceUpdate(false)
        setPendingProgramFile(null)
        setUpdateProgress(1)
        setUpdateMessage(`正在上传更新包：${file.name}`)
        const response = await mobileApi.uploadProgram(file)
        const taskId = response.taskID || response.taskId || ""
        if (!taskId) {
          setUpdateMessage("上传更新任务已提交，正在等待服务恢复...")
          programReconnectTimerRef.current = setTimeout(() => {
            void startReconnectCheck()
          }, 1500)
          return
        }
        setUpdateTaskId(taskId)
        setUpdateMessage("上传更新任务已创建，正在获取进度...")
        pollProgramUpdateTask(taskId)
      } catch (error) {
        const networkLike =
          !(error instanceof ApiError) &&
          /network|fetch|failed to fetch|load failed/i.test(String(error instanceof Error ? error.message : error))

        if (error instanceof ApiError && error.status === 413) {
          setUpdateMessage("上传失败：文件过大，当前服务上传上限过小，请升级到已放宽上传限制的版本后重试")
          setIsUpdatingProgram(false)
        } else if (networkLike) {
          setUpdateMessage("上传请求已发送，服务可能正在切换新程序并重启；正在等待恢复连接...")
          setUpdateProgress((prev) => Math.max(prev || 0, 90))
          void startReconnectCheck()
        } else {
          setUpdateMessage(getErrorMessage(error, "上传更新失败，请检查文件架构后重试"))
          setIsUpdatingProgram(false)
        }
      }
    },
    [clearProgramPollTimer, clearProgramReconnectTimer, pollProgramUpdateTask, startReconnectCheck]
  )

  const handleRefreshAfterProgramUpdate = useCallback(() => {
    window.location.reload()
  }, [])

  return {
    backendVersion,
    remoteVersion,
    hasBackendUpdate,
    isUpdatingProgram,
    showForceUpdate,
    updateMessage,
    updateProgress,
    updateTaskId,
    isReconnectChecking,
    postUpdateNeedsRefresh,
    pendingProgramFile,
    setPendingProgramFile,
    loadVersionStatus,
    handleCheckProgramUpdates,
    handleRemoteProgramUpdate,
    handleUploadProgramUpdate,
    handleRefreshAfterProgramUpdate,
  }
}
