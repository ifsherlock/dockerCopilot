"use client"

import { Download, Github, LoaderCircle, RefreshCw } from "lucide-react"

import { cn } from "@/lib/utils"
import type { VersionInfo } from "@/lib/api"

export type UpdateViewProps = {
  version: VersionInfo | null
  backendVersion: string
  remoteVersion: string
  hasBackendUpdate: boolean
  isUpdatingProgram: boolean
  showForceUpdate: boolean
  updateMessage: string
  updateProgress: number
  updateTaskId: string
  isReconnectChecking: boolean
  postUpdateNeedsRefresh: boolean
  pendingProgramFile: File | null
  setPendingProgramFile: (file: File | null) => void
  handleCheckProgramUpdates: () => void
  handleRemoteProgramUpdate: (force?: boolean) => void
  handleUploadProgramUpdate: (file: File) => void
  handleRefreshAfterProgramUpdate: () => void
}

export function UpdateView(props: UpdateViewProps) {
  const {
    version,
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
    handleCheckProgramUpdates,
    handleRemoteProgramUpdate,
    handleUploadProgramUpdate,
    handleRefreshAfterProgramUpdate,
  } = props

  return (
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
  )
}
