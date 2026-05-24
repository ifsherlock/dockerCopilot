"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertCircle,
  Box,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileText,
  Github,
  Globe,
  HelpCircle,
  Info,
  Key,
  LoaderCircle,
  LogIn,
  LogOut,
  Moon,
  Package,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Server,
  Settings,
  Sparkles,
  Square,
  Sun,
  TerminalSquare,
  Trash2,
  Zap,
} from "lucide-react"

import { cn } from "@/lib/utils"
import {
  ApiError,
  clearStoredToken,
  getStoredToken,
  mobileApi,
  setStoredToken,
} from "@/lib/api"
import type {
  ContainerInfo,
  ImageInfo,
  OperationLog,
  RuntimeConfig,
  VersionInfo,
} from "@/lib/api"

type PageType = "containers" | "images" | "config" | "backups" | "logs" | "about"
type NoticeType = "success" | "error" | "info"
type ContainerFilterKey = "all" | "running" | "updatable" | "paused"
type ImageFilterKey = "all" | "inUse" | "unused" | "updatable"

type ConfigFormState = {
  botToken: string
  chatIds: string
  hostLanIP: string
  defaultImageAccelerator: string
  updateCheckCron: string
  autoCleanImages: boolean
  cleanImagesCron: string
  autoUpdateContainers: boolean
  updateContainersCron: string
  autoBackupJson: boolean
  backupJsonCron: string
  autoBackupCompose: boolean
  backupComposeCron: string
}

const navItems: Array<{ key: PageType; label: string; icon: typeof Box }> = [
  { key: "containers", label: "容器", icon: Box },
  { key: "images", label: "镜像", icon: Package },
  { key: "config", label: "配置", icon: Settings },
  { key: "backups", label: "加速", icon: Zap },
  { key: "logs", label: "日志", icon: FileText },
  { key: "about", label: "关于", icon: Info },
]

const initialConfigForm: ConfigFormState = {
  botToken: "",
  chatIds: "",
  hostLanIP: "",
  defaultImageAccelerator: "",
  updateCheckCron: "",
  autoCleanImages: false,
  cleanImagesCron: "",
  autoUpdateContainers: false,
  updateContainersCron: "",
  autoBackupJson: false,
  backupJsonCron: "",
  autoBackupCompose: false,
  backupComposeCron: "",
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    return error.message || fallback
  }
  if (error instanceof Error) {
    return error.message
  }
  return fallback
}

function isUnauthorizedError(error: unknown) {
  return error instanceof ApiError && error.status === 401
}

function formatContainerStatus(status: string) {
  const normalized = status.toLowerCase()

  if (normalized.includes("running") || normalized === "running") {
    return {
      label: "运行",
      badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
      dot: "bg-emerald-500",
      isRunning: true,
    }
  }

  if (normalized.includes("paused") || normalized === "paused") {
    return {
      label: "暂停",
      badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
      dot: "bg-amber-500",
      isRunning: false,
    }
  }

  if (normalized.includes("restart") || normalized.includes("restarting")) {
    return {
      label: "重启中",
      badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
      dot: "bg-blue-500",
      isRunning: false,
    }
  }

  return {
    label: "停止",
    badge: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
    dot: "bg-slate-400",
    isRunning: false,
  }
}

function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-10 text-center shadow-sm">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500">
        <AlertCircle className="h-6 w-6" />
      </div>
      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</h3>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

function StatCard({
  label,
  value,
  accent,
  active = false,
  onClick,
}: {
  label: string
  value: string | number
  accent: string
  active?: boolean
  onClick?: () => void
}) {
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "rounded-2xl bg-white dark:bg-slate-900 p-4 text-left shadow-sm ring-1 transition-all hover:-translate-y-0.5 hover:shadow-md",
          active ? "ring-blue-300 dark:ring-blue-700 bg-blue-50/60 dark:bg-blue-950/30" : "ring-slate-100 dark:ring-slate-700"
        )}
      >
        <div className={cn("mb-3 h-1.5 w-10 rounded-full", accent)} />
        <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</div>
        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{label}</div>
      </button>
    )
  }

  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900 p-4 shadow-sm ring-1 ring-slate-100 dark:ring-slate-700">
      <div className={cn("mb-3 h-1.5 w-10 rounded-full", accent)} />
      <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</div>
      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{label}</div>
    </div>
  )
}

function NavItem({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean
  icon: typeof Box
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 rounded-xl px-3 py-2 text-xs font-medium transition-colors",
        active ? "text-blue-600 dark:text-blue-400" : "text-slate-500 dark:text-slate-400"
      )}
    >
      <Icon className={cn("h-5 w-5", active ? "text-blue-600 dark:text-blue-400" : "text-slate-400 dark:text-slate-500")} />
      <span>{label}</span>
    </button>
  )
}

