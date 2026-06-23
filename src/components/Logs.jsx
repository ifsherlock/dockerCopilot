import React, { useEffect, useMemo, useRef, useState } from 'react'
import { containerAPI, progressAPI, systemLogAPI } from '../api/client.js'
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

function ContainerLogsPanel() {
  const [containers, setContainers] = useState([])
  const [loadingContainers, setLoadingContainers] = useState(true)
  const [selectedId, setSelectedId] = useState(() => localStorage.getItem('docker_copilot_logs_selected_container') || '')
  const [logs, setLogs] = useState('')
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [tail, setTail] = useState(300)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [autoScroll, setAutoScroll] = useState(true)
  const [containerPaneCollapsed, setContainerPaneCollapsed] = useState(() => true)
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
  const [levelFilterMenuOpen, setLevelFilterMenuOpen] = useState(false)
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false)

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
    const onGlobalRefresh = () => {
      loadContainers()
      if (selectedId) loadLogs(selectedId, tail)
    }
    window.addEventListener('docker-copilot-global-refresh', onGlobalRefresh)
    return () => window.removeEventListener('docker-copilot-global-refresh', onGlobalRefresh)
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
  const levelFilterLabelMap = {
    all: '全部',
    error: 'ERROR',
    warn: 'WARN',
    info: 'INFO',
    debug: 'DEBUG'
  }

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
    const rawContent = line?.message ?? line?.raw ?? ''
    const content = line?.level && line.level !== 'other'
      ? String(rawContent).replace(/^\s*(?:\[(?:ERROR|ERR|WARN|WARNING|DEBUG|DBG|INFO|INF)\]|(?:ERROR|ERR|WARN|WARNING|DEBUG|DBG|INFO|INF))\s*[:\-]?\s*/i, '')
      : rawContent
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
      <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800 xl:hidden">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            >
              {containers.length === 0 ? (
                <option value="">暂无容器</option>
              ) : (
                containers.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name || item.id}
                  </option>
                ))
              )}
            </select>
            <div className="mt-2 truncate text-[11px] text-gray-500 dark:text-gray-400">
              {selectedContainer?.usingImage || selectedContainer?.createImage || '请选择容器后查看日志'}
            </div>
          </div>
          <button
            onClick={loadContainers}
            className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            title="刷新容器列表"
          >
            <RefreshCw className={`h-4 w-4 ${loadingContainers ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className={`grid grid-cols-1 gap-3 ${containerPaneCollapsed ? 'xl:grid-cols-[88px_minmax(0,1fr)]' : 'xl:grid-cols-[236px_minmax(0,1fr)]'}`}>
        <div className="hidden rounded-2xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800 xl:block">
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
                    <div className="relative flex h-[52px] w-[52px] min-h-[52px] min-w-[52px] max-h-[52px] max-w-[52px] flex-shrink-0 items-center justify-center overflow-hidden rounded-xl">
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
            <div className="hidden xl:flex xl:flex-col xl:gap-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className={`truncate text-lg font-semibold ${darkTheme ? 'text-gray-100' : 'text-gray-900'}`}>{selectedContainer?.name || '请选择容器'}</div>
                  <div className={`truncate text-xs ${darkTheme ? 'text-gray-400' : 'text-gray-500'}`}>{selectedContainer?.usingImage || selectedContainer?.createImage || ''}</div>
                </div>
                <div className={`flex flex-wrap items-center justify-end gap-2 text-xs ${darkTheme ? 'text-gray-300' : 'text-gray-700'}`}>
                  <span className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] ${loadingLogs ? 'border-amber-500/40 bg-amber-500/12 text-amber-300' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'}`}>
                    <Activity className={`h-3.5 w-3.5 ${loadingLogs ? 'animate-pulse' : ''}`} />
                    <span>{loadingLogs ? '读取中' : '已就绪'}</span>
                  </span>
                  <div className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 ${darkTheme ? 'border-gray-700 bg-gray-900 text-gray-300' : 'border-gray-300 bg-white text-gray-700'}`} title="日志行数">
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
                      className={`w-12 bg-transparent text-center text-sm font-semibold outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${darkTheme ? 'text-gray-100' : 'text-gray-800'}`}
                    />
                    <span className="text-xs opacity-75">行</span>
                    <div className="inline-flex items-center gap-1 ml-1">
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
                  <div className={`inline-flex h-9 items-center gap-1 rounded-lg border px-2 py-1.5 ${darkTheme ? 'border-gray-700 bg-gray-900 text-gray-300' : 'border-gray-300 bg-white text-gray-700'}`} title="字体大小">
                    <Type className="h-3.5 w-3.5" />
                    <button onClick={() => setFontSize(v => Math.max(10, v - 1))} className={`rounded px-1 ${darkTheme ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}>-</button>
                    <span className="min-w-10 text-center text-sm">{fontSize}px</span>
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

            <div className="flex flex-col gap-3 xl:hidden">
              <div className="min-w-0">
                <div className={`truncate text-lg font-semibold ${darkTheme ? 'text-gray-100' : 'text-gray-900'}`}>{selectedContainer?.name || '请选择容器'}</div>
                <div className={`truncate text-xs ${darkTheme ? 'text-gray-400' : 'text-gray-500'}`}>{selectedContainer?.usingImage || selectedContainer?.createImage || ''}</div>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                <span
                  className={`inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border ${loadingLogs ? 'border-amber-500/40 bg-amber-500/12 text-amber-300' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'}`}
                  title={loadingLogs ? '读取中' : '已就绪'}
                >
                  <Activity className={`h-3.5 w-3.5 ${loadingLogs ? 'animate-pulse' : ''}`} />
                </span>
                <div className={`inline-flex flex-shrink-0 items-center gap-1 rounded-lg border px-2 py-1 ${darkTheme ? 'border-gray-700 bg-gray-900 text-gray-300' : 'border-gray-300 bg-white text-gray-700'}`} title="日志行数">
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
                    className={`w-11 bg-transparent text-center text-sm font-semibold outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${darkTheme ? 'text-gray-100' : 'text-gray-800'}`}
                  />
                  <div className="ml-0.5 inline-flex items-center gap-0.5">
                    <button onClick={() => setTail(v => String(Math.max(100, Number(v || 300) - 100)))} className={`inline-flex h-6 w-6 items-center justify-center rounded ${darkTheme ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`} title="减少 100 行">
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => setTail(v => String(Math.min(5000, Math.max(100, Number(v || 300)) + 100)))} className={`inline-flex h-6 w-6 items-center justify-center rounded ${darkTheme ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`} title="增加 100 行">
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <button onClick={() => setWordWrap(v => !v)} className={`${iconBtn(wordWrap, 'amber')} flex-shrink-0`} title="自动换行">
                  <WrapText className="h-4 w-4" />
                </button>
                <button onClick={() => setAutoRefresh(v => !v)} className={`${iconBtn(autoRefresh, 'emerald')} flex-shrink-0`} title="自动刷新">
                  <RefreshCw className="h-4 w-4" />
                </button>
                <button onClick={() => setMobileMoreOpen(v => !v)} className={`${iconBtn(mobileMoreOpen, 'sky')} flex-shrink-0`} title="更多功能">
                  <ChevronDown className={`h-4 w-4 transition-transform ${mobileMoreOpen ? 'rotate-180' : ''}`} />
                </button>
              </div>
              {mobileMoreOpen && (
                <div className={`rounded-xl border p-3 ${darkTheme ? 'border-gray-700 bg-[#0b0f14]' : 'border-gray-200 bg-white'}`}>
                  <div className="grid grid-cols-4 gap-2">
                    <button onClick={() => setAutoScroll(v => !v)} className={iconBtn(autoScroll, 'sky')} title="自动滚动">
                      <ArrowDownToLine className="h-4 w-4" />
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
                  <div className={`mt-3 inline-flex h-9 items-center gap-1 rounded-lg border px-2 py-1.5 ${darkTheme ? 'border-gray-700 bg-gray-900 text-gray-300' : 'border-gray-300 bg-white text-gray-700'}`} title="字体大小">
                    <Type className="h-3.5 w-3.5" />
                    <button onClick={() => setFontSize(v => Math.max(10, v - 1))} className={`rounded px-1 ${darkTheme ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}>-</button>
                    <span className="min-w-10 text-center text-sm">{fontSize}px</span>
                    <button onClick={() => setFontSize(v => Math.min(18, v + 1))} className={`rounded px-1 ${darkTheme ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}>+</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className={`border-b px-4 py-3 ${darkTheme ? 'border-gray-800 bg-[#0f141b]' : 'border-gray-200 bg-slate-50'}`}>
            <div className="hidden xl:flex xl:items-center xl:gap-3">
              <div className="relative min-w-0 flex-1">
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
                  className={`w-full rounded-xl border py-2 pl-10 pr-4 text-sm focus:outline-none ${darkTheme ? 'border-gray-700 bg-[#0b0f14] text-gray-100 placeholder:text-gray-500 focus:border-sky-500' : 'border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 focus:border-sky-500'}`}
                />
              </div>
              <div className={`inline-flex items-center gap-1 rounded-xl border p-1 ${darkTheme ? 'border-gray-700 bg-gray-900' : 'border-gray-300 bg-white'}`}>
                {['all', 'error', 'warn', 'info', 'debug'].map(level => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setLevelFilter(level)}
                    className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${levelFilter === level ? (darkTheme ? 'bg-sky-500/15 text-sky-300' : 'bg-sky-100 text-sky-700') : (darkTheme ? 'text-gray-300 hover:bg-gray-800' : 'text-gray-700 hover:bg-gray-100')}`}
                    title={level === 'all' ? '全部日志' : `${level.toUpperCase()} 日志`}
                  >
                    {levelFilterLabelMap[level] || level}
                  </button>
                ))}
              </div>
              <span className={`inline-flex h-9 min-w-[68px] items-center justify-center rounded-lg border px-2 text-xs ${darkTheme ? 'border-gray-700 bg-gray-900 text-gray-400' : 'border-gray-300 bg-white text-gray-500'}`}>
                {matchCount ? `${currentMatchIndex || 1}/${matchCount}` : '0'}
              </span>
              <button onClick={() => jumpMatch('prev')} disabled={!matchCount} className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border disabled:opacity-40 ${darkTheme ? 'border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'}`} title="上一条匹配">
                <ChevronUp className="h-4 w-4" />
              </button>
              <button onClick={() => jumpMatch('next')} disabled={!matchCount} className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border disabled:opacity-40 ${darkTheme ? 'border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'}`} title="下一条匹配">
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-col gap-2 xl:hidden">
              <div className="relative min-w-0">
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
                  className={`w-full rounded-xl border py-2 pl-10 pr-16 text-sm focus:outline-none ${darkTheme ? 'border-gray-700 bg-[#0b0f14] text-gray-100 placeholder:text-gray-500 focus:border-sky-500' : 'border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 focus:border-sky-500'}`}
                />
                <div className={`absolute right-3 top-1/2 -translate-y-1/2 text-[11px] ${darkTheme ? 'text-gray-500' : 'text-gray-400'}`}>{matchCount ? `${currentMatchIndex || 1}/${matchCount}` : '0'}</div>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2">
                <div className="relative min-w-0">
                  <button
                    type="button"
                    onClick={() => setLevelFilterMenuOpen(v => !v)}
                    className={`inline-flex h-9 w-full items-center justify-between gap-1.5 rounded-lg border px-2.5 text-xs font-medium ${darkTheme ? 'border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'}`}
                    title="日志级别筛选"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Filter className="h-3.5 w-3.5" />
                      <span>{levelFilterLabelMap[levelFilter] || '全部'}</span>
                    </span>
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${levelFilterMenuOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {levelFilterMenuOpen && (
                    <div className={`absolute left-0 right-0 z-20 mt-2 rounded-xl border p-1 shadow-xl ${darkTheme ? 'border-gray-700 bg-[#10161d]' : 'border-gray-200 bg-white'}`}>
                      {['all', 'error', 'warn', 'info', 'debug'].map(level => (
                        <button
                          key={level}
                          type="button"
                          onClick={() => {
                            setLevelFilter(level)
                            setLevelFilterMenuOpen(false)
                          }}
                          className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition-colors ${levelFilter === level ? (darkTheme ? 'bg-sky-500/15 text-sky-300' : 'bg-sky-100 text-sky-700') : (darkTheme ? 'text-gray-300 hover:bg-gray-800' : 'text-gray-700 hover:bg-gray-100')}`}
                          title={level === 'all' ? '全部日志' : `${level.toUpperCase()} 日志`}
                        >
                          <span>{levelFilterLabelMap[level] || level}</span>
                          {levelFilter === level ? <span className="text-[10px]">当前</span> : null}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={() => jumpMatch('prev')} disabled={!matchCount} className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border disabled:opacity-40 ${darkTheme ? 'border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'}`} title="上一条匹配">
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button onClick={() => jumpMatch('next')} disabled={!matchCount} className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border disabled:opacity-40 ${darkTheme ? 'border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'}`} title="下一条匹配">
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {message && <div className={`mx-4 mt-3 rounded-xl px-3 py-2 text-sm ${darkTheme ? 'bg-amber-500/10 text-amber-300' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>{message}</div>}

          <div ref={logRef} style={{ fontSize: `${fontSize}px` }} className={`${darkTheme ? 'dc-log-grid bg-[#0b0f14] text-white' : 'dc-log-grid-light bg-[#f8fafc] text-slate-800'} h-[72vh] ${containerPaneCollapsed ? 'xl:h-[78vh]' : 'xl:h-[70vh]'} overflow-auto p-4 font-mono leading-6 ${wordWrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'}`}>
            {loadingLogs ? '正在读取日志...' : (processedLines.length > 0
              ? processedLines.map((line, idx) => (
                <div key={idx} className={`flex gap-2 ${darkTheme ? 'text-white' : 'text-slate-900'}`}>
                  {showTimestamps && <span className={`flex-shrink-0 ${darkTheme ? 'text-gray-500' : 'text-slate-500'}`}>{line.timestamp || '--'}</span>}
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

const logTabs = [
  { id: 'container', label: '容器日志' },
  { id: 'service', label: '服务日志' },
  { id: 'operation', label: '操作日志' },
  { id: 'task', label: '任务日志' },
]

function useSharedLogTheme() {
  const [logTheme, setLogTheme] = useState(() => localStorage.getItem('docker_copilot_logs_theme') || 'dark')

  useEffect(() => {
    localStorage.setItem('docker_copilot_logs_theme', logTheme)
  }, [logTheme])

  return {
    darkTheme: logTheme === 'dark',
    toggleLogTheme: () => setLogTheme(v => v === 'dark' ? 'light' : 'dark')
  }
}

function logThemeButtonClass(darkTheme, active, color = 'amber') {
  if (!active) {
    return darkTheme
      ? 'border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800'
      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
  }
  const activeMap = {
    amber: darkTheme
      ? 'border-amber-500/40 bg-amber-500/12 text-amber-300 shadow-[0_0_0_1px_rgba(251,191,36,0.15)]'
      : 'border-amber-300 bg-amber-50 text-amber-700 shadow-[0_0_0_1px_rgba(251,191,36,0.12)]',
    sky: darkTheme
      ? 'border-sky-500/40 bg-sky-500/12 text-sky-300 shadow-[0_0_0_1px_rgba(56,189,248,0.15)]'
      : 'border-sky-300 bg-sky-50 text-sky-700 shadow-[0_0_0_1px_rgba(56,189,248,0.12)]',
  }
  return activeMap[color] || activeMap.amber
}

function plainControlClass(darkTheme, widthClass = '') {
  return `h-10 ${widthClass} rounded-xl border px-3 text-sm outline-none transition-colors focus:border-sky-500 ${
    darkTheme
      ? 'border-slate-700 bg-[#0b0f14] text-slate-100 placeholder:text-slate-500'
      : 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400'
  }`
}

function PlainLogViewer({ title, logs, loading, message, controls, darkTheme = true, onToggleTheme }) {
  const renderedControls = typeof controls === 'function' ? controls({ darkTheme }) : controls
  return (
    <div className="flex h-[72vh] flex-col gap-3 xl:h-[78vh]">
      {message ? (
        <div className={`shrink-0 rounded-xl border px-3 py-2 text-sm ${darkTheme ? 'border-amber-800 bg-amber-950/40 text-amber-300' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
          {message}
        </div>
      ) : null}
      <section className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border shadow-sm ${darkTheme ? 'border-slate-900 bg-[#0b0f14]' : 'border-slate-200 bg-[#f8fafc]'}`}>
        <div className={`flex shrink-0 flex-col gap-3 border-b px-4 py-3 md:flex-row md:items-center md:justify-between ${darkTheme ? 'border-slate-800 bg-[#10161d]' : 'border-slate-200 bg-white'}`}>
          <div className="min-w-0">
            <div className={`truncate text-base font-semibold ${darkTheme ? 'text-slate-100' : 'text-slate-900'}`}>{title}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {renderedControls}
            {onToggleTheme ? (
              <button
                type="button"
                onClick={onToggleTheme}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${logThemeButtonClass(darkTheme, true, 'amber')}`}
                title={darkTheme ? '切换到白天' : '切换到黑夜'}
              >
                {darkTheme ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
            ) : null}
          </div>
        </div>
        <pre className={`dc-scrollbar-soft min-h-0 flex-1 overflow-auto p-4 font-mono text-xs leading-6 whitespace-pre-wrap break-words ${darkTheme ? 'text-slate-100' : 'text-slate-800'}`}>
          {loading ? '正在读取日志...' : (logs || '暂无日志')}
        </pre>
      </section>
    </div>
  )
}

function ServiceLogsPanel() {
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

function OperationLogsPanel() {
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

function TaskLogsPanel() {
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
      const lines = Array.isArray(data.logs) ? data.logs : []
      setLogs([
        `任务：${data.taskID || taskID}`,
        `名称：${data.name || '-'}`,
        `状态：${data.message || '-'} (${data.percentage || 0}%)`,
        `完成：${data.isDone ? '是' : '否'}`,
        `更新时间：${data.updatedAt || '-'}`,
        '',
        ...lines,
      ].join('\n'))
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
      const lines = Array.isArray(data.logs) ? data.logs : []
      setLogs([
        `任务：${data.taskID || id}`,
        `名称：${data.name || '-'}`,
        `状态：${data.message || '-'} (${data.percentage || 0}%)`,
        `完成：${data.isDone ? '是' : '否'}`,
        `更新时间：${data.updatedAt || '-'}`,
        '',
        ...lines,
      ].join('\n'))
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

export function LogsPage() {
  const [active, setActive] = useState('container')
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="flex gap-2 overflow-x-auto">
          {logTabs.map((item) => (
            <button
              key={item.id}
              onClick={() => setActive(item.id)}
              className={`shrink-0 rounded-xl px-4 py-2 text-left transition ${active === item.id ? 'bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
            >
              <span className="block text-sm font-semibold">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
      {active === 'container' && <ContainerLogsPanel />}
      {active === 'service' && <ServiceLogsPanel />}
      {active === 'operation' && <OperationLogsPanel />}
      {active === 'task' && <TaskLogsPanel />}
    </div>
  )
}

