import React, { useEffect, useState } from 'react'
import { progressAPI, systemLogAPI } from '../../api/client.js'
import { plainControlClass, PlainLogViewer, useSharedLogTheme } from './logViewer.jsx'

function formatTaskProgressLog(data, fallbackTaskID) {
  const lines = Array.isArray(data.logs) ? data.logs : []
  return [
    `任务：${data.taskID || fallbackTaskID}`,
    `名称：${data.name || '-'}`,
    `状态：${data.message || '-'} (${data.percentage || 0}%)`,
    `完成：${data.isDone ? '是' : '否'}`,
    `更新时间：${data.updatedAt || '-'}`,
    '',
    ...lines,
  ].join('\n')
}

export function ServiceLogsPanel() {
  const { darkTheme, toggleLogTheme } = useSharedLogTheme()
  const [logs, setLogs] = useState('')
  const [tail, setTail] = useState(300)
  const [query, setQuery] = useState('')
  const [level, setLevel] = useState('all')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const load = async () => {
    try {
      setLoading(true)
      const res = await systemLogAPI.getLogs({ kind: 'service', tail, query, level })
      if (res.data?.code !== 200) throw new Error(res.data?.msg || '读取服务日志失败')
      setLogs(res.data?.data?.logs || '')
      setMessage('')
    } catch (error) {
      setMessage(error.response?.data?.msg || error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    const onGlobalRefresh = () => load()
    window.addEventListener('docker-copilot-global-refresh', onGlobalRefresh)
    return () => window.removeEventListener('docker-copilot-global-refresh', onGlobalRefresh)
  }, [tail, query, level])

  const controls = ({ darkTheme }) => (
    <>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && load()}
        placeholder="搜索日志"
        className={plainControlClass(darkTheme, 'w-40')}
      />
      <select
        value={level}
        onChange={(e) => setLevel(e.target.value)}
        className={plainControlClass(darkTheme)}
      >
        <option value="all">全部级别</option>
        <option value="error">Error</option>
        <option value="warn">Warn</option>
        <option value="info">Info</option>
        <option value="debug">Debug</option>
      </select>
      <input
        value={tail}
        onChange={(e) => setTail(e.target.value.replace(/\D+/g, '') || '300')}
        className={plainControlClass(darkTheme, 'w-24')}
        title="读取尾部行数"
      />
    </>
  )

  return <PlainLogViewer title="服务日志" logs={logs} loading={loading} message={message} controls={controls} darkTheme={darkTheme} onToggleTheme={toggleLogTheme} />
}

