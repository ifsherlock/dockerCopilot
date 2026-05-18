import React, { useEffect, useState } from 'react'
import { NotebookText, RefreshCw, AlertCircle } from 'lucide-react'
import { imageAPI } from '../api/client.js'

export function LogsPage() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loadLogs = async () => {
    try {
      setLoading(true)
      setError('')
      const res = await imageAPI.getLogs()
      setLogs(Array.isArray(res.data?.data) ? res.data.data.slice().reverse() : [])
    } catch (e) {
      setError(e.response?.data?.msg || e.message || '日志加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLogs()
  }, [])

  return (
    <div className="max-w-[1800px] mx-auto">
      <div className="px-2 sm:px-6 py-4 pt-4 sm:pt-4 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <NotebookText className="h-6 w-6 text-sky-500" />
              日志
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mt-1">查看拉取、更新、重建等整体操作日志</p>
          </div>
          <button
            onClick={loadLogs}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 text-white hover:bg-primary-700 transition-colors disabled:opacity-50 text-sm font-medium"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            刷新日志
          </button>
        </div>

        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900 rounded-2xl flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <span className="text-red-800 dark:text-red-200 text-sm flex-1">{error}</span>
          </div>
        )}

        <div className="card rounded-3xl overflow-hidden border border-gray-200 dark:border-gray-700">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-white dark:bg-gray-800">
            <div className="flex items-center gap-2">
              <NotebookText className="h-5 w-5 text-sky-500" />
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">操作日志</h3>
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400">最近 {logs.length} 条</span>
          </div>
          <div className="h-[620px] overflow-auto bg-gray-950 text-green-300 text-xs p-5 font-mono whitespace-pre-wrap leading-6">
            {logs.length === 0
              ? '暂无日志。执行加速拉取、容器更新或后续重建操作后会显示在这里。'
              : logs.map((log, idx) => `[${log.time || '-'}] ${log.title || log.type || '日志'} ${log.message || ''}`).join('\n')}
          </div>
        </div>
      </div>
    </div>
  )
}
