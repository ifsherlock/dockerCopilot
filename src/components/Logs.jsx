import React, { useEffect, useMemo, useRef, useState } from 'react'
import { containerAPI } from '../api/client.js'
import { Search, RefreshCw, Copy, Download, FileText, WrapText, ArrowDownToLine, Filter, Eraser, ChevronUp, ChevronDown, Type, TerminalSquare, Activity, CircleDot } from 'lucide-react'

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function LogsPage() {
  const [containers, setContainers] = useState([])
  const [loadingContainers, setLoadingContainers] = useState(true)
  const [selectedId, setSelectedId] = useState('')
  const [logs, setLogs] = useState('')
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [tail, setTail] = useState(300)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [autoScroll, setAutoScroll] = useState(true)
  const [wordWrap, setWordWrap] = useState(true)
  const [fontSize, setFontSize] = useState(12)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterMode, setFilterMode] = useState(false)
  const [message, setMessage] = useState('')
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0)
  const logRef = useRef(null)
  const searchInputRef = useRef(null)

  const loadContainers = async () => {
    try {
      setLoadingContainers(true)
      const res = await containerAPI.getContainers()
      const list = res.data?.data || []
      setContainers(list)
      if (!selectedId && list.length > 0) {
        setSelectedId(list[0].id)
      }
    } catch (error) {
      setMessage(`读取容器列表失败：${error.response?.data?.msg || error.message}`)
    } finally {
      setLoadingContainers(false)
    }
  }

  const loadLogs = async (containerId = selectedId, currentTail = tail) => {
    if (!containerId) return
    try {
      setLoadingLogs(true)
      const res = await containerAPI.getContainerLogs(containerId, currentTail)
      const nextLogs = res.data?.data?.logs || ''
      setLogs(nextLogs)
      setMessage('')
      if (autoScroll) {
        requestAnimationFrame(() => {
          if (logRef.current) {
            logRef.current.scrollTop = logRef.current.scrollHeight
          }
        })
      }
    } catch (error) {
      setMessage(`读取容器日志失败：${error.response?.data?.msg || error.message}`)
    } finally {
      setLoadingLogs(false)
    }
  }

  useEffect(() => {
    loadContainers()
  }, [])

  useEffect(() => {
    if (selectedId) loadLogs(selectedId, tail)
  }, [selectedId, tail])

  useEffect(() => {
    if (!autoRefresh || !selectedId) return
    const timer = setInterval(() => loadLogs(selectedId, tail), 3000)
    return () => clearInterval(timer)
  }, [autoRefresh, selectedId, tail])

  const filteredContainers = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    if (!q) return containers
    return containers.filter(item =>
      [item.name, item.usingImage, item.createImage, item.state, item.status]
        .some(v => String(v || '').toLowerCase().includes(q))
    )
  }, [containers, keyword])

  const selectedContainer = containers.find(item => item.id === selectedId)

  const copyLogs = async () => {
    try {
      await navigator.clipboard.writeText(logs || '')
      setMessage('日志已复制到剪贴板')
    } catch (error) {
      setMessage(`复制失败：${error.message}`)
    }
  }

  const downloadLogs = () => {
    const blob = new Blob([logs || ''], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${selectedContainer?.name || 'container'}-logs.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const processedLines = useMemo(() => {
    const raw = String(logs || '')
    const query = searchQuery.trim()
    let lines = raw.split('\n')
    if (filterMode && query) {
      const re = new RegExp(escapeRegExp(query), 'i')
      lines = lines.filter(line => re.test(line))
    }
    return lines
  }, [logs, searchQuery, filterMode])

  const matchCount = useMemo(() => {
    const query = searchQuery.trim()
    if (!query) return 0
    const re = new RegExp(escapeRegExp(query), 'gi')
    return processedLines.reduce((count, line) => count + ((line.match(re) || []).length), 0)
  }, [processedLines, searchQuery])

  useEffect(() => {
    setCurrentMatchIndex(matchCount > 0 ? 1 : 0)
  }, [searchQuery, filterMode, selectedId, matchCount])

  useEffect(() => {
    if (!searchQuery.trim() || !matchCount) return
    requestAnimationFrame(() => {
      const root = logRef.current
      if (!root) return
      root.querySelectorAll('.dc-log-match-current').forEach(el => el.classList.remove('dc-log-match-current'))
      const matches = root.querySelectorAll('.dc-log-match')
      if (!matches.length) return
      const idx = Math.max(0, Math.min(matches.length - 1, currentMatchIndex - 1))
      const current = matches[idx]
      if (current) {
        current.classList.add('dc-log-match-current')
        current.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
    })
  }, [currentMatchIndex, searchQuery, processedLines, matchCount])

  const jumpMatch = (direction) => {
    if (!matchCount) return
    setCurrentMatchIndex(prev => {
      if (!prev) return 1
      if (direction === 'next') return prev >= matchCount ? 1 : prev + 1
      return prev <= 1 ? matchCount : prev - 1
    })
  }

  const renderHighlightedLine = (line, lineIndex) => {
    const query = searchQuery.trim()
    if (!query) return <React.Fragment key={lineIndex}>{line || ' '}</React.Fragment>
    const re = new RegExp(`(${escapeRegExp(query)})`, 'gi')
    const parts = String(line).split(re)
    return (
      <React.Fragment key={lineIndex}>
        {parts.map((part, idx) => {
          const isMatch = part && part.toLowerCase() === query.toLowerCase()
          return isMatch
            ? <mark key={idx} className="dc-log-match rounded bg-amber-300/30 px-0.5 text-amber-100">{part}</mark>
            : <React.Fragment key={idx}>{part || ''}</React.Fragment>
        })}
      </React.Fragment>
    )
  }

  const clearView = () => {
    setLogs('')
    setMessage('当前视图已清空，不影响容器真实日志')
  }

  const toolBtn = (active, color = 'sky') => {
    const activeMap = {
      sky: 'border-sky-500/40 bg-sky-500/12 text-sky-300 shadow-[0_0_0_1px_rgba(56,189,248,0.15)]',
      amber: 'border-amber-500/40 bg-amber-500/12 text-amber-300 shadow-[0_0_0_1px_rgba(251,191,36,0.15)]',
      emerald: 'border-emerald-500/40 bg-emerald-500/12 text-emerald-300 shadow-[0_0_0_1px_rgba(16,185,129,0.15)]'
    }
    return `inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 transition-colors ${active ? activeMap[color] : 'border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800'}`
  }

  const lineCount = processedLines.length

  return (
    <div className="space-y-4">
      <style>{`
        .dc-log-match-current { background: rgba(251, 191, 36, 0.45) !important; color: #fff7d6 !important; box-shadow: 0 0 0 1px rgba(251, 191, 36, 0.45); }
        .dc-log-grid { background-image: linear-gradient(to bottom, rgba(255,255,255,0.02) 1px, transparent 1px); background-size: 100% 24px; }
      `}</style>
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">容器日志</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">继续按 Dockhand 靠拢：更明显的工具状态、命中跳转、控制台式头部信息。</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={loadContainers} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700">
              <RefreshCw className="h-4 w-4" /> 刷新容器
            </button>
            <button onClick={() => loadLogs()} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700">
              <FileText className="h-4 w-4" /> 刷新日志
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索容器名 / 镜像 / 状态"
              className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-10 pr-3 text-sm outline-none ring-0 focus:border-blue-500 dark:border-gray-600 dark:bg-gray-900"
            />
          </div>
          <div className="mb-3 flex items-center justify-between gap-3 text-sm">
            <label className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
              Tail
              <input type="number" min="50" max="5000" value={tail} onChange={(e) => setTail(Number(e.target.value) || 300)} className="w-24 rounded-lg border border-gray-200 bg-white px-2 py-1 dark:border-gray-600 dark:bg-gray-900" />
            </label>
            <label className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
              <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} /> 自动刷新
            </label>
          </div>
          <div className="max-h-[70vh] space-y-2 overflow-auto pr-1">
            {loadingContainers ? (
              <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">正在读取容器列表...</div>
            ) : filteredContainers.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">没有匹配的容器</div>
            ) : filteredContainers.map((item) => {
              const active = selectedId === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={`w-full rounded-2xl border px-3 py-3 text-left transition ${active ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/20' : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/40'}`}
                >
                  <div className="truncate text-sm font-semibold text-gray-900 dark:text-white">{item.name || item.id}</div>
                  <div className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">{item.usingImage || item.createImage || '--'}</div>
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{item.status || item.state || '--'}</div>
                </button>
              )
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-800 bg-[#0b0f14] p-0 shadow-sm overflow-hidden">
          <div className="border-b border-gray-800 bg-[#10161d] px-4 py-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="truncate text-lg font-semibold text-gray-100">{selectedContainer?.name || '请选择容器'}</div>
                <div className="truncate text-xs text-gray-400">{selectedContainer?.usingImage || selectedContainer?.createImage || ''}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-300">
                <span className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 ${loadingLogs ? 'border-amber-500/40 bg-amber-500/12 text-amber-300' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'}`}>
                  <Activity className={`h-3.5 w-3.5 ${loadingLogs ? 'animate-pulse' : ''}`} /> {loadingLogs ? '读取中' : '已就绪'}
                </span>
                <span className="inline-flex items-center gap-1 rounded-lg border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-gray-300">
                  <CircleDot className="h-3.5 w-3.5 text-sky-300" /> {lineCount} 行
                </span>
                <button onClick={() => setAutoScroll(v => !v)} className={toolBtn(autoScroll, 'sky')}>
                  <ArrowDownToLine className="h-3.5 w-3.5" /> 自动滚动
                </button>
                <button onClick={() => setWordWrap(v => !v)} className={toolBtn(wordWrap, 'amber')}>
                  <WrapText className="h-3.5 w-3.5" /> 自动换行
                </button>
                <button onClick={() => setFilterMode(v => !v)} className={toolBtn(filterMode, 'emerald')}>
                  <Filter className="h-3.5 w-3.5" /> 过滤模式
                </button>
                <div className="inline-flex items-center gap-1 rounded-lg border border-gray-700 bg-gray-900 px-2 py-1.5 text-gray-300">
                  <Type className="h-3.5 w-3.5" />
                  <button onClick={() => setFontSize(v => Math.max(10, v - 1))} className="rounded px-1 hover:bg-gray-800">-</button>
                  <span className="min-w-10 text-center">{fontSize}px</span>
                  <button onClick={() => setFontSize(v => Math.min(18, v + 1))} className="rounded px-1 hover:bg-gray-800">+</button>
                </div>
                <button onClick={copyLogs} disabled={!logs} className="inline-flex items-center gap-1 rounded-lg border border-gray-700 bg-gray-900 px-2.5 py-1.5 hover:bg-gray-800 disabled:opacity-50">
                  <Copy className="h-3.5 w-3.5" /> 复制
                </button>
                <button onClick={downloadLogs} disabled={!logs} className="inline-flex items-center gap-1 rounded-lg border border-gray-700 bg-gray-900 px-2.5 py-1.5 hover:bg-gray-800 disabled:opacity-50">
                  <Download className="h-3.5 w-3.5" /> 下载
                </button>
                <button onClick={clearView} className="inline-flex items-center gap-1 rounded-lg border border-gray-700 bg-gray-900 px-2.5 py-1.5 hover:bg-gray-800">
                  <Eraser className="h-3.5 w-3.5" /> 清空视图
                </button>
              </div>
            </div>
          </div>

          <div className="border-b border-gray-800 bg-[#0f141b] px-4 py-3">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      jumpMatch(e.shiftKey ? 'prev' : 'next')
                    }
                  }}
                  placeholder="搜索日志内容；Enter 下一条，Shift+Enter 上一条"
                  className="w-full rounded-xl border border-gray-700 bg-[#0b0f14] py-2 pl-10 pr-24 text-sm text-gray-100 placeholder:text-gray-500 focus:border-sky-500 focus:outline-none"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-500">{matchCount ? `${currentMatchIndex || 1}/${matchCount}` : '0'}</div>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <button onClick={() => jumpMatch('prev')} disabled={!matchCount} className="inline-flex items-center gap-1 rounded-lg border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-gray-300 hover:bg-gray-800 disabled:opacity-40">
                  <ChevronUp className="h-3.5 w-3.5" /> 上一条
                </button>
                <button onClick={() => jumpMatch('next')} disabled={!matchCount} className="inline-flex items-center gap-1 rounded-lg border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-gray-300 hover:bg-gray-800 disabled:opacity-40">
                  <ChevronDown className="h-3.5 w-3.5" /> 下一条
                </button>
                <button onClick={() => searchInputRef.current?.focus()} className="inline-flex items-center gap-1 rounded-lg border border-sky-500/30 bg-sky-500/10 px-2.5 py-1.5 text-sky-300 hover:bg-sky-500/15">
                  <Search className="h-3.5 w-3.5" /> 匹配 {matchCount}
                </button>
              </div>
            </div>
          </div>

          {message && <div className="mx-4 mt-3 rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-300">{message}</div>}

          <div ref={logRef} style={{ fontSize: `${fontSize}px` }} className={`dc-log-grid h-[70vh] overflow-auto bg-[#0b0f14] p-4 font-mono leading-6 text-green-300 ${wordWrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'}`}>
            {loadingLogs ? '正在读取日志...' : (processedLines.length > 0
              ? processedLines.map((line, idx) => <div key={idx}>{renderHighlightedLine(line, idx)}</div>)
              : '暂无日志输出')}
          </div>
        </div>
      </div>
    </div>
  )
}