export function OperationLogsPanel() {
  const { darkTheme, toggleLogTheme } = useSharedLogTheme()
  const [logs, setLogs] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const load = async () => {
    try {
      setLoading(true)
      const res = await systemLogAPI.getLogs({ kind: 'operation' })
      if (res.data?.code !== 200) throw new Error(res.data?.msg || '读取操作日志失败')
      const rows = Array.isArray(res.data?.data) ? res.data.data : []
      setLogs(rows.map(item => `[${item.time || ''}] ${item.type || '-'} ${item.title || ''} ${item.message || ''}`.trim()).join('\n'))
      setMessage('')
    } catch (error) {
      setMessage(error.response?.data?.msg || error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    const onGlobalRefresh = () => load()
    window.addEventListener('docker-copilot-global-refresh', onGlobalRefresh)
    return () => window.removeEventListener('docker-copilot-global-refresh', onGlobalRefresh)
  }, [])

  return <PlainLogViewer title="操作日志" logs={logs} loading={loading} message={message} darkTheme={darkTheme} onToggleTheme={toggleLogTheme} />
}

export function TaskLogsPanel() {
  const { darkTheme, toggleLogTheme } = useSharedLogTheme()
  const [taskID, setTaskID] = useState('')
  const [tasks, setTasks] = useState([])
  const [logs, setLogs] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const loadTasks = async () => {
    try {
      const res = await systemLogAPI.getLogs({ kind: 'task', tail: 50 })
      if (res.data?.code !== 200) throw new Error(res.data?.msg || '读取任务列表失败')
      setTasks(Array.isArray(res.data?.data) ? res.data.data : [])
    } catch (error) {
      setMessage(error.response?.data?.msg || error.message)
    }
  }

  const load = async () => {
    if (!taskID.trim()) {
      setMessage('请输入任务 ID')
      return
    }
    try {
      setLoading(true)
      const res = await progressAPI.getProgress(taskID.trim())
      if (res.data?.code !== 200) throw new Error(res.data?.msg || '读取任务日志失败')
      const data = res.data?.data || {}
      setLogs(formatTaskProgressLog(data, taskID))
      setMessage('')
      loadTasks()
    } catch (error) {
      setMessage(error.response?.data?.msg || error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadTasks() }, [])

  useEffect(() => {
    const onGlobalRefresh = () => {
      loadTasks()
      if (taskID.trim()) load()
    }
    window.addEventListener('docker-copilot-global-refresh', onGlobalRefresh)
    return () => window.removeEventListener('docker-copilot-global-refresh', onGlobalRefresh)
  }, [taskID])

  const openTask = async (id) => {
    setTaskID(id)
    try {
      setLoading(true)
      const res = await progressAPI.getProgress(id)
      if (res.data?.code !== 200) throw new Error(res.data?.msg || '读取任务日志失败')
      const data = res.data?.data || {}
      setLogs(formatTaskProgressLog(data, id))
      setMessage('')
    } catch (error) {
      setMessage(error.response?.data?.msg || error.message)
    } finally {
      setLoading(false)
    }
  }

  const controls = ({ darkTheme }) => (
    <>
      <input
        value={taskID}
        onChange={(e) => setTaskID(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && load()}
        placeholder="任务 ID"
        className={plainControlClass(darkTheme, 'w-72 max-w-[70vw]')}
      />
    </>
  )

  return (
    <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      <div className={`flex h-[72vh] flex-col overflow-hidden rounded-2xl border p-4 shadow-sm xl:h-[78vh] ${darkTheme ? 'border-slate-800 bg-[#0b0f14] text-slate-100' : 'border-slate-200 bg-white text-slate-900'}`}>
        <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
          <div>
            <h3 className={`font-semibold ${darkTheme ? 'text-slate-100' : 'text-slate-900'}`}>近期任务</h3>
          </div>
        </div>
        <div className="dc-scrollbar-soft min-h-0 flex-1 space-y-2 overflow-auto">
          {tasks.map(task => (
            <button
              key={task.taskID}
              onClick={() => openTask(task.taskID)}
              className={`w-full rounded-xl border p-3 text-left transition ${darkTheme ? 'border-slate-800 bg-[#10161d] hover:border-slate-700 hover:bg-slate-900' : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`truncate text-sm font-medium ${darkTheme ? 'text-slate-100' : 'text-slate-900'}`}>{task.name || task.taskID}</span>
                <span className={task.isDone ? 'rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-700 dark:bg-sky-950/40 dark:text-sky-300'}>
                  {task.isDone ? '完成' : `${task.percentage || 0}%`}
                </span>
              </div>
              <div className={`mt-1 truncate text-xs ${darkTheme ? 'text-slate-400' : 'text-slate-500'}`}>{task.message || '-'}</div>
              <div className={`mt-1 truncate font-mono text-[11px] ${darkTheme ? 'text-slate-400' : 'text-slate-500'}`}>{task.taskID}</div>
              {(task.updatedAt || task.createdAt) && (
                <div className={`mt-1 truncate text-[11px] ${darkTheme ? 'text-slate-400' : 'text-slate-500'}`}>更新时间：{task.updatedAt || task.createdAt}</div>
              )}
            </button>
          ))}
          {tasks.length === 0 && <div className={`rounded-xl border border-dashed p-4 text-center text-sm ${darkTheme ? 'border-slate-700 text-slate-400' : 'border-slate-300 text-slate-500'}`}>暂无任务记录</div>}
        </div>
      </div>
      <PlainLogViewer title="任务日志" logs={logs} loading={loading} message={message} controls={controls} darkTheme={darkTheme} onToggleTheme={toggleLogTheme} />
    </div>
  )
}
