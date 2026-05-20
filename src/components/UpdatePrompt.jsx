import React, { useState } from 'react'
import { AlertCircle, Download, RefreshCw, Upload, X, FolderUp } from 'lucide-react'
import { cn } from '../utils/cn.js'

/**
 * 版本更新提示组件
 * 显示有新版本可用时的提示弹窗
 */
export function UpdatePrompt({
  isVisible,
  onClose,
  backendVersion,
  remoteVersion,
  hasBackendUpdate,
  onUpdateBackend,
  onForceUpdateBackend,
  showForceUpdate = false,
  isUpdating = false,
  updateMessage = '',
  updateProgress = 0,
  isReconnectChecking = false,
  postUpdateNeedsRefresh = false,
  onRefreshNow,
  onUploadProgram
}) {
  const [isDragging, setIsDragging] = useState(false)
  const [pendingFile, setPendingFile] = useState(null)
  if (!isVisible) return null

  const handlePickedFile = (file) => {
    if (file) setPendingFile(file)
  }

  const confirmUpload = () => {
    if (pendingFile && onUploadProgram) onUploadProgram(pendingFile)
    setPendingFile(null)
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-2xl mx-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-800/20 border-b border-gray-200 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  程序更新与安装包管理
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  查看最新版本、执行在线更新，或手动上传匹配架构的程序包。
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="px-6 py-5 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-4 bg-gray-50 dark:bg-slate-800/60 rounded-xl border border-gray-200 dark:border-slate-700">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">当前版本</div>
                <div className="text-base font-semibold text-gray-900 dark:text-white">{backendVersion || '--'}</div>
              </div>
              <div className={cn(
                "p-4 rounded-xl border",
                hasBackendUpdate
                  ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-700/50'
                  : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-700/50'
              )}>
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">更新检测</div>
                <div className="text-base font-semibold">
                  {hasBackendUpdate ? (
                    <>
                      <span className="text-yellow-700 dark:text-yellow-400">发现新版本</span>
                      <span className="text-gray-400 mx-1.5">→</span>
                      <span className="text-green-600 dark:text-green-400">{remoteVersion || '--'}</span>
                    </>
                  ) : (
                    <span className="text-emerald-700 dark:text-emerald-400">当前已是最新版本</span>
                  )}
                </div>
              </div>
            </div>

            <div className={cn(
              "p-4 rounded-xl border text-sm leading-relaxed",
              hasBackendUpdate
                ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700/50 text-blue-800 dark:text-blue-300'
                : 'bg-gray-50 dark:bg-slate-800/60 border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-300'
            )}>
              {hasBackendUpdate
                ? '检测到程序有可用更新。你可以直接在线更新，也可以手动上传已下载好的二进制或更新包。更新过程中服务可能短暂重启，请尽量在了解当前运行状态后操作。'
                : '当前程序版本与远端检测结果一致。如果你需要重装同版本、离线覆盖，或者验证指定构建产物，也可以使用下方的手动上传更新功能。'}
            </div>

            {updateMessage && (
              <div className={cn("p-3 rounded-xl border text-sm font-medium", postUpdateNeedsRefresh ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700/60 dark:bg-emerald-900/20 dark:text-emerald-300' : 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/60 text-gray-700 dark:text-gray-200')}>
{postUpdateNeedsRefresh ? '更新已完成，请刷新页面！' : updateMessage}
              </div>
            )}

            <div
              className={cn(
                "rounded-2xl border border-dashed p-4 sm:p-5 transition-all",
                isDragging
                  ? 'border-indigo-500 bg-indigo-100/80 dark:bg-indigo-900/25'
                  : 'border-indigo-300 dark:border-indigo-700 bg-indigo-50/70 dark:bg-indigo-900/10'
              )}
              onDragOver={(e) => {
                e.preventDefault()
                if (!isUpdating) setIsDragging(true)
              }}
              onDragLeave={(e) => {
                e.preventDefault()
                setIsDragging(false)
              }}
              onDrop={(e) => {
                e.preventDefault()
                setIsDragging(false)
                if (isUpdating) return
                const file = e.dataTransfer?.files?.[0]
                handlePickedFile(file)
              }}
            >
              <div className="flex items-start gap-3 text-sm text-indigo-800 dark:text-indigo-200 mb-4">
                <Upload className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <div className="font-semibold">手动上传二进制 / 更新包</div>
                  <div className="text-xs mt-1 text-indigo-700/80 dark:text-indigo-300/80">请上传与当前机器架构匹配的 Linux dockerCopilot 二进制或 tar.gz 更新包，例如 amd64 / x86_64 与 arm64 / aarch64 不可混用；后端会再次校验架构。</div>
                </div>
              </div>

              <div className="mb-4 rounded-xl border border-dashed border-indigo-300/80 dark:border-indigo-700/80 bg-white/60 dark:bg-slate-900/30 px-4 py-5 text-center text-sm text-indigo-700 dark:text-indigo-300">
                <FolderUp className="mx-auto mb-2 h-5 w-5" />
                <div className="font-medium">可直接把文件拖到这里上传</div>
                <div className="mt-1 text-xs opacity-80">支持 dockerCopilot Linux 二进制、tar.gz、tgz</div>
              </div>

              <div className="flex flex-wrap gap-3">
                <label className={cn(
                  "inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-all",
                  isUpdating
                    ? 'bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-slate-700 cursor-not-allowed'
                    : 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700 cursor-pointer'
                )}>
                  <FolderUp className="h-4 w-4" />
                  选择文件上传
                  <input
                    type="file"
                    className="hidden"
                    disabled={isUpdating}
                    accept=".gz,.tgz,.tar.gz,application/gzip,application/x-gzip,application/octet-stream"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      e.target.value = ''
                      handlePickedFile(file)
                    }}
                  />
                </label>
              </div>
            </div>

            {pendingFile && !isUpdating && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800 dark:border-indigo-700/60 dark:bg-indigo-900/20 dark:text-indigo-200">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-medium">已选择更新文件</div>
                    <div className="mt-1 text-xs opacity-80 break-all">{pendingFile.name}</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPendingFile(null)}
                      className="inline-flex items-center justify-center rounded-lg border border-indigo-300 bg-white px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50 dark:border-indigo-700 dark:bg-slate-900 dark:text-indigo-300 dark:hover:bg-indigo-900/20"
                    >
                      取消
                    </button>
                    <button
                      onClick={confirmUpload}
                      className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                    >
                      确认更新
                    </button>
                  </div>
                </div>
              </div>
            )}

            {isUpdating && (
              <div>
                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1.5">
                  <span>{isReconnectChecking ? '服务恢复检测中' : '更新进度'}</span>
                  <span>{Math.max(0, Math.min(100, Number(updateProgress) || 0))}%</span>
                </div>
                <div className="h-2 rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 transition-all duration-500"
                    style={{ width: `${Math.max(0, Math.min(100, Number(updateProgress) || 0))}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="px-6 py-4 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-200 dark:border-slate-700 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors font-medium"
            >
              稍后
            </button>

            {hasBackendUpdate && (
              <button
                onClick={postUpdateNeedsRefresh ? onRefreshNow : onUpdateBackend}
                disabled={isUpdating}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-all",
                  isUpdating
                    ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                    : postUpdateNeedsRefresh
                      ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white hover:shadow-lg active:scale-95'
                      : 'bg-gradient-to-r from-yellow-500 to-amber-500 text-white hover:shadow-lg active:scale-95'
                )}
              >
                {isUpdating ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    更新中...
                  </>
                ) : postUpdateNeedsRefresh ? (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    刷新页面
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    立即更新
                  </>
                )}
              </button>
            )}
          </div>

          {showForceUpdate && (
            <div className="px-6 pb-5 -mt-1">
              <button
                onClick={onForceUpdateBackend}
                disabled={isUpdating}
                className={cn(
                  "w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium border transition-all",
                  isUpdating
                    ? 'bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-slate-700 cursor-not-allowed'
                    : 'bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                )}
              >
                <RefreshCw className={cn('h-4 w-4', isUpdating && 'animate-spin')} />
                强制覆盖更新（重下同版本）
              </button>
            </div>
          )}

        </div>
      </div>
    </>
  )
}
