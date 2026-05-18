import React, { useEffect, useState } from 'react'
import { NotebookText, RefreshCw, AlertCircle, Terminal, Filter } from 'lucide-react'
import { imageAPI } from '../api/client.js'

const levelOptions = [
  { key: 'all', label: '全部' },
  { key: 'fatal', label: 'Fatal' },
  { key: 'error', label: 'Error' },
  { key: 'warn', label: 'Warn' },
  { key: 'info', label: 'Info' },
  { key: 'debug', label: 'Debug' },
]

const levelClass = (level) => {
  switch (level) {
    case 'fatal': return 'text-purple-300 bg-purple-500/15 border-purple-500/30'
    case 'error': return 'text-red-300 bg-red-500/15 border-red-500/30'
    case 'warn': return 'text-amber-300 bg-amber-500/15 border-amber-500/30'
    case 'debug': return 'text-sky-300 bg-sky-500/15 border-sky-500/30'
    default: return 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30'
  }
}

export function LogsPage() {
  const [logs, setLogs] = useState([])
  const [level, setLevel] = useState('all')
  const [tail, setTail] = useState(300)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loadLogs = async () => {
    try {
      setLoading(true)
      setError('')
      const res = await imageAPI.getDockerLogs({ level, tail })
      setLogs(Array.isArray(res.data?.data) ? res.data.data : [])
    } catch (e) {
      setError(e.response?.data?.msg || e.message || 'Docker 日志加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLogs()
  }, [level, tail])

  return (
    <div className="max-w-[1800px] mx-auto">
      <div className="px-2 sm:px-6 py-4 pt-4 sm:pt-4 space-y-6">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <NotebookText className="h-6 w-6 text-sky-500" />
              日志
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              查看 DockerCopilot 容器的 docker logs。镜像加速拉取日志仍在拉取卡片/弹窗中显示，二者分开。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm">
              <Filter className="h-4 w-4 text-gray-500" />
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className="bg-transparent text-gray-800 dark:text-gray-100 outline-none"
              >
                {levelOptions.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
              </select>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm">
              <span className="text-gray-500 dark:text-gray-400">尾部</span>
              <select
                value={tail}
                onChange={(e) => setTail(Number(e.target.value))}
                className="bg-transparent text-gray-800 dark:text-gray-100 outline-none"
              >
                {[100, 300, 500, 1000, 2000].map(n => <option key={n} value={n}>{n} 行</option>)}
              </select>
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
        </div>

        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900 rounded-2xl flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <span className="text-red-800 dark:text-red-200 text-sm flex-1">{error}</span>
          </div>
        )}

        <div className="card rounded-3xl overflow-hidden border border-gray-200 dark:border-gray-700">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-gray-800">
            <div className="flex items-center gap-2">
              <Terminal className="h-5 w-5 text-sky-500" />
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Docker Logs</h3>
              <span className="text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">dockercopilot 容器</span>
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400">当前显示 {logs.length} 条 · 等级 {levelOptions.find(item => item.key === level)?.label || level}</span>
          </div>
          <div className="h-[680px] overflow-auto bg-gray-950 text-gray-100 text-xs p-5 font-mono leading-6">
            {logs.length === 0 ? (
              <div className="text-gray-400">暂无 Docker 日志，或当前等级筛选没有匹配内容。</div>
            ) : logs.map((log, idx) => (
              <div key={`${log.time || idx}-${idx}`} className="flex gap-3 border-b border-white/5 py-1.5">
                <span className="w-[230px] shrink-0 text-gray-500">{log.time || '-'}</span>
                <span className={`w-16 shrink-0 text-center uppercase rounded border px-1 ${levelClass(log.level)}`}>{log.level || 'info'}</span>
                <span className="whitespace-pre-wrap break-words text-gray-100">{log.message || log.raw || ''}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
