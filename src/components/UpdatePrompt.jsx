import React, { useState } from 'react'
import { AlertCircle, Download, RefreshCw, Upload, X } from 'lucide-react'
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
  if (!isVisible) return null

  return (
    <>
      {/* 半透明背景 */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* 弹窗 */}
      <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md mx-4">
        <div className="bg-white dark:bg-slate-900 rounded-lg shadow-2xl border border-gray-200 dark:border-slate-700 overflow-hidden">
          {/* 顶部 - 关闭按钮 */}
          <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border-b border-gray-200 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                有新版本可用
              </h2>
            </div>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* 内容 */}
          <div className="px-6 py-4">
            {/* 版本信息 */}
            <div className="space-y-3 mb-4">
              {hasBackendUpdate && (
                <div className="flex items-center justify-between p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-700/50">
                  <span className="text-sm text-gray-600 dark:text-gray-400">后端版本</span>
                  <span className="text-sm font-semibold">
                    <span className="text-yellow-700 dark:text-yellow-400">{backendVersion}</span>
                    <span className="text-gray-400 mx-1">→</span>
                    <span className="text-green-600 dark:text-green-400">{remoteVersion}</span>
                  </span>
                </div>
              )}
            </div>

            {/* 提示文本 */}
            <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700/50">
              <p className="text-sm text-blue-800 dark:text-blue-300">
                {hasBackendUpdate
                  ? '检测到后端有新版本可用。建议您立即更新以获得最新功能和安全补丁。'
                  : '您正在使用最新版本，感谢您的支持！'}
              </p>
            </div>

            {updateMessage && (
              <div className="mb-4 p-3 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/60 text-sm text-gray-700 dark:text-gray-200">
                {updateMessage}
              </div>
            )}

            <div className="mb-4 p-3 rounded-lg border border-dashed border-indigo-300 dark:border-indigo-700 bg-indigo-50/70 dark:bg-indigo-900/10">
              <div className="flex items-start gap-2 text-sm text-indigo-800 dark:text-indigo-200 mb-3">
                <Upload className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium">手动上传二进制/更新包</div>
                  <div className="text-xs mt-1 text-indigo-700/80 dark:text-indigo-300/80">请上传当前机器架构匹配的 Linux dockerCopilot 二进制或 tar.gz，例如 amd64/x86_64 与 arm64 不可混用；后端会再次校验架构。</div>
                </div>
              </div>
              <label className={cn(
                "inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-all",
                isUpdating
                  ? 'bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-slate-700 cursor-not-allowed'
                  : 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 cursor-pointer'
              )}>
                <Upload className="h-4 w-4" />
                选择文件并更新
                <input
                  type="file"
                  className="hidden"
                  disabled={isUpdating}
                  accept=".gz,.tgz,.tar.gz,application/gzip,application/x-gzip,application/octet-stream"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (file && onUploadProgram) onUploadProgram(file)
                  }}
                />
              </label>
            </div>

            {isUpdating && (
              <div className="mb-4">
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

          {/* 底部 - 操作按钮 */}
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
                    刷新状态
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
