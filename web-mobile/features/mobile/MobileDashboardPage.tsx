"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertCircle,
  Box,
  CheckCircle2,
  EyeOff,
  FileText,
  Eye,
  Info,
  Key,
  LoaderCircle,
  LogIn,
  LogOut,
  Moon,
  Package,
  RefreshCw,
  Settings,
  Sun,
  Zap,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { getImageLogo } from "@/lib/imageLogos"
import {
  clearStoredToken,
  getStoredToken,
  mobileApi,
  setStoredToken,
} from "@/lib/api"
import type { ContainerInfo, ImageInfo } from "@/lib/api"
import {
  builtInImageAccelerators,
  getErrorMessage,
  normalizeAcceleratorValue,
  resolveAcceleratorLatencySource,
  useMobileDashboardData,
} from "./hooks/useMobileDashboardData"
import { useMobileProgramUpdate } from "./hooks/useMobileProgramUpdate"
import { NavItem } from "./components/MobilePrimitives"
import { AcceleratorView } from "./views/AcceleratorView"
import { AboutView } from "./views/AboutView"
import { ConfigView } from "./views/ConfigView"
import { ContainersView } from "./views/ContainersView"
import { ImagesView } from "./views/ImagesView"
import { LogsView } from "./views/LogsView"
import {
  formatAcceleratorSourceLabel,
  normalizeIconSource,
  parseContainerLogLine,
} from "./mobileUtils"

type PageType = "containers" | "images" | "config" | "backups" | "logs" | "about"
type NoticeType = "success" | "error" | "info"
type ContainerFilterKey = "all" | "running" | "updatable" | "paused"
type ImageFilterKey = "all" | "inUse" | "unused" | "updatable"
type ContainerLogFilterKey = "all" | "info" | "warn" | "error"

const navItems: Array<{ key: PageType; label: string; icon: typeof Box }> = [
  { key: "containers", label: "容器", icon: Box },
  { key: "images", label: "镜像", icon: Package },
  { key: "config", label: "配置", icon: Settings },
  { key: "backups", label: "加速", icon: Zap },
  { key: "logs", label: "日志", icon: FileText },
  { key: "about", label: "关于", icon: Info },
]

