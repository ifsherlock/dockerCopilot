import React, { useState } from 'react'
import { AlertCircle, Download, RefreshCw, X } from 'lucide-react'
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
  isUpdating = false
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
                onClick={onUpdateBackend}
                disabled={isUpdating}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-all",
                  isUpdating
                    ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-yellow-500 to-amber-500 text-white hover:shadow-lg active:scale-95'
                )}
              >
                {isUpdating ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    更新中...
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
        </div>
      </div>
    </>
  )
}
