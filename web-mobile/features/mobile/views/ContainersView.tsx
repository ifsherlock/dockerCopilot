"use client"

import { Eye, EyeOff, Globe, LoaderCircle, Play, RefreshCw, RotateCcw, Search, Server, Square, TerminalSquare } from "lucide-react"

import { cn } from "@/lib/utils"
import type { ContainerInfo, ContainerEndpointLink } from "@/lib/api"
import { EmptyState, StatCard } from "../components/MobilePrimitives"
import { formatContainerStatus } from "../mobileUtils"

type ContainerFilterKey = "all" | "running" | "updatable" | "paused"

type ContainersViewProps = {
  containerQuery: string
  setContainerQuery: (value: string) => void
  containerStats: { total: number; running: number; paused: number; updatable: number }
  containerFilter: ContainerFilterKey
  setContainerFilter: (value: ContainerFilterKey | ((prev: ContainerFilterKey) => ContainerFilterKey)) => void
  refreshing: boolean
  filteredContainers: ContainerInfo[]
  isUpdateIgnored: (container: ContainerInfo) => boolean
  blacklistPendingKey: string
  pendingAction: string
  getContainerEndpointLink: (container: ContainerInfo) => ContainerEndpointLink & {
    isRunning: boolean
    isHost: boolean
    chosenPort: string
  }
  getContainerIcon: (container: ContainerInfo) => string | null
  handleContainerAction: (id: string, action: "start" | "stop" | "restart") => void
  handleContainerUpdate: (container: ContainerInfo) => void
  handleToggleContainerIgnore: (container: ContainerInfo) => void
  handleOpenContainerLogs: (container: ContainerInfo) => void
}

export function ContainersView(props: ContainersViewProps) {
  const {
    containerQuery,
    setContainerQuery,
    containerStats,
    containerFilter,
    setContainerFilter,
    refreshing,
    filteredContainers,
    isUpdateIgnored,
    blacklistPendingKey,
    pendingAction,
    getContainerEndpointLink,
    getContainerIcon,
    handleContainerAction,
    handleContainerUpdate,
    handleToggleContainerIgnore,
    handleOpenContainerLogs,
  } = props

  return (
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
  )
}
