import React, { useMemo, useState } from 'react'
import { AlertCircle, Download, ExternalLink, FolderUp, RefreshCw, Upload, X } from 'lucide-react'
import { cn } from '../utils/cn.js'

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

  const releaseLinks = useMemo(() => {
    const repoBase = 'https://github.com/ifsherlock/dockerCopilot/releases'
    return { latestUrl: `${repoBase}/latest` }
  }, [])

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
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />

      <div className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2">
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-slate-700">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300">
                <AlertCircle className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">程序更新</h2>
                <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">在线更新，或上传本机架构匹配的更新包。</p>
              </div>
            </div>
            <button onClick={onClose} className="rounded-lg p-1 text-gray-500 hover:bg-white/70 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-slate-800 dark:hover:text-gray-200">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="max-h-[70vh] space-y-4 overflow-y-auto px-4 py-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
                <div className="mb-1 text-xs text-gray-500 dark:text-gray-400">当前版本</div>
                <div className="text-base font-semibold text-gray-900 dark:text-white">{backendVersion || '--'}</div>
              </div>
              <div className={cn(
                'rounded-xl border p-3',
                hasBackendUpdate
                  ? 'border-yellow-200 bg-yellow-50 dark:border-yellow-700/50 dark:bg-yellow-900/20'
                  : 'border-emerald-200 bg-emerald-50 dark:border-emerald-700/50 dark:bg-emerald-900/20'
              )}>
                <div className="mb-1 text-xs text-gray-500 dark:text-gray-400">更新检测</div>
                <div className="text-base font-semibold">
                  {hasBackendUpdate ? (
                    <>
                      <span className="text-yellow-700 dark:text-yellow-400">发现新版本</span>
                      <span className="mx-1.5 text-gray-400">→</span>
                      <span className="text-green-600 dark:text-green-400">{remoteVersion || '--'}</span>
                    </>
                  ) : (
                    <span className="text-emerald-700 dark:text-emerald-400">已是最新版本</span>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <a
                href={releaseLinks.latestUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm transition-colors hover:bg-gray-100 dark:border-slate-700 dark:bg-slate-800/60 dark:hover:bg-slate-800"
              >
                <div className="inline-flex items-center gap-1.5 font-semibold text-blue-700 dark:text-blue-300">
                  <ExternalLink className="h-3.5 w-3.5" />
                  最新 Release
                </div>
                <div className="mt-1 break-all text-xs text-gray-500 dark:text-gray-400">{releaseLinks.latestUrl}</div>
              </a>

              <a
                href="https://github.com/ifsherlock/FnDepot"
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm transition-colors hover:bg-gray-100 dark:border-slate-700 dark:bg-slate-800/60 dark:hover:bg-slate-800"
              >
                <div className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-300">
                  <ExternalLink className="h-3.5 w-3.5" />
                  飞牛套件仓库
                </div>
                <div className="mt-1 break-all text-xs text-gray-500 dark:text-gray-400">https://github.com/ifsherlock/FnDepot</div>
              </a>
            </div>

            <div className={cn(
              'rounded-xl border p-3 text-sm leading-relaxed',
              hasBackendUpdate
                ? 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-700/50 dark:bg-blue-900/20 dark:text-blue-300'
                : 'border-gray-200 bg-gray-50 text-gray-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-gray-300'
            )}>
              {hasBackendUpdate
                ? '检测到可用更新。更新期间服务可能短暂重启。'
                : '当前检测结果为最新。需要离线覆盖时，可上传更新包。'}
            </div>

            {updateMessage && (
              <div className={cn(
                'rounded-xl border p-3 text-sm font-medium',
                postUpdateNeedsRefresh
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700/60 dark:bg-emerald-900/20 dark:text-emerald-300'
                  : 'border-gray-200 bg-gray-50 text-gray-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-gray-200'
              )}>
                {postUpdateNeedsRefresh ? '更新已完成，请刷新页面。' : updateMessage}
              </div>
            )}

            <label
              className={cn(
                'block cursor-pointer rounded-2xl border border-dashed p-4 transition-all',
                isUpdating && 'cursor-not-allowed opacity-70',
                isDragging
                  ? 'border-indigo-500 bg-indigo-100/80 dark:bg-indigo-900/25'
                  : 'border-indigo-300 bg-indigo-50/70 hover:bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-900/10 dark:hover:bg-indigo-900/20'
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
                handlePickedFile(e.dataTransfer?.files?.[0])
              }}
            >
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
              <div className="flex items-start gap-3 text-sm text-indigo-800 dark:text-indigo-200">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/80 text-indigo-600 shadow-sm dark:bg-slate-950/50 dark:text-indigo-300">
                  <Upload className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold">上传更新包</div>
                  <div className="mt-1 text-xs text-indigo-700/80 dark:text-indigo-300/80">拖拽文件到这里，或点击选择文件。</div>
                  <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-white/70 px-2.5 py-1 text-xs text-indigo-700 dark:bg-slate-950/40 dark:text-indigo-300">
                    <FolderUp className="h-3.5 w-3.5" />
                    支持 Linux 二进制、tar.gz、tgz、gz
                  </div>
                  <div className="mt-2 text-xs text-indigo-700/70 dark:text-indigo-300/70">请上传与当前机器架构匹配的文件。</div>
                </div>
              </div>
            </label>

            {pendingFile && !isUpdating && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800 dark:border-indigo-700/60 dark:bg-indigo-900/20 dark:text-indigo-200">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="font-medium">已选择更新文件</div>
                    <div className="mt-1 break-all text-xs opacity-80">{pendingFile.name}</div>
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
                <div className="mb-1.5 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span>{isReconnectChecking ? '服务恢复检测中' : '更新进度'}</span>
                  <span>{Math.max(0, Math.min(100, Number(updateProgress) || 0))}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-slate-700">
                  <div
                    className="h-full bg-primary-500 transition-all duration-500"
                    style={{ width: `${Math.max(0, Math.min(100, Number(updateProgress) || 0))}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3 border-t border-gray-200 bg-gray-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/50">
            <button
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600"
            >
              稍后
            </button>

            {hasBackendUpdate && (
              <button
                onClick={postUpdateNeedsRefresh ? onRefreshNow : onUpdateBackend}
                disabled={isUpdating}
                className={cn(
                  'flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 font-medium transition-all',
                  isUpdating
                    ? 'cursor-not-allowed bg-gray-300 text-gray-500 dark:bg-gray-600 dark:text-gray-400'
                    : postUpdateNeedsRefresh
                      ? 'bg-primary-600 text-white hover:bg-primary-700'
                      : 'bg-amber-500 text-white hover:bg-amber-600'
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
            <div className="-mt-1 px-4 pb-4">
              <button
                onClick={onForceUpdateBackend}
                disabled={isUpdating}
                className={cn(
                  'flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2 font-medium transition-all',
                  isUpdating
                    ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-500'
                    : 'border-amber-300 bg-white text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:bg-slate-900 dark:text-amber-300 dark:hover:bg-amber-900/20'
                )}
              >
                <RefreshCw className={cn('h-4 w-4', isUpdating && 'animate-spin')} />
                强制覆盖更新
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
