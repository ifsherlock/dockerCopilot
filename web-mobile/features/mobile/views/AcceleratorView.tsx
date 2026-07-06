"use client"

import { Download, LoaderCircle } from "lucide-react"

import { cn } from "@/lib/utils"
import type { AcceleratorLatencyInfo, OperationLog } from "@/lib/api"
import { formatAcceleratorLatencyInfo, getAcceleratorLatencyTone } from "../mobileUtils"

type PullImageSourceOption = {
  value: string
  label: string
  latencyInfo: AcceleratorLatencyInfo | null
}

type AcceleratorViewProps = {
  pullImageName: string
  setPullImageName: (value: string) => void
  pullImageDropdownOpen: boolean
  setPullImageDropdownOpen: (value: boolean) => void
  filteredPullSuggestions: string[]
  currentPullImageSource: string
  handleSelectImageAccelerator: (value: string) => void
  pullImageSourceOptions: PullImageSourceOption[]
  currentPullImageSourceInfo: AcceleratorLatencyInfo | null
  handlePullImage: () => void
  pendingAction: string
  operationLogs: OperationLog[]
  newImageAccelerator: string
  setNewImageAccelerator: (value: string) => void
  handleAddImageAccelerator: () => void
}

export function AcceleratorView(props: AcceleratorViewProps) {
  const {
    pullImageName,
    setPullImageName,
    pullImageDropdownOpen,
    setPullImageDropdownOpen,
    filteredPullSuggestions,
    currentPullImageSource,
    handleSelectImageAccelerator,
    pullImageSourceOptions,
    currentPullImageSourceInfo,
    handlePullImage,
    pendingAction,
    operationLogs,
    newImageAccelerator,
    setNewImageAccelerator,
    handleAddImageAccelerator,
  } = props

  return (
    <div className="space-y-4">
            {/* 镜像拉取表单 - ComboBox */}
            <div className="rounded-2xl bg-white dark:bg-slate-900 p-5 shadow-sm ring-1 ring-slate-100 dark:ring-slate-700">
              <h2 className="mb-4 text-base font-bold text-slate-900 dark:text-slate-100">加速拉取</h2>
              <div className="space-y-4">

                <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-800/40">
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">镜像名称</label>
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
                      placeholder="如 nginx:latest 或手动输入完整镜像名"
                      className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900"
                    />
                    {pullImageDropdownOpen && filteredPullSuggestions.length > 0 && (
                      <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                        {filteredPullSuggestions.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onMouseDown={() => {
                              setPullImageName(s)
                              setPullImageDropdownOpen(false)
                            }}
                            className="block w-full px-4 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">拉取源</label>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">选中任一源后会立即保存为默认拉取源</span>
                  </div>
                  <select
                    value={currentPullImageSource}
                    onChange={(e) => void handleSelectImageAccelerator(e.target.value)}
                    className="mt-1.5 block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900"
                  >
                    {pullImageSourceOptions.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>

                  <div className="mt-2 rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span>当前默认拉取源：</span>
                      <span className="font-semibold text-violet-600 dark:text-violet-400">{currentPullImageSource}</span>
                      <span className={cn("font-medium", getAcceleratorLatencyTone(currentPullImageSourceInfo))}>
                        {formatAcceleratorLatencyInfo(currentPullImageSourceInfo)}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handlePullImage}
                    disabled={pendingAction === "pull"}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-purple-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-purple-600 disabled:opacity-50"
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

            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-800/40">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">镜像加速源</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">添加自定义源后，可在上方拉取源下拉中直接选择并设为默认源。</p>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500 shadow-sm dark:bg-slate-900 dark:text-slate-300">
                  {pullImageSourceOptions.length} 个
                </span>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
                <input
                  type="text"
                  value={newImageAccelerator}
                  onChange={(e) => setNewImageAccelerator(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      void handleAddImageAccelerator()
                    }
                  }}
                  placeholder="新增自定义源，如 docker.1ms.run"
                  className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900"
                />
                <button
                  type="button"
                  onClick={() => void handleAddImageAccelerator()}
                  className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-100 dark:border-blue-900/50 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30"
                >
                  添加并设为可选
                </button>
              </div>
            </div>
          </div>
  )
}