// 解析镜像名，生成 Docker Hub / GitHub 链接（互斥路由）
function parseImageRepoLink(imageName: string, tag: string): { dockerHub?: string; github?: string } {
  if (!imageName) return {}

  // ghcr.io 开头 → GitHub
  if (/^ghcr\.io\//i.test(imageName)) {
    const repoPath = imageName.replace(/^ghcr\.io\//i, "")
    const ghParts = repoPath.split("/")
    if (ghParts.length >= 2) {
      const owner = ghParts[0]
      let repo = ghParts[1]
      repo = repo.replace(/:.*$/, "")
      return { github: `https://github.com/${owner}/${repo}` }
    }
    return {}
  }

  // xxx/xxx:xxxx 格式 → Docker Hub
  const parts = imageName.split("/")
  const hasRegistry = /\.(com|io|org|net|dev)\//i.test(imageName) && !/^docker\.io\//i.test(imageName)

  if (!hasRegistry && parts.length >= 2) {
    const repoParts = parts.slice(0, 2).join("/").replace(/:.*$/, "")
    return { dockerHub: `https://hub.docker.com/r/${repoParts}` }
  }

  if (!hasRegistry && parts.length === 1) {
    const img = parts[0].replace(/:.*$/, "")
    return { dockerHub: `https://hub.docker.com/_/${img}` }
  }

  return {}
}

function parseVersionNumber(version: string) {
  const match = String(version || "").trim().match(/^(\d+)\.(\d+)\.(\d+)(?:-.+)?$/)
  if (!match) {
    return null
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  }
}

function shouldUpdateVersion(currentVersion?: string, latestVersion?: string) {
  const current = parseVersionNumber(String(currentVersion || "").trim())
  const latest = parseVersionNumber(String(latestVersion || "").trim())

  if (!current || !latest) {
    return false
  }

  if (latest.major !== current.major) {
    return latest.major > current.major
  }

  if (latest.minor !== current.minor) {
    return latest.minor > current.minor
  }

  return latest.patch > current.patch
}

export default function DockerCopilotMobilePage() {
  const [activePage, setActivePage] = useState<PageType>("containers")
  const [booting, setBooting] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [secretKey, setSecretKey] = useState("")
  const [loginLoading, setLoginLoading] = useState(false)
  const [authError, setAuthError] = useState("")
  const [showPassword, setShowPassword] = useState(false)

  const [containers, setContainers] = useState<ContainerInfo[]>([])
  const [images, setImages] = useState<ImageInfo[]>([])
  const [backups, setBackups] = useState<string[]>([])
  const [operationLogs, setOperationLogs] = useState<OperationLog[]>([])
  const [config, setConfig] = useState<RuntimeConfig | null>(null)
  const [version, setVersion] = useState<VersionInfo | null>(null)
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

  const [refreshing, setRefreshing] = useState(false)
  const [pageError, setPageError] = useState("")
  const [notice, setNotice] = useState<{ type: NoticeType; message: string } | null>(null)
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const programPollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const programReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [containerQuery, setContainerQuery] = useState("")
  const [imageQuery, setImageQuery] = useState("")
  const [operationLogQuery, setOperationLogQuery] = useState("")
  const [containerFilter, setContainerFilter] = useState<ContainerFilterKey>("all")
  const [imageFilter, setImageFilter] = useState<ImageFilterKey>("all")

  const [pendingAction, setPendingAction] = useState<string>("")
  const [blacklistPendingKey, setBlacklistPendingKey] = useState("")
  const [selectedLogContainerId, setSelectedLogContainerId] = useState("")
  const [containerLogs, setContainerLogs] = useState("")
  const [containerLogsLoading, setContainerLogsLoading] = useState(false)
  const [containerLogsError, setContainerLogsError] = useState("")

  const [configForm, setConfigForm] = useState<ConfigFormState>(initialConfigForm)
  const [configSaving, setConfigSaving] = useState(false)

  const [updateBlacklist, setUpdateBlacklist] = useState<string[]>([])
  const [blacklistDraft, setBlacklistDraft] = useState("")
  const [icons, setIcons] = useState<Record<string, string>>({})
  const [containerActions, setContainerActions] = useState<Record<string, { updating?: boolean; ignoring?: boolean }>>({})

  // 加速页状态
  const [pullImageName, setPullImageName] = useState("")
  const [pullImageSource, setPullImageSource] = useState("")
  const [pullImageDropdownOpen, setPullImageDropdownOpen] = useState(false)

  const currentOrigin = typeof window !== "undefined" ? window.location.origin : ""
  const [themeMode, setThemeMode] = useState<"light" | "dark">("light")
  const ThemeIcon = themeMode === "dark" ? Sun : Moon

  // 通知自动消失（3秒后清除）
  const showNotice = useCallback((n: { type: NoticeType; message: string } | null) => {
    setNotice(n)
    if (noticeTimerRef.current) {
      clearTimeout(noticeTimerRef.current)
      noticeTimerRef.current = null
    }
    if (n) {
      noticeTimerRef.current = setTimeout(() => {
        setNotice(null)
      }, 3000)
    }
  }, [])

  // 主题切换
  const toggleTheme = useCallback(() => {
    setThemeMode((prev) => {
      const next = prev === "light" ? "dark" : "light"
      document.documentElement.classList.toggle("dark", next === "dark")
      return next
    })
  }, [])

  // 初始化主题
  useEffect(() => {
    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches
    const saved = localStorage.getItem("mobile-theme")
    const mode = saved === "dark" || saved === "light" ? saved : isDark ? "dark" : "light"
    setThemeMode(mode)
    document.documentElement.classList.toggle("dark", mode === "dark")
  }, [])

  // 持久化主题
  useEffect(() => {
    localStorage.setItem("mobile-theme", themeMode)
  }, [themeMode])

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
  }, [])

  // 刷新时自动清除通知
  const refreshAll = useCallback(async () => {
    setNotice(null)
    setRefreshing(true)
    setPageError("")
    try {
      const [cRes, iRes, bRes, oRes, cfgRes, blRes, iconRes] = await Promise.allSettled([
        mobileApi.getContainers(),
        mobileApi.getImages(),
        mobileApi.getBackups(),
        mobileApi.getOperationLogs(),
        mobileApi.getConfig(),
        mobileApi.getUpdateBlacklist(),
        mobileApi.getIcons(),
      ])

      if (cRes.status === "fulfilled") setContainers(cRes.value)
      if (iRes.status === "fulfilled") setImages(iRes.value)
      if (bRes.status === "fulfilled") setBackups(bRes.value)
      if (oRes.status === "fulfilled") setOperationLogs(oRes.value)
      if (cfgRes.status === "fulfilled") {
        const cfg = cfgRes.value
        setConfig(cfg)
        setConfigForm({
          botToken: cfg.telegram?.bot_token ?? "",
          chatIds: (cfg.telegram?.chat_ids ?? []).join(", "),
          hostLanIP: cfg.dockercopilot?.host_lan_ip ?? "",
          defaultImageAccelerator: cfg.telegram?.default_image_accelerator ?? "",
          updateCheckCron: cfg.telegram?.update_check_cron ?? "",
          autoCleanImages: cfg.telegram?.auto_clean_images ?? false,
          cleanImagesCron: cfg.telegram?.clean_images_cron ?? "3 2 * * *",
          autoUpdateContainers: cfg.telegram?.auto_update_containers ?? false,
          updateContainersCron: cfg.telegram?.update_containers_cron ?? "0 */6 * * *",
          autoBackupJson: cfg.telegram?.auto_backup_json ?? false,
          backupJsonCron: cfg.telegram?.backup_json_cron ?? "0 1 * * *",
          autoBackupCompose: cfg.telegram?.auto_backup_compose ?? false,
          backupComposeCron: cfg.telegram?.backup_compose_cron ?? "30 1 * * *",
        })
      }
      if (blRes.status === "fulfilled") setUpdateBlacklist(blRes.value)
      if (iconRes.status === "fulfilled") setIcons(iconRes.value)
      await loadVersionStatus()
    } catch (err) {
      if (!isUnauthorizedError(err)) {
        setPageError(getErrorMessage(err, "刷新失败"))
      }
    } finally {
      setRefreshing(false)
    }
  }, [loadVersionStatus])

  // 登录
  const handleLogin = useCallback(async () => {
    if (!secretKey.trim()) {
      setAuthError("请输入密码")
      return
    }
    setLoginLoading(true)
    setAuthError("")
    try {
      const data = await mobileApi.login(secretKey.trim())
      setStoredToken(data.jwt)
      setIsAuthenticated(true)
      setSecretKey("")
    } catch (err) {
      setAuthError(getErrorMessage(err, "登录失败"))
    } finally {
      setLoginLoading(false)
    }
  }, [secretKey])

  // 登出
  const handleLogout = useCallback(() => {
    clearStoredToken()
    setIsAuthenticated(false)
    setContainers([])
    setImages([])
    setBackups([])
    setOperationLogs([])
    setConfig(null)
    setVersion(null)
    setNotice({ type: "info", message: "已退出登录" })
  }, [])

  // 初始化
  useEffect(() => {
    const token = getStoredToken()
    if (token) {
      setIsAuthenticated(true)
    }
    setBooting(false)
  }, [])

  useEffect(() => {
    if (isAuthenticated) {
      refreshAll()
    }
  }, [isAuthenticated, refreshAll])

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
      if (noticeTimerRef.current) {
        clearTimeout(noticeTimerRef.current)
        noticeTimerRef.current = null
      }
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

  // 容器操作
  const handleContainerAction = useCallback(
    async (id: string, action: "start" | "stop" | "restart") => {
      setPendingAction(`${action}-${id}`)
      try {
        if (action === "start") await mobileApi.startContainer(id)
        else if (action === "stop") await mobileApi.stopContainer(id)
        else await mobileApi.restartContainer(id)
        showNotice({ type: "success", message: "操作成功" })
        const cRes = await mobileApi.getContainers()
        setContainers(cRes)
      } catch (err) {
        showNotice({ type: "error", message: getErrorMessage(err, "操作失败") })
      } finally {
        setPendingAction("")
      }
    },
    [showNotice]
  )

  // 容器更新
  const handleContainerUpdate = useCallback(
    async (container: ContainerInfo) => {
      setPendingAction(`update-${container.id}`)
      try {
        await mobileApi.updateContainer(container.id, container.name, container.usingImage)
        showNotice({ type: "success", message: `容器 ${container.name} 更新成功` })
        const cRes = await mobileApi.getContainers()
        setContainers(cRes)
      } catch (err) {
        showNotice({ type: "error", message: getErrorMessage(err, "更新失败") })
      } finally {
        setPendingAction("")
      }
    },
    [showNotice]
  )

  // 镜像删除
  const handleDeleteImage = useCallback(
    async (id: string, force = false) => {
      setPendingAction(`delete-${id}`)
      try {
        await mobileApi.deleteImage(id, force)
        showNotice({ type: "success", message: force ? "镜像已强制删除" : "镜像已删除" })
        const iRes = await mobileApi.getImages()
        setImages(iRes)
      } catch (err) {
        showNotice({ type: "error", message: getErrorMessage(err, "删除失败") })
      } finally {
        setPendingAction("")
      }
    },
    [showNotice]
  )

  // 镜像拉取
  const handlePullImage = useCallback(async () => {
    if (!pullImageName.trim()) {
      showNotice({ type: "error", message: "请输入镜像名称" })
      return
    }
    setPendingAction("pull")
    try {
      const source = pullImageSource || "docker.io"
      await mobileApi.pullImage(pullImageName.trim(), source, pullImageName.trim())
      showNotice({ type: "success", message: "拉取任务已提交" })
      setPullImageName("")
      setPullImageSource("")
      const iRes = await mobileApi.getImages()
      setImages(iRes)
    } catch (err) {
      showNotice({ type: "error", message: getErrorMessage(err, "拉取失败") })
    } finally {
      setPendingAction("")
    }
  }, [pullImageName, pullImageSource, showNotice])

  // 获取容器日志
  const handleFetchContainerLogs = useCallback(async () => {
    if (!selectedLogContainerId) {
      showNotice({ type: "error", message: "请选择容器" })
      return
    }
    setContainerLogsLoading(true)
    setContainerLogsError("")
    try {
      const data = await mobileApi.getContainerLogs(selectedLogContainerId, "200")
      setContainerLogs(data.logs || "（无日志）")
    } catch (err) {
      setContainerLogsError(getErrorMessage(err, "获取日志失败"))
    } finally {
      setContainerLogsLoading(false)
    }
  }, [selectedLogContainerId, showNotice])

  // 复制日志
  const handleCopyLogs = useCallback(async () => {
    if (!containerLogs) return
    try {
      await navigator.clipboard.writeText(containerLogs)
      showNotice({ type: "success", message: "日志已复制" })
    } catch {
      showNotice({ type: "error", message: "复制失败" })
    }
  }, [containerLogs, showNotice])

  const handleOpenContainerLogs = useCallback(
    async (container: ContainerInfo) => {
      setActivePage("logs")
      setSelectedLogContainerId(container.id)
      setContainerLogs("")
      setContainerLogsError("")
      setContainerLogsLoading(true)
      try {
        const data = await mobileApi.getContainerLogs(container.id, "200")
        setContainerLogs(data.logs || "（无日志）")
      } catch (err) {
        const message = getErrorMessage(err, "获取日志失败")
        setContainerLogsError(message)
        showNotice({ type: "error", message })
      } finally {
        setContainerLogsLoading(false)
      }
    },
    [showNotice]
  )

  // 黑名单管理
  const handleSaveBlacklist = useCallback(
    async (items: string[]) => {
      const normalizedItems = Array.from(new Set(items.map((item) => String(item || "").trim()).filter(Boolean)))
      try {
        await mobileApi.saveUpdateBlacklist(normalizedItems)
        setUpdateBlacklist(normalizedItems)
        showNotice({ type: "success", message: "黑名单已保存" })
      } catch (err) {
        showNotice({ type: "error", message: getErrorMessage(err, "保存失败") })
      }
    },
    [showNotice]
  )

  // 配置保存
  const handleSaveConfig = useCallback(async () => {
    setConfigSaving(true)
    try {
      await mobileApi.saveConfig({
        botToken: configForm.botToken || undefined,
        chatIds: configForm.chatIds || undefined,
        hostLanIP: configForm.hostLanIP || undefined,
        defaultImageAccelerator: configForm.defaultImageAccelerator || undefined,
        updateCheckCron: configForm.updateCheckCron || undefined,
        autoCleanImages: configForm.autoCleanImages,
        cleanImagesCron: configForm.cleanImagesCron || undefined,
        autoUpdateContainers: configForm.autoUpdateContainers,
        updateContainersCron: configForm.updateContainersCron || undefined,
        autoBackupJson: configForm.autoBackupJson,
        backupJsonCron: configForm.backupJsonCron || undefined,
        autoBackupCompose: configForm.autoBackupCompose,
        backupComposeCron: configForm.backupComposeCron || undefined,
      })
      showNotice({ type: "success", message: "配置已保存" })
      const cfgRes = await mobileApi.getConfig()
      setConfig(cfgRes)
    } catch (err) {
      showNotice({ type: "error", message: getErrorMessage(err, "保存失败") })
    } finally {
      setConfigSaving(false)
    }
  }, [configForm, showNotice])

  // 镜像名标准化
  const normalizeImageName = useCallback((value: string) => {
    return String(value || "")
      .trim()
      .replace(/^https?:\/\//, "")
      .replace(/^registry-1\.docker\.io\//, "")
      .replace(/^docker\.io\//, "")
      .replace(/^library\//, "")
      .toLowerCase()
  }, [])

  const canonicalImageName = useCallback(
    (value: string) => {
      let v = normalizeImageName(value)
      if (!v) return ""
      const slash = v.lastIndexOf("/")
      const colon = v.lastIndexOf(":")
      if (colon <= slash && !v.includes("@")) v = `${v}:latest`
      return v
    },
    [normalizeImageName]
  )

  const normalizeBlacklistItems = useCallback(
    (items: string[]) => {
      return Array.from(
        new Set(
          items
            .map((item) => canonicalImageName(item) || normalizeImageName(item))
            .filter(Boolean)
        )
      )
    },
    [canonicalImageName, normalizeImageName]
  )

  const handleAddBlacklistItem = useCallback(() => {
    if (!blacklistDraft.trim()) return
    setUpdateBlacklist((prev) => normalizeBlacklistItems([...prev, blacklistDraft]))
    setBlacklistDraft("")
  }, [blacklistDraft, normalizeBlacklistItems])

  const getBlacklistCandidates = useCallback(
    (container: ContainerInfo) => {
      const imageCandidates = [container?.usingImage, container?.createImage]
        .map(canonicalImageName)
        .filter(Boolean)
      const nameCandidates = [container?.name].map(normalizeImageName).filter(Boolean)
      return Array.from(new Set([...imageCandidates, ...nameCandidates]))
    },
    [canonicalImageName, normalizeImageName]
  )

  const matchesBlacklistItem = useCallback(
    (container: ContainerInfo, item: string) => {
      const normalizedItem = canonicalImageName(item)
      if (!normalizedItem) return false
      return getBlacklistCandidates(container).some(
        (candidate) =>
          candidate === normalizedItem ||
          candidate.startsWith(`${normalizedItem}:`) ||
          normalizedItem.startsWith(`${candidate}:`)
      )
    },
    [canonicalImageName, getBlacklistCandidates]
  )

  const getImageBlacklistCandidates = useCallback(
    (image: ImageInfo) => {
      const refs = [
        image?.name && image?.tag && image.tag !== "None" && image.tag !== "<none>"
          ? `${image.name}:${image.tag}`
          : "",
        image?.name,
      ]
        .map(canonicalImageName)
        .filter(Boolean)
      return Array.from(new Set(refs))
    },
    [canonicalImageName]
  )

  const matchesImageBlacklistItem = useCallback(
    (image: ImageInfo, item: string) => {
      const normalizedItem = canonicalImageName(item)
      if (!normalizedItem) return false
      return getImageBlacklistCandidates(image).some(
        (candidate) =>
          candidate === normalizedItem ||
          candidate.startsWith(`${normalizedItem}:`) ||
          normalizedItem.startsWith(`${candidate}:`)
      )
    },
    [canonicalImageName, getImageBlacklistCandidates]
  )

  const isUpdateIgnored = useCallback(
    (container: ContainerInfo) => updateBlacklist.some((item) => matchesBlacklistItem(container, item)),
    [matchesBlacklistItem, updateBlacklist]
  )

  const ignoreUpdate = useCallback(
    async (container: ContainerInfo) => {
      const nextList = normalizeBlacklistItems([...updateBlacklist, ...getBlacklistCandidates(container)])
      await handleSaveBlacklist(nextList)
    },
    [getBlacklistCandidates, handleSaveBlacklist, normalizeBlacklistItems, updateBlacklist]
  )

  const unignoreUpdate = useCallback(
    async (container: ContainerInfo) => {
      const nextList = updateBlacklist.filter((item) => !matchesBlacklistItem(container, item))
      await handleSaveBlacklist(nextList)
    },
    [handleSaveBlacklist, matchesBlacklistItem, updateBlacklist]
  )

  const isImageUpdateIgnored = useCallback(
    (image: ImageInfo) => updateBlacklist.some((item) => matchesImageBlacklistItem(image, item)),
    [matchesImageBlacklistItem, updateBlacklist]
  )

  const ignoreImageUpdate = useCallback(
    async (image: ImageInfo) => {
      const nextList = normalizeBlacklistItems([...updateBlacklist, ...getImageBlacklistCandidates(image)])
      await handleSaveBlacklist(nextList)
    },
    [getImageBlacklistCandidates, handleSaveBlacklist, normalizeBlacklistItems, updateBlacklist]
  )

  const unignoreImageUpdate = useCallback(
    async (image: ImageInfo) => {
      const nextList = updateBlacklist.filter((item) => !matchesImageBlacklistItem(image, item))
      await handleSaveBlacklist(nextList)
    },
    [handleSaveBlacklist, matchesImageBlacklistItem, updateBlacklist]
  )

  const buildPullTarget = useCallback((image: ImageInfo) => {
    const name = String(image?.name || "").trim()
    const tag = String(image?.tag || "").trim()
    if (!name || name === "None" || !tag || tag === "None" || tag === "<none>") return ""
    return `${name}:${tag}`
  }, [])

  const handleImageUpdate = useCallback(
    async (image: ImageInfo) => {
      const target = buildPullTarget(image)
      if (!target) {
        showNotice({ type: "error", message: "镜像标签无效，无法更新" })
        return
      }
      setPendingAction(`update-image-${image.id}`)
      try {
        const source = config?.telegram?.default_image_accelerator || "docker.io"
        await mobileApi.pullImage(target, source, target)
        showNotice({ type: "success", message: `镜像 ${target} 更新任务已提交` })
        const [iRes, oRes] = await Promise.all([mobileApi.getImages(), mobileApi.getOperationLogs()])
        setImages(iRes)
        setOperationLogs(oRes)
      } catch (err) {
        showNotice({ type: "error", message: getErrorMessage(err, "更新失败") })
      } finally {
        setPendingAction("")
      }
    },
    [buildPullTarget, config, showNotice]
  )

  const handleToggleContainerIgnore = useCallback(
    async (container: ContainerInfo) => {
      const pendingKey = `container-${container.id}`
      setBlacklistPendingKey(pendingKey)
      try {
        if (isUpdateIgnored(container)) await unignoreUpdate(container)
        else await ignoreUpdate(container)
      } finally {
        setBlacklistPendingKey("")
      }
    },
    [ignoreUpdate, isUpdateIgnored, unignoreUpdate]
  )

  const handleToggleImageIgnore = useCallback(
    async (image: ImageInfo) => {
      const pendingKey = `image-${image.id}`
      setBlacklistPendingKey(pendingKey)
      try {
        if (isImageUpdateIgnored(image)) await unignoreImageUpdate(image)
        else await ignoreImageUpdate(image)
      } finally {
        setBlacklistPendingKey("")
      }
    },
    [ignoreImageUpdate, isImageUpdateIgnored, unignoreImageUpdate]
  )

  // 获取容器图标
  const getContainerIcon = useCallback(
    (container: ContainerInfo): string | null => {
      const imageName = container.usingImage || container.createImage || ""
      const canonical = canonicalImageName(imageName)
      if (canonical && icons[canonical]) return icons[canonical]
      if (icons[imageName]) return icons[imageName]
      return null
    },
    [icons, canonicalImageName]
  )

  const getContainerEndpointLink = useCallback(
    (container: ContainerInfo) => {
      const endpoint = container.endpointLink
      const editablePort = String(endpoint?.editablePort || "").trim()
      const configuredHostIP = String(endpoint?.hostIP || configForm.hostLanIP || config?.dockercopilot?.host_lan_ip || "").trim()
      const networkMode = String(endpoint?.networkMode || "").toLowerCase()
      const ports = Array.isArray(endpoint?.ports) ? endpoint.ports : []
      const isRunning = Boolean(endpoint?.running)
      const isHost = networkMode === "host"
      const mappedPort = !isHost ? String(ports.find((p) => Number(p?.publicPort) > 0)?.publicPort || "").trim() : ""
      const chosenPort = editablePort || mappedPort
      const suggestedURL =
        (configuredHostIP && chosenPort ? `http://${configuredHostIP}:${chosenPort}` : "") || String(endpoint?.suggestedURL || "").trim()

      return {
        ...endpoint,
        hostIP: configuredHostIP,
        networkMode,
        ports,
        isRunning,
        isHost,
        chosenPort,
        suggestedURL,
      }
    },
    [config?.dockercopilot?.host_lan_ip, configForm.hostLanIP]
  )

  // 统计
  const containerStats = useMemo(() => {
    const total = containers.length
    const running = containers.filter((c) => c.status.toLowerCase().includes("running")).length
    const paused = containers.filter((c) => c.status.toLowerCase().includes("paused")).length
    const updatable = containers.filter((c) => c.haveUpdate && !isUpdateIgnored(c)).length
    return { total, running, paused, updatable }
  }, [containers, isUpdateIgnored])

  const imageStats = useMemo(() => {
    const total = images.length
    const inUse = images.filter((i) => i.inUsed).length
    const unused = images.filter((i) => !i.inUsed).length
    const updatable = images.filter((i) => i.haveUpdate && !isImageUpdateIgnored(i)).length
    return { total, inUse, unused, updatable }
  }, [images, isImageUpdateIgnored])

  const logStats = useMemo(() => {
    const total = operationLogs.length
    const info = operationLogs.filter((l) => l.type === "info" || l.type === "INFO").length
    const warn = operationLogs.filter((l) => l.type === "warn" || l.type === "WARN" || l.type === "warning" || l.type === "WARNING").length
    const error = operationLogs.filter((l) => l.type === "error" || l.type === "ERROR" || l.type === "err" || l.type === "ERR").length
    return { total, info, warn, error }
  }, [operationLogs])

  // 过滤
  const filteredContainers = useMemo(() => {
    const q = containerQuery.trim().toLowerCase()
    return containers.filter((c) => {
      const matchesFilter =
        containerFilter === "all"
          ? true
          : containerFilter === "running"
            ? c.status.toLowerCase().includes("running")
            : containerFilter === "updatable"
              ? c.haveUpdate && !isUpdateIgnored(c)
              : c.status.toLowerCase().includes("paused")

      const matchesQuery =
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.usingImage.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q)

      return matchesFilter && matchesQuery
    })
  }, [containerFilter, containerQuery, containers, isUpdateIgnored])

  const filteredImages = useMemo(() => {
    const q = imageQuery.trim().toLowerCase()
    return images.filter((i) => {
      const matchesFilter =
        imageFilter === "all"
          ? true
          : imageFilter === "inUse"
            ? i.inUsed
            : imageFilter === "updatable"
              ? i.haveUpdate && !isImageUpdateIgnored(i)
              : !i.inUsed

      const matchesQuery =
        !q ||
        i.name.toLowerCase().includes(q) ||
        i.tag.toLowerCase().includes(q) ||
        i.id.toLowerCase().includes(q)

      return matchesFilter && matchesQuery
    })
  }, [imageFilter, imageQuery, images, isImageUpdateIgnored])

  const filteredLogs = useMemo(() => {
    if (!operationLogQuery.trim()) return operationLogs
    const q = operationLogQuery.toLowerCase()
    return operationLogs.filter(
      (l) =>
        l.title.toLowerCase().includes(q) ||
        l.message.toLowerCase().includes(q) ||
        l.type.toLowerCase().includes(q)
    )
  }, [operationLogs, operationLogQuery])

  // 加速页：从镜像名提取下拉建议
  const pullImageSuggestions = useMemo(() => {
    const names = new Set<string>()
    images.forEach((img) => {
      const fullName = img.name && img.tag ? `${img.name}:${img.tag}` : img.name
      if (fullName) names.add(fullName)
    })
    return Array.from(names).slice(0, 20)
  }, [images])

  const blacklistSuggestions = useMemo(() => {
    const names = new Set<string>()
    images.forEach((img) => {
      getImageBlacklistCandidates(img).forEach((candidate) => names.add(candidate))
    })
    return Array.from(names).sort()
  }, [getImageBlacklistCandidates, images])

  // 过滤下拉建议
  const filteredPullSuggestions = useMemo(() => {
    if (!pullImageName.trim()) return pullImageSuggestions
    const q = pullImageName.toLowerCase()
    return pullImageSuggestions.filter((s) => s.toLowerCase().includes(q))
  }, [pullImageName, pullImageSuggestions])

  // 登录页
  if (booting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <LoaderCircle className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-sky-100 px-4 dark:from-slate-950 dark:to-slate-900">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <div className="mb-4 flex justify-center">
              <img
                src={`${currentOrigin}/m/logo.png`}
                alt="Docker Copilot"
                className="h-28 w-28 rounded-2xl object-cover shadow-xl ring-1 ring-slate-200/70 dark:ring-slate-700/60"
              />
            </div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Docker Copilot</h1>
            <p className="mt-2 text-slate-600 dark:text-slate-400">请输入密钥进行认证</p>
          </div>

          <div className="rounded-3xl bg-white/95 p-6 shadow-xl ring-1 ring-slate-200/70 backdrop-blur dark:bg-slate-900/95 dark:ring-slate-800">
            <div className="space-y-4">
              <div>
                <label htmlFor="secretKey" className="sr-only">
                  密钥
                </label>
                <div className="relative">
                  <input
                    id="secretKey"
                    name="secretKey"
                    type={showPassword ? "text" : "password"}
                    value={secretKey}
                    onChange={(e) => setSecretKey(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                    placeholder="请输入您的密钥"
                    className="block w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-11 text-sm text-slate-900 placeholder-slate-400 shadow-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:ring-blue-900/40"
                  />
                  <Key className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-300"
                    title={showPassword ? "隐藏密钥" : "显示密钥"}
                    aria-label={showPassword ? "隐藏密钥" : "显示密钥"}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {authError && (
                <div className="rounded-2xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
                  {authError}
                </div>
              )}

              <button
                type="button"
                onClick={handleLogin}
                disabled={loginLoading}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loginLoading ? (
                  <>
                    <LoaderCircle className="h-5 w-5 animate-spin" />
                    <span>认证中...</span>
                  </>
                ) : (
                  <>
                    <LogIn className="h-5 w-5" />
                    <span>登录</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-100 dark:bg-slate-950 transition-colors duration-300">
      {/* 顶部栏 */}
      <header className="sticky top-0 z-50 flex items-center justify-between bg-white/80 dark:bg-slate-900/80 backdrop-blur-md px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <img
            src={`${currentOrigin}/m/logo.png`}
            alt="Docker Copilot"
            className="h-7 w-7 rounded-lg object-contain"
          />
          <h1 className="text-base font-bold text-slate-900 dark:text-slate-100">Docker Copilot</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={refreshAll}
            disabled={refreshing}
            className="rounded-xl p-2 text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800"
            title="刷新数据"
            aria-label="刷新数据"
          >
            {refreshing ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <RefreshCw className="h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            className="rounded-xl p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title={themeMode === "dark" ? "切换日间模式" : "切换夜间模式"}
          >
            <ThemeIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-xl p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="退出登录"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* 通知条 */}
      {notice && (
        <div
          className={cn(
            "mx-4 mt-3 flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium shadow-sm",
            notice.type === "success" && "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300",
            notice.type === "error" && "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400",
            notice.type === "info" && "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
          )}
        >
          {notice.type === "success" && <CheckCircle2 className="h-4 w-4 shrink-0" />}
          {notice.type === "error" && <AlertCircle className="h-4 w-4 shrink-0" />}
          {notice.type === "info" && <Info className="h-4 w-4 shrink-0" />}
          <span className="flex-1">{notice.message}</span>
        </div>
      )}

      {/* 主内容 */}
      <main className="flex-1 overflow-y-auto px-4 pt-3 pb-20">

        {/* ============ 容器页 ============ */}
        {activePage === "containers" && (
          <div className="space-y-4">
            {/* 搜索 */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={containerQuery}
                onChange={(e) => setContainerQuery(e.target.value)}
                placeholder="搜索容器..."
                className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900"
              />
            </div>

            {/* 统计卡片：总数、运行、更新、暂停 */}
            <div className="grid grid-cols-4 gap-3">
              <StatCard label="总数" value={containerStats.total} accent="bg-slate-400" active={containerFilter === "all"} onClick={() => setContainerFilter("all")} />
              <StatCard label="运行" value={containerStats.running} accent="bg-emerald-500" active={containerFilter === "running"} onClick={() => setContainerFilter((prev) => (prev === "running" ? "all" : "running"))} />
              <StatCard label="更新" value={containerStats.updatable} accent="bg-blue-500" active={containerFilter === "updatable"} onClick={() => setContainerFilter((prev) => (prev === "updatable" ? "all" : "updatable"))} />
              <StatCard label="暂停" value={containerStats.paused} accent="bg-amber-500" active={containerFilter === "paused"} onClick={() => setContainerFilter((prev) => (prev === "paused" ? "all" : "paused"))} />
            </div>

            {/* 列表 */}
            {refreshing ? (
              <div className="flex items-center justify-center py-12">
                <LoaderCircle className="h-6 w-6 animate-spin text-blue-500" />
              </div>
            ) : filteredContainers.length === 0 ? (
              <EmptyState title="暂无容器" description={containerQuery || containerFilter !== "all" ? "未找到匹配的容器" : "没有可显示的容器"} />
            ) : (
              <div className="space-y-3">
                {filteredContainers.map((c) => {
                  const status = formatContainerStatus(c.status)
                  const isIgnored = isUpdateIgnored(c)
                  const blacklistBusy = blacklistPendingKey === `container-${c.id}`
                  const primaryAction = status.isRunning ? "stop" : "start"
                  const primaryPending = pendingAction === `${primaryAction}-${c.id}`
                  const endpointLink = getContainerEndpointLink(c)
                  const canOpenEndpoint = status.isRunning && endpointLink.isRunning && !!endpointLink.suggestedURL
                  return (
                    <div
                      key={c.id}
                      className={cn(
                        "rounded-2xl p-4 shadow-sm ring-1 transition-all",
                        isIgnored
                          ? "bg-slate-100/90 dark:bg-slate-900/90 ring-slate-300 dark:ring-slate-700 opacity-70 grayscale"
                          : "bg-white dark:bg-slate-900 ring-slate-100 dark:ring-slate-700"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
                          {getContainerIcon(c) ? (
                            <img src={getContainerIcon(c)!} alt="" className="h-8 w-8 object-contain" />
                          ) : (
                            <Server className="h-5 w-5 text-slate-400" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{c.name}</span>
                            <span className={cn("inline-flex h-2.5 w-2.5 rounded-full", status.dot)} title={status.label} />
                            {canOpenEndpoint ? (
                              <a
                                href={endpointLink.suggestedURL}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-sky-50 text-sky-600 transition-colors hover:bg-sky-100 dark:bg-sky-900/20 dark:text-sky-400 dark:hover:bg-sky-900/40"
                                title="打开 WebUI"
                                aria-label="打开 WebUI"
                              >
                                <Globe className="h-3 w-3" />
                              </a>
                            ) : null}
                            {isIgnored ? (
                              <span className="inline-flex items-center justify-center text-amber-600 dark:text-amber-300" title="已忽略">
                                <EyeOff className="h-3.5 w-3.5" />
                              </span>
                            ) : c.haveUpdate ? (
                              <span className="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
                                更新
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{c.usingImage}</p>
                          <p className="text-xs text-slate-400 dark:text-slate-500">{c.runningTime}</p>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-5 gap-2">
                        <button
                          type="button"
                          onClick={() => handleContainerAction(c.id, primaryAction)}
                          disabled={primaryPending}
                          title={primaryAction === "stop" ? "停止容器" : "启动容器"}
                          aria-label={primaryAction === "stop" ? "停止容器" : "启动容器"}
                          className={cn(
                            "flex h-10 w-full items-center justify-center rounded-xl border transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                            primaryAction === "stop"
                              ? "border-red-200 bg-red-50 text-red-600 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30"
                              : "border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-400 dark:hover:bg-emerald-900/30"
                          )}
                        >
                          {primaryPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : primaryAction === "stop" ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleContainerAction(c.id, "restart")}
                          disabled={pendingAction === `restart-${c.id}`}
                          title="重启容器"
                          aria-label="重启容器"
                          className="flex h-10 w-full items-center justify-center rounded-xl border border-amber-200 bg-amber-50 text-amber-600 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-400 dark:hover:bg-amber-900/30"
                        >
                          {pendingAction === `restart-${c.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleContainerUpdate(c)}
                          disabled={!c.haveUpdate || isIgnored || pendingAction === `update-${c.id}`}
                          title={isIgnored ? "该容器已在更新黑名单中" : c.haveUpdate ? "更新容器" : "当前没有可用更新"}
                          aria-label="更新容器"
                          className={cn(
                            "flex h-10 w-full items-center justify-center rounded-xl border transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                            c.haveUpdate && !isIgnored
                              ? "border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 dark:border-blue-900/50 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30"
                              : "border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500"
                          )}
                        >
                          {pendingAction === `update-${c.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleContainerIgnore(c)}
                          disabled={blacklistBusy}
                          title={isIgnored ? "取消忽略更新" : "忽略更新"}
                          aria-label={isIgnored ? "取消忽略更新" : "忽略更新"}
                          className={cn(
                            "flex h-10 w-full items-center justify-center rounded-xl border transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                            isIgnored
                              ? "border-amber-200 bg-amber-50 text-amber-600 hover:bg-amber-100 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-400 dark:hover:bg-amber-900/30"
                              : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                          )}
                        >
                          {blacklistBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : isIgnored ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenContainerLogs(c)}
                          title="查看容器日志"
                          aria-label="查看容器日志"
                          className="flex h-10 w-full items-center justify-center rounded-xl border border-violet-200 bg-violet-50 text-violet-600 transition-colors hover:bg-violet-100 dark:border-violet-900/50 dark:bg-violet-900/20 dark:text-violet-400 dark:hover:bg-violet-900/30"
                        >
                          <TerminalSquare className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ============ 镜像页 ============ */}
        {activePage === "images" && (
          <div className="space-y-4">
            {/* 搜索 */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={imageQuery}
                onChange={(e) => setImageQuery(e.target.value)}
                placeholder="搜索镜像..."
                className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900"
              />
            </div>

            {/* 统计卡片：4个一行 */}
            <div className="grid grid-cols-4 gap-3">
              <StatCard label="总数" value={imageStats.total} accent="bg-slate-400" active={imageFilter === "all"} onClick={() => setImageFilter("all")} />
              <StatCard label="使用" value={imageStats.inUse} accent="bg-emerald-500" active={imageFilter === "inUse"} onClick={() => setImageFilter((prev) => (prev === "inUse" ? "all" : "inUse"))} />
              <StatCard label="空隙" value={imageStats.unused} accent="bg-amber-500" active={imageFilter === "unused"} onClick={() => setImageFilter((prev) => (prev === "unused" ? "all" : "unused"))} />
              <StatCard label="更新" value={imageStats.updatable} accent="bg-blue-500" active={imageFilter === "updatable"} onClick={() => setImageFilter((prev) => (prev === "updatable" ? "all" : "updatable"))} />
            </div>

            {/* 列表 */}
            {refreshing ? (
              <div className="flex items-center justify-center py-12">
                <LoaderCircle className="h-6 w-6 animate-spin text-blue-500" />
              </div>
            ) : filteredImages.length === 0 ? (
              <EmptyState title="暂无镜像" description={imageQuery ? "未找到匹配的镜像" : "没有可显示的镜像"} />
            ) : (
              <div className="space-y-3">
                {filteredImages.map((img) => {
                  const repoLinks = parseImageRepoLink(img.name, img.tag)
                  const isIgnored = isImageUpdateIgnored(img)
                  const blacklistBusy = blacklistPendingKey === `image-${img.id}`
                  const pullTarget = buildPullTarget(img)
                  return (
                    <div
                      key={img.id}
                      className={cn(
                        "rounded-2xl p-4 shadow-sm ring-1 transition-all",
                        isIgnored
                          ? "bg-slate-100/90 dark:bg-slate-900/90 ring-slate-300 dark:ring-slate-700 opacity-70 grayscale"
                          : "bg-white dark:bg-slate-900 ring-slate-100 dark:ring-slate-700"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
                          <Package className="h-5 w-5 text-slate-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {img.name}:{img.tag}
                            </span>
                            {img.inUsed && <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" title="使用" />}
                            {isIgnored ? (
                              <span className="inline-flex items-center justify-center text-amber-600 dark:text-amber-300" title="已忽略">
                                <EyeOff className="h-3.5 w-3.5" />
                              </span>
                            ) : img.haveUpdate ? (
                              <span className="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
                                更新
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                            {(repoLinks.github || repoLinks.dockerHub) && (
                              <a
                                href={repoLinks.github || repoLinks.dockerHub}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={cn(
                                  "inline-flex h-5 w-5 items-center justify-center rounded-md transition-colors",
                                  repoLinks.github
                                    ? "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                                    : "bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40"
                                )}
                                title={repoLinks.github ? "GitHub" : "Docker Hub"}
                                aria-label={repoLinks.github ? "GitHub" : "Docker Hub"}
                              >
                                {repoLinks.github ? <Github className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
                              </a>
                            )}
                            <span>{img.size}</span>
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-4 gap-2">
                        <button
                          type="button"
                          onClick={() => handleDeleteImage(img.id)}
                          disabled={pendingAction === `delete-${img.id}`}
                          title="删除镜像"
                          aria-label="删除镜像"
                          className="flex h-10 w-full items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-600 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30"
                        >
                          {pendingAction === `delete-${img.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleImageUpdate(img)}
                          disabled={!img.haveUpdate || isIgnored || pendingAction === `update-image-${img.id}`}
                          title={isIgnored ? "该镜像已在更新黑名单中" : img.haveUpdate ? "更新镜像" : "当前没有可用更新"}
                          aria-label="更新镜像"
                          className={cn(
                            "flex h-10 w-full items-center justify-center rounded-xl border transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                            img.haveUpdate && !isIgnored
                              ? "border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 dark:border-blue-900/50 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30"
                              : "border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500"
                          )}
                        >
                          {pendingAction === `update-image-${img.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPullImageName(pullTarget || img.name)
                            setActivePage("backups")
                          }}
                          title="打开加速拉取"
                          aria-label="打开加速拉取"
                          className="flex h-10 w-full items-center justify-center rounded-xl border border-purple-200 bg-purple-50 text-purple-600 transition-colors hover:bg-purple-100 dark:border-purple-900/50 dark:bg-purple-900/20 dark:text-purple-400 dark:hover:bg-purple-900/30"
                        >
                          <Zap className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleImageIgnore(img)}
                          disabled={blacklistBusy}
                          title={isIgnored ? "取消忽略更新" : "忽略更新"}
                          aria-label={isIgnored ? "取消忽略更新" : "忽略更新"}
                          className={cn(
                            "flex h-10 w-full items-center justify-center rounded-xl border transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                            isIgnored
                              ? "border-amber-200 bg-amber-50 text-amber-600 hover:bg-amber-100 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-400 dark:hover:bg-amber-900/30"
                              : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                          )}
                        >
                          {blacklistBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : isIgnored ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ============ 配置页 ============ */}
        {activePage === "config" && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-white dark:bg-slate-900 p-5 shadow-sm ring-1 ring-slate-100 dark:ring-slate-700">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-4">基础配置</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Bot Token</label>
                  <input
                    type="text"
                    value={configForm.botToken}
                    onChange={(e) => setConfigForm((p) => ({ ...p, botToken: e.target.value }))}
                    placeholder="Telegram Bot Token"
                    className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Chat IDs</label>
                  <input
                    type="text"
                    value={configForm.chatIds}
                    onChange={(e) => setConfigForm((p) => ({ ...p, chatIds: e.target.value }))}
                    placeholder="多个 ID 用逗号分隔"
                    className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">主机 LAN IP</label>
                  <input
                    type="text"
                    value={configForm.hostLanIP}
                    onChange={(e) => setConfigForm((p) => ({ ...p, hostLanIP: e.target.value }))}
                    placeholder="192.168.x.x"
                    className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">默认镜像加速器</label>
                  <input
                    type="text"
                    value={configForm.defaultImageAccelerator}
                    onChange={(e) => setConfigForm((p) => ({ ...p, defaultImageAccelerator: e.target.value }))}
                    placeholder="docker.io"
                    className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">更新检查 Cron</label>
                  <input
                    type="text"
                    value={configForm.updateCheckCron}
                    onChange={(e) => setConfigForm((p) => ({ ...p, updateCheckCron: e.target.value }))}
                    placeholder="0 */6 * * *"
                    className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900"
                  />
                </div>
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                  <label className="flex items-center gap-3 text-sm font-medium text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={configForm.autoCleanImages}
                      onChange={(e) => setConfigForm((p) => ({ ...p, autoCleanImages: e.target.checked }))}
                      className="h-4 w-4 rounded border-slate-300 text-blue-500 focus:ring-blue-400"
                    />
                    自动清理镜像
                  </label>
                  {configForm.autoCleanImages && (
                    <input
                      type="text"
                      value={configForm.cleanImagesCron}
                      onChange={(e) => setConfigForm((p) => ({ ...p, cleanImagesCron: e.target.value }))}
                      placeholder="3 2 * * *"
                      className="mt-3 block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900"
                    />
                  )}
                </div>
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                  <label className="flex items-center gap-3 text-sm font-medium text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={configForm.autoUpdateContainers}
                      onChange={(e) => setConfigForm((p) => ({ ...p, autoUpdateContainers: e.target.checked }))}
                      className="h-4 w-4 rounded border-slate-300 text-blue-500 focus:ring-blue-400"
                    />
                    自动更新容器
                  </label>
                  {configForm.autoUpdateContainers && (
                    <input
                      type="text"
                      value={configForm.updateContainersCron}
                      onChange={(e) => setConfigForm((p) => ({ ...p, updateContainersCron: e.target.value }))}
                      placeholder="0 */6 * * *"
                      className="mt-3 block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900"
                    />
                  )}
                </div>
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                  <label className="flex items-center gap-3 text-sm font-medium text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={configForm.autoBackupJson}
                      onChange={(e) => setConfigForm((p) => ({ ...p, autoBackupJson: e.target.checked }))}
                      className="h-4 w-4 rounded border-slate-300 text-blue-500 focus:ring-blue-400"
                    />
                    自动备份 JSON
                  </label>
                  {configForm.autoBackupJson && (
                    <input
                      type="text"
                      value={configForm.backupJsonCron}
                      onChange={(e) => setConfigForm((p) => ({ ...p, backupJsonCron: e.target.value }))}
                      placeholder="0 1 * * *"
                      className="mt-3 block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900"
                    />
                  )}
                </div>
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                  <label className="flex items-center gap-3 text-sm font-medium text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={configForm.autoBackupCompose}
                      onChange={(e) => setConfigForm((p) => ({ ...p, autoBackupCompose: e.target.checked }))}
                      className="h-4 w-4 rounded border-slate-300 text-blue-500 focus:ring-blue-400"
                    />
                    自动备份 Compose
                  </label>
                  {configForm.autoBackupCompose && (
                    <input
                      type="text"
                      value={configForm.backupComposeCron}
                      onChange={(e) => setConfigForm((p) => ({ ...p, backupComposeCron: e.target.value }))}
                      placeholder="30 1 * * *"
                      className="mt-3 block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900"
                    />
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleSaveConfig}
                  disabled={configSaving}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-600 disabled:opacity-50"
                >
                  {configSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {configSaving ? "保存中..." : "保存配置"}
                </button>
              </div>
            </div>

            {/* 黑名单 */}
            <div className="rounded-2xl bg-white dark:bg-slate-900 p-5 shadow-sm ring-1 ring-slate-100 dark:ring-slate-700">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-3">更新黑名单</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                添加镜像名以忽略其更新提醒。每行一个。
              </p>
              <div className="mb-3 space-y-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">从全部镜像添加</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    list="blacklist-image-options"
                    value={blacklistDraft}
                    onChange={(e) => setBlacklistDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        handleAddBlacklistItem()
                      }
                    }}
                    placeholder="输入或选择镜像名"
                    className="block flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900"
                  />
                  <datalist id="blacklist-image-options">
                    {blacklistSuggestions.map((item) => (
                      <option key={item} value={item} />
                    ))}
                  </datalist>
                  <button
                    type="button"
                    onClick={handleAddBlacklistItem}
                    className="shrink-0 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-100 dark:border-blue-900/50 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30"
                  >
                    添加
                  </button>
                </div>
              </div>
              <textarea
                value={updateBlacklist.join("\n")}
                onChange={(e) => setUpdateBlacklist(e.target.value.split("\n").filter(Boolean))}
                rows={6}
                className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900"
                placeholder="nginx&#10;redis"
              />
              <button
                type="button"
                onClick={() => handleSaveBlacklist(updateBlacklist)}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-600"
              >
                <CheckCircle2 className="h-4 w-4" />
                保存黑名单
              </button>
            </div>
          </div>
        )}

        {/* ============ 加速页（原备份页改为加速） ============ */}
        {activePage === "backups" && (
          <div className="space-y-4">
            {/* 镜像拉取表单 - ComboBox */}
            <div className="rounded-2xl bg-white dark:bg-slate-900 p-5 shadow-sm ring-1 ring-slate-100 dark:ring-slate-700">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-4">拉取镜像</h2>
              <div className="space-y-3">
                <div className="relative">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">镜像名称</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={pullImageName}
                      onChange={(e) => {
                        setPullImageName(e.target.value)
                        setPullImageDropdownOpen(true)
                      }}
                      onFocus={() => setPullImageDropdownOpen(true)}
                      onBlur={() => setTimeout(() => setPullImageDropdownOpen(false), 200)}
                      placeholder="如 nginx:latest 或手动输入"
                      className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900"
                    />
                    {pullImageDropdownOpen && filteredPullSuggestions.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg max-h-48 overflow-y-auto">
                        {filteredPullSuggestions.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onMouseDown={() => {
                              setPullImageName(s)
                              setPullImageDropdownOpen(false)
                            }}
                            className="block w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">加速源</label>
                  <input
                    type="text"
                    value={pullImageSource}
                    onChange={(e) => setPullImageSource(e.target.value)}
                    placeholder="docker.io（可选）"
                    className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900"
                  />
                </div>
                <button
                  type="button"
                  onClick={handlePullImage}
                  disabled={pendingAction === "pull"}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-purple-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-purple-600 disabled:opacity-50"
                >
                  {pendingAction === "pull" ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  {pendingAction === "pull" ? "拉取中..." : "拉取镜像"}
                </button>
              </div>
            </div>

            {/* 操作日志模块：放在加速页下方 */}
            <div className="rounded-2xl bg-white dark:bg-slate-900 p-5 shadow-sm ring-1 ring-slate-100 dark:ring-slate-700">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-3">操作日志</h2>
              {operationLogs.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-6">暂无操作记录</p>
              ) : (
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {operationLogs.slice(0, 50).map((log, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 dark:text-slate-500 shrink-0">{log.time}</span>
                        <span className={cn(
                          "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                          (log.type === "info" || log.type === "INFO") && "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
                          (log.type === "warn" || log.type === "WARN" || log.type === "warning" || log.type === "WARNING") && "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
                          (log.type === "error" || log.type === "ERROR" || log.type === "err" || log.type === "ERR") && "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400"
                        )}>
                          {log.type.toUpperCase()}
                        </span>
                        <span className="font-medium text-slate-700 dark:text-slate-300 truncate">{log.title}</span>
                      </div>
                      {log.message && (
                        <p className="mt-1 text-slate-500 dark:text-slate-400 break-all">{log.message}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============ 日志页 ============ */}
        {activePage === "logs" && (
          <div className="space-y-4">
            {/* 统计卡片：4个一行 */}
            <div className="grid grid-cols-4 gap-3">
              <StatCard label="总数" value={logStats.total} accent="bg-slate-400" />
              <StatCard label="信息" value={logStats.info} accent="bg-blue-500" />
              <StatCard label="警告" value={logStats.warn} accent="bg-amber-500" />
              <StatCard label="错误" value={logStats.error} accent="bg-red-500" />
            </div>

            {/* 容器选择 + 按钮（同一行） */}
            <div className="rounded-2xl bg-white dark:bg-slate-900 p-4 shadow-sm ring-1 ring-slate-100 dark:ring-slate-700">
              <div className="flex items-center gap-2">
                <select
                  value={selectedLogContainerId}
                  onChange={(e) => setSelectedLogContainerId(e.target.value)}
                  className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900"
                >
                  <option value="">选择容器</option>
                  {containers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleFetchContainerLogs}
                  disabled={containerLogsLoading || !selectedLogContainerId}
                  className="flex items-center gap-0 min-[390px]:gap-1.5 rounded-xl bg-blue-50 dark:bg-blue-900/20 px-3 py-2 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 disabled:opacity-50 transition-colors"
                >
                  {containerLogsLoading ? (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <TerminalSquare className="h-3.5 w-3.5" />
                  )}
                  <span className="hidden min-[390px]:inline">读取</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopyLogs}
                  disabled={!containerLogs}
                  className="flex items-center gap-0 min-[390px]:gap-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span className="hidden min-[390px]:inline">复制</span>
                </button>
              </div>
            </div>

            {/* 日志内容 */}
            {containerLogsError && (
              <div className="rounded-xl bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                {containerLogsError}
              </div>
            )}
            {containerLogs && (
              <div className="rounded-2xl bg-white dark:bg-slate-900 p-4 shadow-sm ring-1 ring-slate-100 dark:ring-slate-700">
                <pre className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-all font-mono max-h-96 overflow-y-auto">
                  {containerLogs}
                </pre>
              </div>
            )}
            {!containerLogs && !containerLogsLoading && !containerLogsError && (
              <EmptyState title="选择容器查看日志" description="请在上方选择一个容器并点击读取" />
            )}
          </div>
        )}

        {/* ============ 关于页 ============ */}
        {activePage === "about" && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-white dark:bg-slate-900 p-5 text-center shadow-sm ring-1 ring-slate-100 dark:ring-slate-700">
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-900/20">
                <img
                  src={`${currentOrigin}/m/logo.png`}
                  alt="Docker Copilot"
                  className="h-14 w-14 rounded-xl object-contain"
                />
              </div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Docker Copilot</h2>
              {version && (
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  版本 {version.version} · {version.build_date}
                </p>
              )}
              <p className="mt-3 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                一个简洁、优雅且强大的 Docker 容器管理工具，旨在为您提供流畅的容器运维体验。
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <a
                  href="https://github.com/onlyLTY/dockerCopilot"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                >
                  <Github className="h-4 w-4" />
                  <span>GitHub</span>
                </a>
                <a
                  href="https://github.com/onlyLTY/dockerCopilot/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <HelpCircle className="h-4 w-4" />
                  <span>反馈建议</span>
                </a>
              </div>
            </div>

            <div className="rounded-2xl bg-white dark:bg-slate-900 p-5 shadow-sm ring-1 ring-slate-100 dark:ring-slate-700">
              <div className="mb-4 flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300">
                  <Download className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">程序更新</h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                    支持远端拉取更新，也支持手动上传匹配架构的 Linux 二进制或 tar.gz 更新包。
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
                  <div className="text-xs text-slate-500 dark:text-slate-400">当前版本</div>
                  <div className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">{backendVersion || version?.version || "--"}</div>
                  <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">{version?.build_date || "未获取到构建时间"}</div>
                </div>
                <div
                  className={cn(
                    "rounded-xl border p-4",
                    hasBackendUpdate
                      ? "border-amber-200 bg-amber-50 dark:border-amber-800/60 dark:bg-amber-900/20"
                      : "border-emerald-200 bg-emerald-50 dark:border-emerald-800/60 dark:bg-emerald-900/20"
                  )}
                >
                  <div className="text-xs text-slate-500 dark:text-slate-400">远端检测</div>
                  <div className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">
                    {hasBackendUpdate ? `发现新版本 ${remoteVersion || "--"}` : "当前已是最新版本"}
                  </div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {remoteVersion ? `远端版本：${remoteVersion}` : "暂未获取到远端版本"}
                  </div>
                </div>
              </div>

              <div
                className={cn(
                  "mt-4 rounded-xl border px-4 py-3 text-sm leading-relaxed",
                  hasBackendUpdate
                    ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800/60 dark:bg-blue-900/20 dark:text-blue-300"
                    : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300"
                )}
              >
                {hasBackendUpdate
                  ? "检测到程序有可用更新。更新过程中服务可能短暂重启，请尽量在了解当前运行状态后操作。"
                  : "当前程序版本与远端检测结果一致。如果你需要重装同版本，仍可使用下方的强制覆盖或手动上传方式。"}
              </div>

              <div className="mt-4 flex flex-col gap-3 min-[420px]:flex-row">
                <button
                  type="button"
                  onClick={handleCheckProgramUpdates}
                  disabled={isUpdatingProgram}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <RefreshCw className={cn("h-4 w-4", isUpdatingProgram && "animate-spin")} />
                  检查更新
                </button>
                <button
                  type="button"
                  onClick={postUpdateNeedsRefresh ? handleRefreshAfterProgramUpdate : () => handleRemoteProgramUpdate(false)}
                  disabled={isUpdatingProgram}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-50",
                    postUpdateNeedsRefresh ? "bg-emerald-500 hover:bg-emerald-600" : "bg-blue-500 hover:bg-blue-600"
                  )}
                >
                  {isUpdatingProgram ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  {postUpdateNeedsRefresh ? "刷新页面" : "远端拉取更新"}
                </button>
              </div>

              {showForceUpdate && !postUpdateNeedsRefresh ? (
                <button
                  type="button"
                  onClick={() => handleRemoteProgramUpdate(true)}
                  disabled={isUpdatingProgram}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50 dark:border-amber-800/60 dark:bg-amber-900/20 dark:text-amber-300 dark:hover:bg-amber-900/30"
                >
                  <RefreshCw className={cn("h-4 w-4", isUpdatingProgram && "animate-spin")} />
                  强制覆盖更新（重下同版本）
                </button>
              ) : null}

              <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-800/40">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">手动上传更新包</div>
                <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  请选择与当前机器架构匹配的 Linux dockerCopilot 二进制或 tar.gz、tgz 更新包，后端会再次校验架构。
                </p>
                <label className="mt-3 inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-2.5 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50 dark:border-blue-900/50 dark:bg-slate-900 dark:text-blue-400 dark:hover:bg-slate-800">
                  <Github className="h-4 w-4" />
                  选择更新文件
                  <input
                    type="file"
                    className="hidden"
                    disabled={isUpdatingProgram}
                    accept=".gz,.tgz,.tar.gz,application/gzip,application/x-gzip,application/octet-stream"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null
                      e.target.value = ""
                      setPendingProgramFile(file)
                    }}
                  />
                </label>

                {pendingProgramFile && !isUpdatingProgram ? (
                  <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-900/50 dark:bg-blue-900/20 dark:text-blue-300">
                    <div className="font-medium break-all">已选择：{pendingProgramFile.name}</div>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setPendingProgramFile(null)}
                        className="flex-1 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-50 dark:border-blue-900/50 dark:bg-slate-900 dark:text-blue-300 dark:hover:bg-slate-800"
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUploadProgramUpdate(pendingProgramFile)}
                        className="flex-1 rounded-lg bg-blue-500 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-600"
                      >
                        确认上传更新
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              {updateMessage || isUpdatingProgram || updateTaskId ? (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
                  {updateMessage ? (
                    <div
                      className={cn(
                        "text-sm",
                        postUpdateNeedsRefresh ? "text-emerald-700 dark:text-emerald-300" : "text-slate-700 dark:text-slate-200"
                      )}
                    >
                      {postUpdateNeedsRefresh ? "更新已完成，请刷新页面。" : updateMessage}
                    </div>
                  ) : null}
                  {updateTaskId ? <div className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">任务 ID：{updateTaskId}</div> : null}
                  {isUpdatingProgram ? (
                    <>
                      <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                        <span>{isReconnectChecking ? "服务恢复检测中" : "更新进度"}</span>
                        <span>{Math.max(0, Math.min(100, Number(updateProgress) || 0))}%</span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 transition-all duration-500"
                          style={{ width: `${Math.max(0, Math.min(100, Number(updateProgress) || 0))}%` }}
                        />
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <a
                  href="https://github.com/ifsherlock/dockerCopilot/releases/latest"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <Github className="h-4 w-4" />
                  最新 Release
                </a>
                <a
                  href="https://github.com/ifsherlock/FnDepot"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <Github className="h-4 w-4" />
                  飞牛套件版
                </a>
              </div>
            </div>

            <div className="rounded-2xl bg-white dark:bg-slate-900 p-5 shadow-sm ring-1 ring-slate-100 dark:ring-slate-700">
              <div className="mb-3 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-500" />
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">改版声明</h3>
              </div>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                本项目使用AI进行二次开发，增加了视图模式，tgbot交互等功能，请在理解风险的前提下使用：容器管理、程序自更新和自动化操作可能影响正在运行的服务；使用者应自行备份配置并承担由环境差异、误操作或第三方服务变化带来的风险。
              </p>
            </div>

            <div className="rounded-2xl bg-white dark:bg-slate-900 p-5 shadow-sm ring-1 ring-slate-100 dark:ring-slate-700">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">致谢 / Thanks</h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                感谢原作者 onlyLTY 开源 Docker Copilot；本项目核心源码由 onlyLTY 编写，也感谢所有使用者的建议、反馈和鼓励，让这个工具持续变得更好。
              </p>
            </div>
          </div>
        )}

      </main>

      {/* 底部导航 */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md px-2 py-2 shadow-lg">
        {navItems.map((item) => (
          <NavItem
            key={item.key}
            icon={item.icon}
            label={item.label}
            active={activePage === item.key}
            onClick={() => setActivePage(item.key)}
          />
        ))}
      </nav>
    </div>
  )
}
