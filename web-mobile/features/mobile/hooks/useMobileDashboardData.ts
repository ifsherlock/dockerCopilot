import { useCallback, useState } from "react"

import { ApiError, mobileApi } from "@/lib/api"
import type {
  AcceleratorLatencyInfo,
  ContainerInfo,
  ImageInfo,
  OperationLog,
  QQBotIdentity,
  RuntimeConfig,
  VersionInfo,
} from "@/lib/api"

export type ConfigFormState = {
  botToken: string
  chatIds: string
  interactiveEnabled: boolean
  richInteractionsEnabled: boolean
  parseMode: string
  hostLanIP: string
  defaultImageAccelerator: string
  enableUpdateCheck: boolean
  notifyOnUpdate: boolean
  updateCheckCron: string
  proxyType: string
  proxyHost: string
  proxyPort: string
  proxyUsername: string
  proxyPassword: string
  autoCleanImages: boolean
  cleanImagesCron: string
  autoUpdateContainers: boolean
  updateContainersCron: string
  autoBackupJson: boolean
  backupJsonCron: string
  autoBackupCompose: boolean
  backupComposeCron: string
  backupMaxFiles: string
  qqbotEnabled: boolean
  qqbotAppId: string
  qqbotAppSecret: string
  qqbotAllowedUserOpenids: string
  qqbotAllowedGroupOpenids: string
  qqbotRecentIdentities: QQBotIdentity[]
  qqbotMarkdownEnabled: boolean
  qqbotButtonsEnabled: boolean
}

export const initialConfigForm: ConfigFormState = {
  botToken: "",
  chatIds: "",
  interactiveEnabled: true,
  richInteractionsEnabled: false,
  parseMode: "HTML",
  hostLanIP: "",
  defaultImageAccelerator: "",
  enableUpdateCheck: false,
  notifyOnUpdate: true,
  updateCheckCron: "0 18 * * *",
  proxyType: "none",
  proxyHost: "",
  proxyPort: "",
  proxyUsername: "",
  proxyPassword: "",
  autoCleanImages: false,
  cleanImagesCron: "",
  autoUpdateContainers: false,
  updateContainersCron: "",
  autoBackupJson: false,
  backupJsonCron: "",
  autoBackupCompose: false,
  backupComposeCron: "",
  backupMaxFiles: "20",
  qqbotEnabled: false,
  qqbotAppId: "",
  qqbotAppSecret: "",
  qqbotAllowedUserOpenids: "",
  qqbotAllowedGroupOpenids: "",
  qqbotRecentIdentities: [],
  qqbotMarkdownEnabled: false,
  qqbotButtonsEnabled: false,
}

export const builtInImageAccelerators = ["docker.io", "docker.1ms.run", "docker.xuanyuan.me", "dockerproxy.com"]

export function normalizeAcceleratorValue(value: string) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "")
}

export function resolveAcceleratorLatencySource(value: string) {
  const normalized = normalizeAcceleratorValue(value)
  if (!normalized) return ""
  return normalized === "docker.io" ? "registry-1.docker.io" : normalized
}

export function buildAcceleratorLatencyMap(list: AcceleratorLatencyInfo[]) {
  return list.reduce<Record<string, AcceleratorLatencyInfo>>((acc, item) => {
    const key = resolveAcceleratorLatencySource(item.source)
    if (key) {
      acc[key] = item
    }
    return acc
  }, {})
}

export function parseVersionNumber(version: string) {
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

export function shouldUpdateVersion(currentVersion?: string, latestVersion?: string) {
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

export function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    return error.message || fallback
  }
  if (error instanceof Error) {
    return error.message
  }
  return fallback
}

