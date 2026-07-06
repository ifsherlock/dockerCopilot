"use client"

import { Clock3, Copy, LoaderCircle, Tags, TerminalSquare } from "lucide-react"

import { cn } from "@/lib/utils"
import type { ContainerInfo } from "@/lib/api"
import { EmptyState, StatCard } from "../components/MobilePrimitives"
import { getContainerLogLevelMeta, type ContainerLogLevel } from "../mobileUtils"

type ContainerLogFilterKey = "all" | "info" | "warn" | "error"
type ParsedContainerLogLine = {
  raw: string
  timestamp: string
  containerPrefix: string
  level: ContainerLogLevel
  message: string
}

type LogsViewProps = {
  logStats: { total: number; info: number; warn: number; error: number }
  containerLogFilter: ContainerLogFilterKey
  setContainerLogFilter: (value: ContainerLogFilterKey) => void
  canFilterContainerLogs: boolean
  selectedLogContainerId: string
  setSelectedLogContainerId: (value: string) => void
  setContainerLogs: (value: string) => void
  setContainerLogsError: (value: string) => void
  containers: ContainerInfo[]
  handleFetchContainerLogs: () => void
  containerLogsLoading: boolean
  handleCopyLogs: () => void
  containerLogs: string
  showLogTimestamps: boolean
  setShowLogTimestamps: (value: boolean | ((prev: boolean) => boolean)) => void
  showLogContainerName: boolean
  setShowLogContainerName: (value: boolean | ((prev: boolean) => boolean)) => void
  containerLogsError: string
  parsedContainerLogs: ParsedContainerLogLine[]
  filteredContainerLogs: ParsedContainerLogLine[]
  selectedLogContainer: ContainerInfo | null
}

export function LogsView(props: LogsViewProps) {
  const {
    logStats,
    containerLogFilter,
    setContainerLogFilter,
    canFilterContainerLogs,
    selectedLogContainerId,
    setSelectedLogContainerId,
    setContainerLogs,
    setContainerLogsError,
    containers,
    handleFetchContainerLogs,
    containerLogsLoading,
    handleCopyLogs,
    containerLogs,
    showLogTimestamps,
    setShowLogTimestamps,
    showLogContainerName,
    setShowLogContainerName,
    containerLogsError,
    parsedContainerLogs,
    filteredContainerLogs,
    selectedLogContainer,
  } = props

  return (
    <div className="space-y-4">
            {/* 统计卡片：基于当前已读取的容器日志逐行解析 */}
            <div className="space-y-2">
              <div className="grid grid-cols-4 gap-3">
                <StatCard
                  label="总数"
                  value={logStats.total}
                  accent="bg-slate-400"
                  active={containerLogFilter === "all"}
                  onClick={canFilterContainerLogs ? () => setContainerLogFilter("all") : undefined}
                  disabled={!canFilterContainerLogs}
                />
                <StatCard
                  label="信息"
                  value={logStats.info}
                  accent="bg-blue-500"
                  active={containerLogFilter === "info"}
                  onClick={canFilterContainerLogs ? () => setContainerLogFilter("info") : undefined}
                  disabled={!canFilterContainerLogs}
                />
                <StatCard
                  label="警告"
                  value={logStats.warn}
                  accent="bg-amber-500"
                  active={containerLogFilter === "warn"}
                  onClick={canFilterContainerLogs ? () => setContainerLogFilter("warn") : undefined}
                  disabled={!canFilterContainerLogs}
                />
                <StatCard
                  label="错误"
                  value={logStats.error}
                  accent="bg-red-500"
                  active={containerLogFilter === "error"}
                  onClick={canFilterContainerLogs ? () => setContainerLogFilter("error") : undefined}
                  disabled={!canFilterContainerLogs}
                />
              </div>
              <p className="px-1 text-xs text-slate-500 dark:text-slate-400">点击统计卡可快速筛选当前容器日志；未选择容器时筛选不可用。</p>
            </div>

            {/* 容器选择 + 按钮（同一行） */}
            <div className="rounded-2xl bg-white dark:bg-slate-900 p-4 shadow-sm ring-1 ring-slate-100 dark:ring-slate-700">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={selectedLogContainerId}
                  onChange={(e) => {
                    const nextId = e.target.value
                    setSelectedLogContainerId(nextId)
                    if (!nextId) {
                      setContainerLogs("")
                      setContainerLogsError("")
                    }
                  }}
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900"
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
                  title="读取日志"
                  aria-label="读取日志"
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 transition-colors hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40 disabled:opacity-50"
                >
                  {containerLogsLoading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <TerminalSquare className="h-3.5 w-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={handleCopyLogs}
                  disabled={!containerLogs}
                  title="复制日志"
                  aria-label="复制日志"
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 disabled:opacity-50"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowLogTimestamps((prev) => !prev)}
                  title={showLogTimestamps ? "隐藏时间戳" : "显示时间戳"}
                  aria-label={showLogTimestamps ? "隐藏时间戳" : "显示时间戳"}
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-xl border transition-colors",
                    showLogTimestamps
                      ? "border-sky-200 bg-sky-50 text-sky-600 dark:border-sky-900/50 dark:bg-sky-900/20 dark:text-sky-400"
                      : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                  )}
                >
                  <Clock3 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowLogContainerName((prev) => !prev)}
                  title={showLogContainerName ? "隐藏容器名" : "显示容器名"}
                  aria-label={showLogContainerName ? "隐藏容器名" : "显示容器名"}
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-xl border transition-colors",
                    showLogContainerName
                      ? "border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-400"
                      : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                  )}
                >
                  <Tags className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* 日志内容 */}
            {containerLogsError && (
              <div className="rounded-xl bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                {containerLogsError}
              </div>
            )}
            {parsedContainerLogs.length > 0 ? (
              <div className="rounded-2xl bg-white dark:bg-slate-900 p-4 shadow-sm ring-1 ring-slate-100 dark:ring-slate-700">
                <div className="max-h-96 overflow-y-auto space-y-2">
                  {filteredContainerLogs.length > 0 ? (
                    filteredContainerLogs.map((line, idx) => {
                      const meta = getContainerLogLevelMeta(line.level)
                      const displayContainerName = line.containerPrefix || selectedLogContainer?.name || "--"
                      return (
                        <div key={idx} className={cn("rounded-xl border px-3 py-2", meta.wrapper)}>
                          <div className="flex items-start gap-2">
                            <span className={cn("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", meta.dot)} />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-medium">
                                <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-wide", meta.badge)}>{meta.label}</span>
                                {showLogTimestamps && line.timestamp ? (
                                  <span className="rounded-full bg-white/80 px-2 py-0.5 text-slate-500 dark:bg-slate-900/80 dark:text-slate-400">
                                    {line.timestamp}
                                  </span>
                                ) : null}
                                {showLogContainerName ? (
                                  <span className="rounded-full bg-white/80 px-2 py-0.5 text-emerald-600 dark:bg-slate-900/80 dark:text-emerald-400">
                                    {displayContainerName}
                                  </span>
                                ) : null}
                              </div>
                              <div className="mt-1.5 whitespace-pre-wrap break-all font-mono text-xs leading-5 text-slate-700 dark:text-slate-200">
                                {line.message || line.raw}
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
                      当前筛选条件下暂无日志
                    </div>
                  )}
                </div>
              </div>
            ) : !containerLogsLoading ? (
              <EmptyState title="选择容器查看日志" description="请在上方选择一个容器并点击读取" />
            ) : null}
          </div>
  )
}
