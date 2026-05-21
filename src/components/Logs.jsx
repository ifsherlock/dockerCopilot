import React, { useEffect, useMemo, useRef, useState } from 'react'
import { containerAPI } from '../api/client.js'
import { getImageLogo } from '../config/imageLogos.js'
import { Search, RefreshCw, Copy, Download, WrapText, ArrowDownToLine, Filter, Eraser, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Type, Activity, CircleDot, Moon, Sun, Box, Star, AlertTriangle, Clock3, Tags } from 'lucide-react'

function LogoOrFallback({ src, alt, active, collapsed }) {
  const [failed, setFailed] = useState(false)
  const sizeClass = collapsed ? 'h-8 w-8' : 'h-3.5 w-3.5'
  if (!src || failed) {
    return <Box className={`flex-shrink-0 ${collapsed ? 'h-8 w-8' : 'h-3.5 w-3.5'} ${active ? 'text-blue-600 dark:text-blue-300' : 'text-emerald-500 dark:text-emerald-400'}`} />
  }
  return (
    <img
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      className={`${sizeClass} rounded object-contain flex-shrink-0 ${active ? 'ring-1 ring-blue-400/60' : ''}`}
    />
  )
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function LogsPage() {
  const [containers, setContainers] = useState([])
  const [loadingContainers, setLoadingContainers] = useState(true)
  const [selectedId, setSelectedId] = useState(() => localStorage.getItem('docker_copilot_logs_selected_container') || '')
  const [logs, setLogs] = useState('')
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [tail, setTail] = useState(300)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [autoScroll, setAutoScroll] = useState(true)
  const [containerPaneCollapsed, setContainerPaneCollapsed] = useState(() => localStorage.getItem('docker_copilot_logs_container_pane') === 'collapsed')
  const [favoriteContainerIds, setFavoriteContainerIds] = useState(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('docker_copilot_logs_favorites') || '[]')
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  })
  const [draggingFavoriteId, setDraggingFavoriteId] = useState('')
  const [wordWrap, setWordWrap] = useState(true)
  const [fontSize, setFontSize] = useState(12)
  const [searchQuery, setSearchQuery] = useState('')
  const [levelFilter, setLevelFilter] = useState('all')
  const [filterMode, setFilterMode] = useState('highlight')
  const [message, setMessage] = useState('')
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0)
  const [logTheme, setLogTheme] = useState(() => localStorage.getItem('docker_copilot_logs_theme') || 'dark')
  const [showTimestamps, setShowTimestamps] = useState(() => localStorage.getItem('docker_copilot_logs_show_timestamps') !== 'false')
  const [showContainerPrefix, setShowContainerPrefix] = useState(() => localStorage.getItem('docker_copilot_logs_show_container_prefix') === 'true')

  const wrapAsCodeBlock = (value) => {
    const text = String(value || '').replace(/\s+$/g, '')
    return text ? `\`\`\`log\n${text}\n\`\`\`` : ''
  }
  const logRef = useRef(null)
  const searchInputRef = useRef(null)
  const lastLogRef = useRef('')

  const loadContainers = async () => {
    try {
      setLoadingContainers(true)
      const res = await containerAPI.getContainers()
      const list = res.data?.data || []
      setContainers(list)

      const storedId = localStorage.getItem('docker_copilot_logs_selected_container') || ''
      const currentSelected = selectedId || storedId
      const matched = currentSelected ? list.find(item => item.id === currentSelected) : null

      if (matched) {
        if (selectedId !== matched.id) setSelectedId(matched.id)
      } else if (!selectedId && !storedId && list.length > 0) {
        setSelectedId(list[0].id)
      } else if (selectedId && !list.find(item => item.id === selectedId) && list.length > 0) {
        setSelectedId(list[0].id)
      }
    } catch (error) {
      setMessage(`读取容器列表失败：${error.response?.data?.msg || error.message}`)
    } finally {
      setLoadingContainers(false)
    }
  }

  const loadLogs = async (containerId = selectedId, currentTail = tail, options = {}) => {
    if (!containerId) return
    const { silent = false } = options
    try {
      if (!silent) setLoadingLogs(true)
      const res = await containerAPI.getContainerLogs(containerId, currentTail)
      const nextLogs = res.data?.data?.logs || ''
      const changed = nextLogs !== lastLogRef.current
      lastLogRef.current = nextLogs
      setLogs(prev => (prev === nextLogs ? prev : nextLogs))
      setMessage('')
      if (autoScroll && changed) {
        requestAnimationFrame(() => {
          if (logRef.current) {
            logRef.current.scrollTop = logRef.current.scrollHeight
          }
        })
      }
    } catch (error) {
      setMessage(`读取容器日志失败：${error.response?.data?.msg || error.message}`)
    } finally {
      if (!silent) setLoadingLogs(false)
    }
  }

  useEffect(() => {
    loadContainers()
  }, [])

  useEffect(() => {
    if (selectedId) loadLogs(selectedId, tail)
  }, [selectedId, tail])

  useEffect(() => {
    if (!logRef.current) return
    const root = logRef.current
    const onCopy = (event) => {
      const selection = window.getSelection?.()
      const selectedText = selection ? String(selection).trim() : ''
      if (!selectedText || !root.contains(selection?.anchorNode)) return
      event.preventDefault()
      event.clipboardData?.setData('text/plain', wrapAsCodeBlock(selectedText))
    }
    root.addEventListener('copy', onCopy)
    return () => root.removeEventListener('copy', onCopy)
  }, [logs])

  useEffect(() => {
    if (!autoRefresh || !selectedId) return
    const timer = setInterval(() => loadLogs(selectedId, tail, { silent: true }), 3000)
    return () => clearInterval(timer)
  }, [autoRefresh, selectedId, tail, autoScroll])

  useEffect(() => {
    localStorage.setItem('docker_copilot_logs_theme', logTheme)
  }, [logTheme])

  useEffect(() => {
    localStorage.setItem('docker_copilot_logs_show_timestamps', String(showTimestamps))
  }, [showTimestamps])

  useEffect(() => {
    localStorage.setItem('docker_copilot_logs_show_container_prefix', String(showContainerPrefix))
  }, [showContainerPrefix])

  useEffect(() => {
    localStorage.setItem('docker_copilot_logs_container_pane', containerPaneCollapsed ? 'collapsed' : 'expanded')
  }, [containerPaneCollapsed])

  useEffect(() => {
    if (selectedId) {
      localStorage.setItem('docker_copilot_logs_selected_container', selectedId)
    }
  }, [selectedId])

  useEffect(() => {
    localStorage.setItem('docker_copilot_logs_favorites', JSON.stringify(favoriteContainerIds))
  }, [favoriteContainerIds])

  const customIcons = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('docker_copilot_image_logos') || '{}')
    } catch {
      return {}
    }
  }, [])

  const filteredContainers = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    const filtered = !q
      ? containers
      : containers.filter(item =>
          [item.name, item.usingImage, item.createImage, item.state, item.status]
            .some(v => String(v || '').toLowerCase().includes(q))
        )

    return [...filtered].sort((a, b) => {
      const aFavIndex = favoriteContainerIds.indexOf(a.id)
      const bFavIndex = favoriteContainerIds.indexOf(b.id)
      const aFav = aFavIndex >= 0
      const bFav = bFavIndex >= 0
      if (aFav !== bFav) return aFav ? -1 : 1
      if (aFav && bFav && aFavIndex !== bFavIndex) return aFavIndex - bFavIndex
      return String(a.name || a.id).localeCompare(String(b.name || b.id), 'zh-Hans-CN')
    })
  }, [containers, keyword, favoriteContainerIds])

  const selectedContainer = containers.find(item => item.id === selectedId)

  const toggleFavorite = (containerId) => {
    setFavoriteContainerIds(prev => prev.includes(containerId)
      ? prev.filter(id => id !== containerId)
      : [...prev, containerId])
  }

  const moveFavoriteBefore = (dragId, targetId) => {
    if (!dragId || !targetId || dragId === targetId) return
    setFavoriteContainerIds(prev => {
      const favs = prev.filter(id => id !== dragId)
      const targetIndex = favs.indexOf(targetId)
      if (targetIndex < 0) return prev
      favs.splice(targetIndex, 0, dragId)
      return favs
    })
  }

  const copyLogs = async () => {
    try {
      const text = logs ? `\`\`\`log\n${logs}\n\`\`\`` : ''
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.setAttribute('readonly', '')
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
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

  const normalizeLevel = (line) => {
    const text = String(line || '')
    const upper = text.toUpperCase()
    if (/\[(ERROR|ERR)\]|\b(ERROR|ERR)\b/.test(upper)) return 'error'
    if (/\[(WARN|WARNING)\]|\b(WARN|WARNING)\b/.test(upper)) return 'warn'
    if (/\[(DEBUG|DBG)\]|\b(DEBUG|DBG)\b/.test(upper)) return 'debug'
    if (/\[(INFO|INF)\]|\b(INFO|INF)\b/.test(upper)) return 'info'
    return 'other'
  }

  const parseLogLine = (line) => {
    const raw = String(line || '')
    const timestampMatch = raw.match(/^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?)/)
    const timestamp = timestampMatch?.[1] || ''
    let rest = timestamp ? raw.slice(timestamp.length).trim() : raw

    let containerPrefix = ''
    const prefixMatch = rest.match(/^([a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)?)\s*\|\s*(.+)$/)
    if (prefixMatch) {
      containerPrefix = prefixMatch[1]
      rest = prefixMatch[2]
    }

    const level = normalizeLevel(rest)
    return { raw, timestamp, containerPrefix, level, message: rest || raw }
  }


  const processedLines = useMemo(() => {
    const raw = String(logs || '')
    const query = searchQuery.trim()
    let lines = raw.split('\n').map(parseLogLine)
    if (levelFilter !== 'all') {
      lines = lines.filter(line => line.level === levelFilter)
    }
    if (filterMode === 'only-match' && query) {
      const re = new RegExp(escapeRegExp(query), 'i')
      lines = lines.filter(line => re.test(line.raw) || re.test(line.message) || re.test(line.timestamp) || re.test(line.containerPrefix))
    }
    return lines
  }, [logs, searchQuery, filterMode, levelFilter])

  const matchCount = useMemo(() => {
    const query = searchQuery.trim()
    if (!query) return 0
    const re = new RegExp(escapeRegExp(query), 'gi')
    return processedLines.reduce((count, line) => count + (((line.raw || '').match(re) || []).length), 0)
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
    const content = line?.message ?? line?.raw ?? ''
    const levelChipClass = line?.level === 'error'
      ? 'border border-red-500/30 bg-red-500/12 text-red-300'
      : line?.level === 'warn'
        ? 'border border-amber-500/30 bg-amber-500/12 text-amber-300'
        : line?.level === 'info'
          ? 'border border-sky-500/30 bg-sky-500/12 text-sky-300'
          : line?.level === 'debug'
            ? 'border border-violet-500/30 bg-violet-500/12 text-violet-300'
            : ''

    const renderText = (text) => {
      if (!query) return <React.Fragment>{text || ' '}</React.Fragment>
      const re = new RegExp(`(${escapeRegExp(query)})`, 'gi')
      const parts = String(text).split(re)
      return parts.map((part, idx) => {
        const isMatch = part && part.toLowerCase() === query.toLowerCase()
        return isMatch
          ? <mark key={idx} className="dc-log-match rounded bg-amber-300/30 px-0.5 text-amber-100">{part}</mark>
          : <React.Fragment key={idx}>{part || ''}</React.Fragment>
      })
    }

    return (
      <React.Fragment key={lineIndex}>
        {line?.level && line.level !== 'other' ? <span className={`mr-2 inline-flex rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase ${levelChipClass}`}>{line.level}</span> : null}
        {renderText(content)}
      </React.Fragment>
    )
  }

  const clearView = () => {
    setLogs('')
    setMessage('当前视图已清空，不影响容器真实日志')
  }

  const iconBtn = (active, color = 'sky') => {
    const activeMap = {
      sky: darkTheme
        ? 'border-sky-500/40 bg-sky-500/12 text-sky-300 shadow-[0_0_0_1px_rgba(56,189,248,0.15)]'
        : 'border-sky-300 bg-sky-50 text-sky-700 shadow-[0_0_0_1px_rgba(56,189,248,0.12)]',
      amber: darkTheme
        ? 'border-amber-500/40 bg-amber-500/12 text-amber-300 shadow-[0_0_0_1px_rgba(251,191,36,0.15)]'
        : 'border-amber-300 bg-amber-50 text-amber-700 shadow-[0_0_0_1px_rgba(251,191,36,0.12)]',
      emerald: darkTheme
        ? 'border-emerald-500/40 bg-emerald-500/12 text-emerald-300 shadow-[0_0_0_1px_rgba(16,185,129,0.15)]'
        : 'border-emerald-300 bg-emerald-50 text-emerald-700 shadow-[0_0_0_1px_rgba(16,185,129,0.12)]'
    }
    const inactive = darkTheme
      ? 'border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800'
      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
    return `inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${active ? activeMap[color] : inactive}`
  }

  const lineCount = processedLines.length
  const darkTheme = logTheme === 'dark'

  return (
    <div className="space-y-4">
      <style>{`
        .dc-log-match-current { background: rgba(251, 191, 36, 0.45) !important; color: #fff7d6 !important; box-shadow: 0 0 0 1px rgba(251, 191, 36, 0.45); }
        .dc-log-grid { background-image: linear-gradient(to bottom, rgba(255,255,255,0.02) 1px, transparent 1px); background-size: 100% 24px; }
        .dc-log-grid-light { background-image: linear-gradient(to bottom, rgba(15,23,42,0.05) 1px, transparent 1px); background-size: 100% 24px; }
        .dc-scrollbar-soft::-webkit-scrollbar { width: 10px; height: 10px; }
        .dc-scrollbar-soft::-webkit-scrollbar-track { background: transparent; }
        .dc-scrollbar-soft::-webkit-scrollbar-thumb { background: rgba(156, 163, 175, 0.45); border-radius: 9999px; border: 2px solid transparent; background-clip: padding-box; }
        .dc-scrollbar-soft::-webkit-scrollbar-thumb:hover { background: rgba(156, 163, 175, 0.72); border: 2px solid transparent; background-clip: padding-box; }
      `}</style>
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">容器日志</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">继续按 Dockhand 靠拢：更明显的工具状态、命中跳转、控制台式头部信息。</p>
          </div>
        </div>
      </div>

      <div className={`grid grid-cols-1 gap-3 ${containerPaneCollapsed ? 'xl:grid-cols-[88px_minmax(0,1fr)]' : 'xl:grid-cols-[236px_minmax(0,1fr)]'}`}>
        <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-2 flex items-center justify-between gap-2">
            <button
              onClick={loadContainers}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200 transition-colors"
              title="刷新容器列表"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              onClick={() => setContainerPaneCollapsed(v => !v)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200 transition-colors"
              title={containerPaneCollapsed ? '展开容器栏' : '收起容器栏'}
            >
              {containerPaneCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          </div>
          {!containerPaneCollapsed && (
            <div className="mb-3.5 mt-2 flex items-center justify-between gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="搜索容器"
                  className="w-full rounded-xl border border-gray-200 bg-white py-1.5 pl-9 pr-3 text-xs outline-none ring-0 focus:border-blue-500 dark:border-gray-600 dark:bg-gray-900"
                />
              </div>
            </div>
          )}
          <div className={`dc-scrollbar-soft overflow-auto pr-1 ${containerPaneCollapsed ? 'max-h-[76vh] space-y-2' : 'max-h-[70vh] space-y-1'}`}>
            {loadingContainers ? (
              <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">正在读取容器列表...</div>
            ) : filteredContainers.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">没有匹配的容器</div>
            ) : filteredContainers.map((item) => {
              const active = selectedId === item.id
              const favorite = favoriteContainerIds.includes(item.id)
              const imageRef = item.usingImage || item.createImage || ''
              const logoSrc = getImageLogo(imageRef, customIcons)
              return (
                <button
                  key={item.id}
                  draggable={favorite}
                  onDragStart={() => setDraggingFavoriteId(item.id)}
                  onDragOver={(e) => {
                    if (!favorite || !draggingFavoriteId || draggingFavoriteId === item.id) return
                    e.preventDefault()
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    moveFavoriteBefore(draggingFavoriteId, item.id)
                    setDraggingFavoriteId('')
                  }}
                  onDragEnd={() => setDraggingFavoriteId('')}
                  onClick={() => setSelectedId(item.id)}
                  className={`relative w-full border text-left transition ${containerPaneCollapsed ? 'h-[52px] min-h-[52px] rounded-2xl px-0 py-2 flex items-center justify-center overflow-visible' : 'rounded-2xl px-2.5 py-2'} ${active ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/20' : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/40'} ${favorite && draggingFavoriteId === item.id ? 'opacity-60' : ''}`}
                  title={containerPaneCollapsed ? (item.name || item.id) : undefined}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleFavorite(item.id)
                    }}
                    className={`absolute ${containerPaneCollapsed ? 'right-1.5 top-1.5' : 'right-2 top-2'} inline-flex h-5 w-5 items-center justify-center rounded-full transition-colors ${favorite ? 'text-yellow-400 hover:text-yellow-300' : 'text-gray-300 hover:text-yellow-400 dark:text-gray-500 dark:hover:text-yellow-400'}`}
                    title={favorite ? '取消置顶' : '置顶该容器'}
                  >
                    <Star className={`h-3.5 w-3.5 ${favorite ? 'fill-current' : ''}`} />
                  </button>
                  {containerPaneCollapsed ? (
                    <div className={`relative flex h-[52px] w-[52px] min-h-[52px] min-w-[52px] max-h-[52px] max-w-[52px] items-center justify-center rounded-2xl border flex-shrink-0 overflow-hidden ${active ? 'border-blue-400 bg-blue-100/80 dark:border-blue-400 dark:bg-blue-900/30' : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/60'}`}>
                      <LogoOrFallback src={logoSrc} alt={item.name || item.id} active={active} collapsed />
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-1.5 min-w-0 pr-6">
                        <LogoOrFallback src={logoSrc} alt={item.name || item.id} active={active} />
                        <div className="truncate text-[12px] font-semibold text-gray-900 dark:text-white">{item.name || item.id}</div>
                      </div>
                      <div className="mt-0.5 truncate pl-5 pr-6 text-[10px] text-gray-500 dark:text-gray-400">{imageRef || '--'}</div>
                    </>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        <div className={`rounded-2xl border p-0 shadow-sm overflow-hidden ${darkTheme ? 'border-gray-800 bg-[#0b0f14]' : 'border-gray-200 bg-white'} ${containerPaneCollapsed ? 'xl:min-h-[78vh]' : ''}`}>
          <div className={`border-b px-4 py-3 ${darkTheme ? 'border-gray-800 bg-[#10161d]' : 'border-gray-200 bg-slate-50'}`}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className={`truncate text-lg font-semibold ${darkTheme ? 'text-gray-100' : 'text-gray-900'}`}>{selectedContainer?.name || '请选择容器'}</div>
                <div className={`truncate text-xs ${darkTheme ? 'text-gray-400' : 'text-gray-500'}`}>{selectedContainer?.usingImage || selectedContainer?.createImage || ''}</div>
              </div>
              <div className={`flex flex-wrap items-center gap-2 text-xs ${darkTheme ? 'text-gray-300' : 'text-gray-700'}`}>
                <span className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 ${loadingLogs ? 'border-amber-500/40 bg-amber-500/12 text-amber-300' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'}`}>
                  <Activity className={`h-3.5 w-3.5 ${loadingLogs ? 'animate-pulse' : ''}`} /> {loadingLogs ? '读取中' : '已就绪'}
                </span>
                <div className={`inline-flex items-center gap-2 rounded-lg border px-2 py-1.5 ${darkTheme ? 'border-gray-700 bg-gray-900 text-gray-300' : 'border-gray-300 bg-white text-gray-700'}`} title="日志行数 / Tail">
                  <span className="text-[11px] opacity-75">Tail</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={tail}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D+/g, '')
                      setTail(raw)
                    }}
                    onBlur={() => setTail(v => {
                      const num = Number(v)
                      if (!num) return '300'
                      return String(Math.min(5000, Math.max(100, num)))
                    })}
                    className={`w-14 bg-transparent text-center text-base font-semibold outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${darkTheme ? 'text-gray-100' : 'text-gray-800'}`}
                  />
                  <span className="text-xs opacity-75">行</span>
                  <div className="ml-1 inline-flex items-center gap-1">
                    <button onClick={() => setTail(v => String(Math.max(100, Number(v || 300) - 100)))} className={`inline-flex h-7 w-7 items-center justify-center rounded ${darkTheme ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`} title="减少 100 行">
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => setTail(v => String(Math.min(5000, Math.max(100, Number(v || 300)) + 100)))} className={`inline-flex h-7 w-7 items-center justify-center rounded ${darkTheme ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`} title="增加 100 行">
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <button onClick={() => setAutoScroll(v => !v)} className={iconBtn(autoScroll, 'sky')} title="自动滚动">
                  <ArrowDownToLine className="h-4 w-4" />
                </button>
                <button onClick={() => setAutoRefresh(v => !v)} className={iconBtn(autoRefresh, 'emerald')} title="自动刷新">
                  <RefreshCw className="h-4 w-4" />
                </button>
                <button onClick={() => setWordWrap(v => !v)} className={iconBtn(wordWrap, 'amber')} title="自动换行">
                  <WrapText className="h-4 w-4" />
                </button>
                <button onClick={() => setShowTimestamps(v => !v)} className={iconBtn(showTimestamps, 'sky')} title="显示时间戳">
                  <Clock3 className="h-4 w-4" />
                </button>
                <button onClick={() => setShowContainerPrefix(v => !v)} className={iconBtn(showContainerPrefix, 'emerald')} title="显示容器名前缀">
                  <Tags className="h-4 w-4" />
                </button>
                <button onClick={() => setFilterMode(v => v === 'only-match' ? 'highlight' : 'only-match')} className={iconBtn(filterMode === 'only-match', 'emerald')} title={filterMode === 'only-match' ? '仅看命中行' : '高亮模式'}>
                  <Filter className="h-4 w-4" />
                </button>
                <button onClick={() => setLogTheme(v => v === 'dark' ? 'light' : 'dark')} className={iconBtn(!darkTheme, 'amber')} title={darkTheme ? '切换到白天' : '切换到黑夜'}>
                  {darkTheme ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>
                <div className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 ${darkTheme ? 'border-gray-700 bg-gray-900 text-gray-300' : 'border-gray-300 bg-white text-gray-700'}`} title="字体大小">
                  <Type className="h-3.5 w-3.5" />
                  <button onClick={() => setFontSize(v => Math.max(10, v - 1))} className={`rounded px-1 ${darkTheme ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}>-</button>
                  <span className="min-w-10 text-center">{fontSize}px</span>
                  <button onClick={() => setFontSize(v => Math.min(18, v + 1))} className={`rounded px-1 ${darkTheme ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}>+</button>
                </div>
                <button onClick={copyLogs} disabled={!logs} className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border disabled:opacity-50 ${darkTheme ? 'border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'}`} title="复制日志">
                  <Copy className="h-4 w-4" />
                </button>
                <button onClick={downloadLogs} disabled={!logs} className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border disabled:opacity-50 ${darkTheme ? 'border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'}`} title="下载日志">
                  <Download className="h-4 w-4" />
                </button>
                <button onClick={clearView} className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border ${darkTheme ? 'border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'}`} title="清空当前视图">
                  <Eraser className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <div className={`border-b px-4 py-3 ${darkTheme ? 'border-gray-800 bg-[#0f141b]' : 'border-gray-200 bg-slate-50'}`}>
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
                  placeholder={filterMode === 'only-match' ? '仅显示命中该关键词的日志行' : '高亮关键词；Enter 下一条，Shift+Enter 上一条'}
                  className={`w-full rounded-xl border py-2 pl-10 pr-24 text-sm focus:outline-none ${darkTheme ? 'border-gray-700 bg-[#0b0f14] text-gray-100 placeholder:text-gray-500 focus:border-sky-500' : 'border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 focus:border-sky-500'}`}
                />
                <div className={`absolute right-3 top-1/2 -translate-y-1/2 text-[11px] ${darkTheme ? 'text-gray-500' : 'text-gray-400'}`}>{matchCount ? `${currentMatchIndex || 1}/${matchCount}` : '0'}</div>
              </div>
              <div className="flex items-center gap-2 text-xs flex-wrap">
                <div className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 ${darkTheme ? 'border-gray-700 bg-gray-900 text-gray-300' : 'border-gray-300 bg-white text-gray-700'}`} title="日志级别筛选">
                  {['all', 'error', 'warn', 'info', 'debug'].map(level => (
                    <button
                      key={level}
                      onClick={() => setLevelFilter(level)}
                      className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${levelFilter === level ? (darkTheme ? 'bg-sky-500/15 text-sky-300' : 'bg-sky-100 text-sky-700') : (darkTheme ? 'text-gray-400 hover:bg-gray-800 hover:text-gray-200' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700')}`}
                      title={level === 'all' ? '全部日志' : `${level.toUpperCase()} 日志`}
                    >
                      {level === 'all' ? '全部' : level.toUpperCase()}
                    </button>
                  ))}
                </div>
                <button onClick={() => jumpMatch('prev')} disabled={!matchCount} className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border disabled:opacity-40 ${darkTheme ? 'border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'}`} title="上一条匹配">
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button onClick={() => jumpMatch('next')} disabled={!matchCount} className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border disabled:opacity-40 ${darkTheme ? 'border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'}`} title="下一条匹配">
                  <ChevronDown className="h-4 w-4" />
                </button>
                <button onClick={() => searchInputRef.current?.focus()} className="inline-flex h-9 items-center gap-1 rounded-lg border border-sky-500/30 bg-sky-500/10 px-2.5 text-sky-300 hover:bg-sky-500/15" title="聚焦搜索框">
                  <Search className="h-4 w-4" />
                  <span>{matchCount}</span>
                </button>
              </div>
            </div>
          </div>

          {message && <div className={`mx-4 mt-3 rounded-xl px-3 py-2 text-sm ${darkTheme ? 'bg-amber-500/10 text-amber-300' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>{message}</div>}

          <div ref={logRef} style={{ fontSize: `${fontSize}px` }} className={`${darkTheme ? 'dc-log-grid bg-[#0b0f14] text-white' : 'dc-log-grid-light bg-[#f8fafc] text-slate-800'} ${containerPaneCollapsed ? 'h-[78vh]' : 'h-[70vh]'} overflow-auto p-4 font-mono leading-6 ${wordWrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'}`}>
            {loadingLogs ? '正在读取日志...' : (processedLines.length > 0
              ? processedLines.map((line, idx) => (
                <div key={idx} className="flex gap-2 text-white dark:text-white">
                  {showTimestamps && <span className="flex-shrink-0 text-gray-500">{line.timestamp || '--'}</span>}
                  {showContainerPrefix && <span className="flex-shrink-0 text-cyan-300">{line.containerPrefix || (selectedContainer?.name || '--')}</span>}
                  <span className="min-w-0">{renderHighlightedLine(line, idx)}</span>
                </div>
              ))
              : '暂无日志输出')}
          </div>
        </div>
      </div>
    </div>
  )
}