export default function MobileDashboardPage() {
  const [activePage, setActivePage] = useState<PageType>("containers")
  const [booting, setBooting] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [secretKey, setSecretKey] = useState("")
  const [loginLoading, setLoginLoading] = useState(false)
  const [authError, setAuthError] = useState("")
  const [showPassword, setShowPassword] = useState(false)

  const {
    containers,
    setContainers,
    images,
    setImages,
    operationLogs,
    setOperationLogs,
    config,
    setConfig,
    version,
    setVersion,
    refreshing,
    configForm,
    setConfigForm,
    imageAccelerators,
    setImageAccelerators,
    newImageAccelerator,
    setNewImageAccelerator,
    acceleratorLatencyMap,
    updateBlacklist,
    setUpdateBlacklist,
    icons,
    refreshAll,
    resetDashboardData,
  } = useMobileDashboardData()
  const {
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
  } = useMobileProgramUpdate(setVersion)

  const [notice, setNotice] = useState<{ type: NoticeType; message: string } | null>(null)
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  const [configSaving, setConfigSaving] = useState(false)
  const [showBotToken, setShowBotToken] = useState(false)
  const [showLogTimestamps, setShowLogTimestamps] = useState(true)
  const [showLogContainerName, setShowLogContainerName] = useState(false)

  const [blacklistDraft, setBlacklistDraft] = useState("")
  const [containerActions, setContainerActions] = useState<Record<string, { updating?: boolean; ignoring?: boolean }>>({})

  // 加速页状态
  const [pullImageName, setPullImageName] = useState("")
  const [pullImageSource, setPullImageSource] = useState("")
  const [pullImageDropdownOpen, setPullImageDropdownOpen] = useState(false)
  const [containerLogFilter, setContainerLogFilter] = useState<ContainerLogFilterKey>("all")

  const currentOrigin = typeof window !== "undefined" ? window.location.origin : ""
  const [themeMode, setThemeMode] = useState<"light" | "dark">("light")
  const ThemeIcon = themeMode === "dark" ? Sun : Moon
  const imageAcceleratorOptions = useMemo(() => {
    return Array.from(
      new Set(
        [...builtInImageAccelerators, configForm.defaultImageAccelerator, ...imageAccelerators]
          .map(normalizeAcceleratorValue)
          .filter(Boolean)
      )
    )
  }, [configForm.defaultImageAccelerator, imageAccelerators])

  const pullImageSourceOptions = useMemo(() => {
    return Array.from(
      new Set(["docker.io", ...imageAcceleratorOptions].map(normalizeAcceleratorValue).filter(Boolean))
    ).map((source) => {
      const latencyInfo = acceleratorLatencyMap[resolveAcceleratorLatencySource(source)] ?? null
      return {
        value: source,
        label: formatAcceleratorSourceLabel(source, latencyInfo),
        latencyInfo,
      }
    })
  }, [acceleratorLatencyMap, imageAcceleratorOptions])

  const currentPullImageSource = useMemo(
    () => normalizeAcceleratorValue(pullImageSource) || normalizeAcceleratorValue(configForm.defaultImageAccelerator) || "docker.io",
    [configForm.defaultImageAccelerator, pullImageSource]
  )

  const currentPullImageSourceInfo = useMemo(
    () => acceleratorLatencyMap[resolveAcceleratorLatencySource(currentPullImageSource)] ?? null,
    [acceleratorLatencyMap, currentPullImageSource]
  )

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

  useEffect(() => {
    const storedTimestamps = localStorage.getItem("mobile-log-show-timestamps")
    const storedContainerName = localStorage.getItem("mobile-log-show-container-name")
    if (storedTimestamps !== null) setShowLogTimestamps(storedTimestamps !== "false")
    if (storedContainerName !== null) setShowLogContainerName(storedContainerName === "true")
  }, [])

  // 持久化主题
  useEffect(() => {
    localStorage.setItem("mobile-theme", themeMode)
  }, [themeMode])

  useEffect(() => {
    localStorage.setItem("mobile-log-show-timestamps", String(showLogTimestamps))
  }, [showLogTimestamps])

  useEffect(() => {
    localStorage.setItem("mobile-log-show-container-name", String(showLogContainerName))
  }, [showLogContainerName])

  useEffect(() => {
    setContainerLogFilter("all")
  }, [selectedLogContainerId])

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
    resetDashboardData()
    setNotice({ type: "info", message: "已退出登录" })
  }, [resetDashboardData])

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
      refreshAll(loadVersionStatus, () => setNotice(null))
    }
  }, [isAuthenticated, loadVersionStatus, refreshAll])

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) {
        clearTimeout(noticeTimerRef.current)
        noticeTimerRef.current = null
      }
    }
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
      const source = currentPullImageSource
      await mobileApi.pullImage(pullImageName.trim(), source, pullImageName.trim())
      showNotice({ type: "success", message: "拉取任务已提交" })
      setPullImageName("")
      setPullImageSource(source)
      const [iRes, oRes] = await Promise.all([
        mobileApi.getImages(),
        mobileApi.getOperationLogs().catch(() => null),
      ])
      setImages(iRes)
      if (oRes) {
        setOperationLogs(oRes)
      }
    } catch (err) {
      showNotice({ type: "error", message: getErrorMessage(err, "拉取失败") })
    } finally {
      setPendingAction("")
    }
  }, [currentPullImageSource, pullImageName, showNotice])

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
      const normalizedProxyType = configForm.proxyType === "http" || configForm.proxyType === "socks5" ? configForm.proxyType : "none"
      const proxyEnabled = normalizedProxyType !== "none"
      const parsedProxyPort = Number.parseInt(configForm.proxyPort.trim(), 10)
      const normalizedDefaultImageAccelerator = normalizeAcceleratorValue(configForm.defaultImageAccelerator)
      const normalizedImageAccelerators = Array.from(
        new Set(
          [normalizedDefaultImageAccelerator, ...imageAccelerators]
            .map(normalizeAcceleratorValue)
            .filter(Boolean)
        )
      )

      await mobileApi.saveConfig({
        botToken: configForm.botToken || undefined,
        chatIds: configForm.chatIds || undefined,
        hostLanIP: configForm.hostLanIP || undefined,
        imageAccelerators: normalizedImageAccelerators.join(",") || undefined,
        defaultImageAccelerator: normalizedDefaultImageAccelerator || undefined,
        updateCheckCron: configForm.enableUpdateCheck ? configForm.updateCheckCron || "0 18 * * *" : "off",
        autoCleanImages: configForm.autoCleanImages,
        cleanImagesCron: configForm.cleanImagesCron || undefined,
        autoUpdateContainers: configForm.autoUpdateContainers,
        updateContainersCron: configForm.updateContainersCron || undefined,
        proxyType: normalizedProxyType,
        proxyHost: proxyEnabled ? configForm.proxyHost || undefined : undefined,
        proxyPort: proxyEnabled && Number.isFinite(parsedProxyPort) ? parsedProxyPort : undefined,
        proxyUsername: proxyEnabled ? configForm.proxyUsername || undefined : undefined,
        proxyPassword: proxyEnabled ? configForm.proxyPassword || undefined : undefined,
        autoBackupJson: configForm.autoBackupJson,
        backupJsonCron: configForm.backupJsonCron || undefined,
        autoBackupCompose: configForm.autoBackupCompose,
        backupComposeCron: configForm.backupComposeCron || undefined,
      })
      setImageAccelerators(normalizedImageAccelerators)
      setConfigForm((prev) => ({
        ...prev,
        defaultImageAccelerator: normalizedDefaultImageAccelerator,
      }))
      showNotice({ type: "success", message: "配置已保存" })
      const cfgRes = await mobileApi.getConfig()
      setConfig(cfgRes)
    } catch (err) {
      showNotice({ type: "error", message: getErrorMessage(err, "保存失败") })
    } finally {
      setConfigSaving(false)
    }
  }, [configForm, imageAccelerators, showNotice])

  const handleAddImageAccelerator = useCallback(async () => {
    const value = normalizeAcceleratorValue(newImageAccelerator)
    if (!value) return

    const nextList = Array.from(
      new Set([...imageAccelerators, value].map(normalizeAcceleratorValue).filter(Boolean))
    )
    const nextDefault = normalizeAcceleratorValue(configForm.defaultImageAccelerator) || value

    try {
      await mobileApi.saveConfig({
        imageAccelerators: nextList.join(",") || undefined,
        defaultImageAccelerator: nextDefault || undefined,
      })
      setImageAccelerators(nextList)
      setConfigForm((prev) => ({
        ...prev,
        defaultImageAccelerator: nextDefault,
      }))
      setPullImageSource(nextDefault || "docker.io")
      setNewImageAccelerator("")
      const cfgRes = await mobileApi.getConfig()
      setConfig(cfgRes)
      showNotice({ type: "success", message: "镜像加速源已添加" })
    } catch (err) {
      showNotice({ type: "error", message: getErrorMessage(err, "添加失败") })
    }
  }, [configForm.defaultImageAccelerator, imageAccelerators, newImageAccelerator, showNotice])

  const handleSelectImageAccelerator = useCallback(
    async (value: string) => {
      const normalizedValue = normalizeAcceleratorValue(value)
      if (!normalizedValue) return

      setPullImageSource(normalizedValue)
      try {
        await mobileApi.saveConfig({
          imageAccelerators: imageAccelerators.join(",") || undefined,
          defaultImageAccelerator: normalizedValue,
        })
        setConfigForm((prev) => ({
          ...prev,
          defaultImageAccelerator: normalizedValue,
        }))
        const cfgRes = await mobileApi.getConfig()
        setConfig(cfgRes)
        showNotice({ type: "success", message: `默认加速源已切换为 ${normalizedValue}` })
      } catch (err) {
        showNotice({ type: "error", message: getErrorMessage(err, "切换失败") })
      }
    },
    [imageAccelerators, showNotice]
  )


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
      const imageName = String(container.usingImage || container.createImage || "").trim()
      if (!imageName) return null

      const direct = normalizeIconSource(getImageLogo(imageName, icons))
      if (direct) return direct

      const canonical = canonicalImageName(imageName)
      if (canonical) {
        const canonicalIcon = normalizeIconSource(getImageLogo(canonical, icons))
        if (canonicalIcon) return canonicalIcon
      }

      return null
    },
    [icons, canonicalImageName]
  )

  const getImageIcon = useCallback(
    (image: ImageInfo): string | null => {
      const pullTarget = buildPullTarget(image)
      const rawName = String(image.name || "").trim()

      if (pullTarget) {
        const targetIcon = normalizeIconSource(getImageLogo(pullTarget, icons))
        if (targetIcon) return targetIcon
      }

      if (rawName) {
        const rawIcon = normalizeIconSource(getImageLogo(rawName, icons))
        if (rawIcon) return rawIcon
      }

      const canonicalName = canonicalImageName(image.name)
      if (canonicalName) {
        const canonicalIcon = normalizeIconSource(getImageLogo(canonicalName, icons))
        if (canonicalIcon) return canonicalIcon
      }

      return null
    },
    [buildPullTarget, canonicalImageName, icons]
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

  const parsedContainerLogs = useMemo(() => {
    return containerLogs
      .split(/\r?\n/)
      .map((line) => parseContainerLogLine(line))
      .filter((line) => line.raw.trim() && line.raw !== "（无日志）")
  }, [containerLogs])

  const logStats = useMemo(() => {
    const stats = parsedContainerLogs.reduce(
      (acc, line) => {
        if (line.level === "info") acc.info += 1
        if (line.level === "warn") acc.warn += 1
        if (line.level === "error") acc.error += 1
        return acc
      },
      { total: parsedContainerLogs.length, info: 0, warn: 0, error: 0 }
    )

    return stats
  }, [parsedContainerLogs])

  const filteredContainerLogs = useMemo(() => {
    if (containerLogFilter === "all") return parsedContainerLogs
    return parsedContainerLogs.filter((line) => line.level === containerLogFilter)
  }, [containerLogFilter, parsedContainerLogs])

  const selectedLogContainer = useMemo(
    () => containers.find((container) => container.id === selectedLogContainerId) ?? null,
    [containers, selectedLogContainerId]
  )

  const canFilterContainerLogs = Boolean(selectedLogContainerId)

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
            onClick={() => refreshAll(loadVersionStatus, () => setNotice(null))}
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
          <ContainersView
            containerQuery={containerQuery}
            setContainerQuery={setContainerQuery}
            containerStats={containerStats}
            containerFilter={containerFilter}
            setContainerFilter={setContainerFilter}
            refreshing={refreshing}
            filteredContainers={filteredContainers}
            isUpdateIgnored={isUpdateIgnored}
            blacklistPendingKey={blacklistPendingKey}
            pendingAction={pendingAction}
            getContainerEndpointLink={getContainerEndpointLink}
            getContainerIcon={getContainerIcon}
            handleContainerAction={handleContainerAction}
            handleContainerUpdate={handleContainerUpdate}
            handleToggleContainerIgnore={handleToggleContainerIgnore}
            handleOpenContainerLogs={handleOpenContainerLogs}
          />
        )}

        {/* ============ 镜像页 ============ */}
        {activePage === "images" && (
          <ImagesView
            imageQuery={imageQuery}
            setImageQuery={setImageQuery}
            imageStats={imageStats}
            imageFilter={imageFilter}
            setImageFilter={setImageFilter}
            refreshing={refreshing}
            filteredImages={filteredImages}
            isImageUpdateIgnored={isImageUpdateIgnored}
            blacklistPendingKey={blacklistPendingKey}
            buildPullTarget={buildPullTarget}
            getImageIcon={getImageIcon}
            handleDeleteImage={handleDeleteImage}
            handleImageUpdate={handleImageUpdate}
            setPullImageName={setPullImageName}
            setActivePage={setActivePage}
            handleToggleImageIgnore={handleToggleImageIgnore}
            pendingAction={pendingAction}
          />
        )}

        {/* ============ 配置页 ============ */}
        {activePage === "config" && (
          <ConfigView
            showBotToken={showBotToken}
            setShowBotToken={setShowBotToken}
            configForm={configForm}
            setConfigForm={setConfigForm}
            handleSaveConfig={handleSaveConfig}
            configSaving={configSaving}
            blacklistDraft={blacklistDraft}
            setBlacklistDraft={setBlacklistDraft}
            handleAddBlacklistItem={handleAddBlacklistItem}
            blacklistSuggestions={blacklistSuggestions}
            updateBlacklist={updateBlacklist}
            setUpdateBlacklist={setUpdateBlacklist}
            handleSaveBlacklist={handleSaveBlacklist}
          />
        )}

        {/* ============ 加速页（原备份页改为加速） ============ */}
        {activePage === "backups" && (
          <AcceleratorView
            pullImageName={pullImageName}
            setPullImageName={setPullImageName}
            pullImageDropdownOpen={pullImageDropdownOpen}
            setPullImageDropdownOpen={setPullImageDropdownOpen}
            filteredPullSuggestions={filteredPullSuggestions}
            currentPullImageSource={currentPullImageSource}
            handleSelectImageAccelerator={handleSelectImageAccelerator}
            pullImageSourceOptions={pullImageSourceOptions}
            currentPullImageSourceInfo={currentPullImageSourceInfo}
            handlePullImage={handlePullImage}
            pendingAction={pendingAction}
            operationLogs={operationLogs}
            newImageAccelerator={newImageAccelerator}
            setNewImageAccelerator={setNewImageAccelerator}
            handleAddImageAccelerator={handleAddImageAccelerator}
          />
        )}

        {/* ============ 日志页 ============ */}
        {activePage === "logs" && (
          <LogsView
            logStats={logStats}
            containerLogFilter={containerLogFilter}
            setContainerLogFilter={setContainerLogFilter}
            canFilterContainerLogs={canFilterContainerLogs}
            selectedLogContainerId={selectedLogContainerId}
            setSelectedLogContainerId={setSelectedLogContainerId}
            setContainerLogs={setContainerLogs}
            setContainerLogsError={setContainerLogsError}
            containers={containers}
            handleFetchContainerLogs={handleFetchContainerLogs}
            containerLogsLoading={containerLogsLoading}
            handleCopyLogs={handleCopyLogs}
            containerLogs={containerLogs}
            showLogTimestamps={showLogTimestamps}
            setShowLogTimestamps={setShowLogTimestamps}
            showLogContainerName={showLogContainerName}
            setShowLogContainerName={setShowLogContainerName}
            containerLogsError={containerLogsError}
            parsedContainerLogs={parsedContainerLogs}
            filteredContainerLogs={filteredContainerLogs}
            selectedLogContainer={selectedLogContainer}
          />
        )}

        {/* ============ 关于页 ============ */}
        {activePage === "about" && (
          <AboutView
            currentOrigin={currentOrigin}
            version={version}
            backendVersion={backendVersion}
            remoteVersion={remoteVersion}
            hasBackendUpdate={hasBackendUpdate}
            isUpdatingProgram={isUpdatingProgram}
            showForceUpdate={showForceUpdate}
            updateMessage={updateMessage}
            updateProgress={updateProgress}
            updateTaskId={updateTaskId}
            isReconnectChecking={isReconnectChecking}
            postUpdateNeedsRefresh={postUpdateNeedsRefresh}
            pendingProgramFile={pendingProgramFile}
            setPendingProgramFile={setPendingProgramFile}
            handleCheckProgramUpdates={handleCheckProgramUpdates}
            handleRemoteProgramUpdate={handleRemoteProgramUpdate}
            handleUploadProgramUpdate={handleUploadProgramUpdate}
            handleRefreshAfterProgramUpdate={handleRefreshAfterProgramUpdate}
          />
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
