import type { AcceleratorLatencyInfo } from "@/lib/api"

export type ContainerLogLevel = "info" | "warn" | "error" | "debug" | "other"

export function normalizeIconSource(value: unknown): string | null {
  if (!value) return null
  if (typeof value === "string") {
    const normalized = value.trim()
    if (!normalized) return null
    if (/^(https?:)?\/\//i.test(normalized) || normalized.startsWith("data:") || normalized.startsWith("blob:") || normalized.startsWith("/")) {
      return normalized
    }
    return `/${normalized.replace(/^\.?\/?/, "")}`
  }
  if (typeof value === "object" && value && "src" in value && typeof (value as { src?: unknown }).src === "string") {
    return (value as { src: string }).src
  }
  return null
}

export function formatAcceleratorLatencyInfo(info?: AcceleratorLatencyInfo | null) {
  if (!info) return "未测速"
  if (info.status === "failed") return "失败"
  if (info.latency < 0) return "超时"
  return `${info.latency} ms`
}

export function getAcceleratorLatencyTone(info?: AcceleratorLatencyInfo | null) {
  if (!info) return "text-slate-500 dark:text-slate-400"
  if (info.status === "failed" || info.latency < 0) return "text-red-600 dark:text-red-400"
  if (info.latency <= 800) return "text-emerald-600 dark:text-emerald-400"
  if (info.latency <= 2000) return "text-amber-600 dark:text-amber-400"
  return "text-orange-600 dark:text-orange-400"
}

export function formatAcceleratorSourceLabel(source: string, info?: AcceleratorLatencyInfo | null) {
  const normalized = String(source || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "")

  return `${normalized || "docker.io"} · ${formatAcceleratorLatencyInfo(info)}`
}

export function normalizeContainerLogLevel(line: string): ContainerLogLevel {
  const normalized = String(line || "").trim().toUpperCase()
  if (!normalized || normalized === "（无日志）") return "other"
  if (/\[(ERROR|ERR|FATAL|PANIC)\]|\b(ERROR|ERR|FATAL|PANIC)\b/.test(normalized)) return "error"
  if (/\[(WARN|WARNING)\]|\b(WARN|WARNING)\b/.test(normalized)) return "warn"
  if (/\[(DEBUG|DBG)\]|\b(DEBUG|DBG)\b/.test(normalized)) return "debug"
  if (/\[(INFO|INF|NOTICE)\]|\b(INFO|INF|NOTICE)\b/.test(normalized)) return "info"
  return "other"
}

export function stripContainerLogLevelPrefix(value: string) {
  let text = String(value || "").trim()
  let prev = ""

  while (text && text !== prev) {
    prev = text
    text = text
      .replace(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?\s*/i, "")
      .replace(/^\[(ERROR|ERR|FATAL|PANIC|WARN|WARNING|DEBUG|DBG|INFO|INF|NOTICE)\]\s*/i, "")
      .replace(/^(ERROR|ERR|FATAL|PANIC|WARN|WARNING|DEBUG|DBG|INFO|INF|NOTICE)\s*[:|-]?\s*/i, "")
      .replace(/^(level\s*[=:]\s*)?(error|err|fatal|panic|warn|warning|debug|dbg|info|inf|notice)\s*[:=|-]?\s*/i, "")
      .replace(/^[|:-]+\s*/, "")
      .trim()
  }

  return text
}

export function parseContainerLogLine(line: string) {
  const raw = String(line || "").trim()
  const timestampMatch = raw.match(/^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?)/)
  const timestamp = timestampMatch?.[1] || ""
  let rest = timestamp ? raw.slice(timestamp.length).trim() : raw

  let containerPrefix = ""
  const prefixMatch = rest.match(/^([a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)?)\s*\|\s*(.+)$/)
  if (prefixMatch) {
    containerPrefix = prefixMatch[1]
    rest = prefixMatch[2]
  }

  const level = normalizeContainerLogLevel(rest || raw)
  const message = stripContainerLogLevelPrefix(rest || raw) || rest || raw
  return { raw, timestamp, containerPrefix, level, message }
}

export function getContainerLogLevelMeta(level: ContainerLogLevel) {
  switch (level) {
    case "error":
      return {
        badge: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
        dot: "bg-red-500",
        wrapper: "border-red-200 bg-red-50/80 dark:border-red-900/40 dark:bg-red-900/15",
        label: "ERROR",
      }
    case "warn":
      return {
        badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
        dot: "bg-amber-500",
        wrapper: "border-amber-200 bg-amber-50/80 dark:border-amber-900/40 dark:bg-amber-900/15",
        label: "WARN",
      }
    case "info":
      return {
        badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
        dot: "bg-blue-500",
        wrapper: "border-blue-200 bg-blue-50/80 dark:border-blue-900/40 dark:bg-blue-900/15",
        label: "INFO",
      }
    case "debug":
      return {
        badge: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
        dot: "bg-violet-500",
        wrapper: "border-violet-200 bg-violet-50/80 dark:border-violet-900/40 dark:bg-violet-900/15",
        label: "DEBUG",
      }
    default:
      return {
        badge: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
        dot: "bg-slate-400",
        wrapper: "border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-800/60",
        label: "LOG",
      }
  }
}

export function formatContainerStatus(status: string) {
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

export function parseImageRepoLink(imageName: string, tag: string): { dockerHub?: string; github?: string } {
  if (!imageName) return {}

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