export function useMobileDashboardData() {
  const [containers, setContainers] = useState<ContainerInfo[]>([])
  const [images, setImages] = useState<ImageInfo[]>([])
  const [operationLogs, setOperationLogs] = useState<OperationLog[]>([])
  const [config, setConfig] = useState<RuntimeConfig | null>(null)
  const [version, setVersion] = useState<VersionInfo | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [configForm, setConfigForm] = useState<ConfigFormState>(initialConfigForm)
  const [imageAccelerators, setImageAccelerators] = useState<string[]>([])
  const [newImageAccelerator, setNewImageAccelerator] = useState("")
  const [acceleratorLatencyMap, setAcceleratorLatencyMap] = useState<Record<string, AcceleratorLatencyInfo>>({})
  const [updateBlacklist, setUpdateBlacklist] = useState<string[]>([])
  const [icons, setIcons] = useState<Record<string, string>>({})

  const loadAcceleratorLatency = useCallback(async () => {
    try {
      const list = await mobileApi.getAcceleratorLatency()
      setAcceleratorLatencyMap(buildAcceleratorLatencyMap(Array.isArray(list) ? list : []))
    } catch {
      setAcceleratorLatencyMap({})
    }
  }, [])

  const refreshAll = useCallback(
    async (loadVersionStatus: () => Promise<unknown>, clearNotice?: () => void) => {
      clearNotice?.()
      setRefreshing(true)
      try {
        // 每个请求返回后立即写入状态，先到先渲染，容器列表不用等最慢的接口。
        await Promise.allSettled([
          mobileApi.getContainers().then(setContainers),
          mobileApi.getImages().then(setImages),
          mobileApi.getOperationLogs().then(setOperationLogs),
          mobileApi.getConfig().then((cfg) => {
            setConfig(cfg)
            const updateCheckCronRaw = String(cfg.telegram?.update_check_cron ?? "").trim()
            const updateCheckDisabled = ["off", "false", "0", "no"].includes(updateCheckCronRaw.toLowerCase())
            const accelerators = Array.from(
              new Set(
                [...builtInImageAccelerators, ...(cfg.telegram?.image_accelerators ?? [])]
                  .map(normalizeAcceleratorValue)
                  .filter(Boolean)
              )
            )

            setImageAccelerators(accelerators)
            setNewImageAccelerator("")
            setConfigForm({
              botToken: cfg.telegram?.bot_token ?? "",
              chatIds: (cfg.telegram?.chat_ids ?? []).join(", "),
              interactiveEnabled: cfg.telegram?.interactive_enabled ?? true,
              richInteractionsEnabled: cfg.telegram?.rich_interactions_enabled ?? false,
              parseMode: ["HTML", "MarkdownV2"].includes(cfg.telegram?.parse_mode ?? "") ? cfg.telegram?.parse_mode ?? "HTML" : "HTML",
              hostLanIP: cfg.dockercopilot?.host_lan_ip ?? "",
              defaultImageAccelerator: normalizeAcceleratorValue(cfg.telegram?.default_image_accelerator ?? "") || "docker.io",
              enableUpdateCheck: Boolean(updateCheckCronRaw) && !updateCheckDisabled,
              notifyOnUpdate: cfg.telegram?.notify_on_update ?? true,
              updateCheckCron: updateCheckDisabled ? "*/30 * * * *" : updateCheckCronRaw || "*/30 * * * *",
              proxyType: cfg.telegram?.proxy?.type ?? "none",
              proxyHost: cfg.telegram?.proxy?.host ?? "",
              proxyPort: cfg.telegram?.proxy?.port ? String(cfg.telegram.proxy.port) : "",
              proxyUsername: cfg.telegram?.proxy?.username ?? "",
              proxyPassword: cfg.telegram?.proxy?.password ?? "",
              autoCleanImages: cfg.telegram?.auto_clean_images ?? false,
              cleanImagesCron: cfg.telegram?.clean_images_cron ?? "3 2 * * *",
              autoUpdateContainers: cfg.telegram?.auto_update_containers ?? false,
              updateContainersCron: cfg.telegram?.update_containers_cron ?? "0 */6 * * *",
              autoBackupJson: cfg.telegram?.auto_backup_json ?? false,
              backupJsonCron: cfg.telegram?.backup_json_cron ?? "0 1 * * *",
              autoBackupCompose: cfg.telegram?.auto_backup_compose ?? false,
              backupComposeCron: cfg.telegram?.backup_compose_cron ?? "30 1 * * *",
              backupMaxFiles: cfg.telegram?.backup_max_files ? String(cfg.telegram.backup_max_files) : "20",
              qqbotEnabled: cfg.qqbot?.enabled ?? false,
              qqbotAppId: cfg.qqbot?.app_id ?? "",
              qqbotAppSecret: cfg.qqbot?.app_secret ?? "",
              qqbotAllowedUserOpenids: (cfg.qqbot?.allowed_user_openids ?? []).join("\n"),
              qqbotAllowedGroupOpenids: (cfg.qqbot?.allowed_group_openids ?? []).join("\n"),
              qqbotRecentIdentities: Array.isArray(cfg.qqbot?.recent_identities) ? cfg.qqbot.recent_identities : [],
              qqbotMarkdownEnabled: cfg.qqbot?.markdown_enabled ?? false,
              qqbotButtonsEnabled: cfg.qqbot?.buttons_enabled ?? false,
            })
          }),
          mobileApi.getUpdateBlacklist().then(setUpdateBlacklist),
          mobileApi.getIcons().then(setIcons),
        ])
      } finally {
        setRefreshing(false)
      }
      // 版本检查（GitHub）与加速器测速属于外部网络请求，可能耗时数秒，
      // 放到后台执行，不阻塞首屏数据展示。
      void loadVersionStatus().catch(() => {})
      void loadAcceleratorLatency()
    },
    [loadAcceleratorLatency]
  )

  const resetDashboardData = useCallback(() => {
    setContainers([])
    setImages([])
    setOperationLogs([])
    setConfig(null)
    setVersion(null)
  }, [])

  return {
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
    setIcons,
    refreshAll,
    resetDashboardData,
  }
}
