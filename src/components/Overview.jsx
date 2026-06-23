import React, { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, Box, Database, Globe2, GripVertical, HardDrive, Package, Plus, RefreshCw, RotateCcw, Server, Trash2 } from 'lucide-react'
import { overviewAPI, containerAPI, imageAPI } from '../api/client.js'
import { cn } from '../utils/cn.js'
import { getCachedFavicon, getContainerImageRef, getContainerWebUrl, resolveContainerBuiltInIconUrl, resolveContainerCustomIconUrl, resolveFaviconFallback } from '../utils/containerIcons.js'
import { IconWithFallback } from './IconWithFallback.jsx'

const quickLinkPrefsKey = 'docker_copilot_overview_quick_links'

function loadQuickLinkPrefs() {
  try {
    const parsed = JSON.parse(localStorage.getItem(quickLinkPrefsKey) || '{}')
    return {
      order: Array.isArray(parsed.order) ? parsed.order : [],
      hidden: parsed.hidden && typeof parsed.hidden === 'object' ? parsed.hidden : {},
      deleted: parsed.deleted && typeof parsed.deleted === 'object' ? parsed.deleted : {},
      manual: Array.isArray(parsed.manual) ? parsed.manual : [],
    }
  } catch {
    return { order: [], hidden: {}, deleted: {}, manual: [] }
  }
}

function saveQuickLinkPrefs(prefs) {
  localStorage.setItem(quickLinkPrefsKey, JSON.stringify(prefs))
}

function StatCard({ icon: Icon, title, value, sub, tone = 'sky' }) {
  const toneClass = {
    sky: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    violet: 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  }[tone]
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm text-slate-500 dark:text-slate-400">{title}</div>
          <div className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">{value}</div>
          <div className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{sub}</div>
        </div>
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', toneClass)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  )
}

function normalizeContainer(item) {
  const id = item?.id || item?.ID || item?.Id || ''
  const name = String(item?.name || item?.Name || item?.Names?.[0] || id.slice(0, 12) || '').replace(/^\//, '')
  const status = String(item?.status || item?.Status || item?.state || item?.State || '')
  const state = String(item?.state || item?.State || status || '').toLowerCase()
  const image = item?.usingImage || item?.createImage || item?.Image || item?.image || ''
  const running = state === 'running' || status.toLowerCase().includes('up')
  return {
    id,
    name,
    status: running ? 'running' : (state || status),
    image,
    runningTime: status,
    endpointLink: item?.endpointLink || item?.EndpointLink || {},
    iconUrl: item?.iconUrl || item?.IconUrl || '',
    url: buildEndpointUrl({ endpointLink: item?.endpointLink || item?.EndpointLink || {} }),
  }
}

function buildEndpointUrl(item) {
  const endpoint = item?.endpointLink || {}
  if (endpoint.suggestedURL) return endpoint.suggestedURL
  const host = String(endpoint.hostIP || '').trim()
  const port = String(endpoint.editablePort || endpoint.chosenPort || '').trim()
  return host && port ? `http://${host}:${port}` : ''
}

function knownWebPort(item) {
  const text = `${item?.name || ''} ${item?.image || ''} ${item?.usingImage || ''} ${item?.createImage || ''}`.toLowerCase()
  if (text.includes('dockercopilot') || text.includes('docker-copilot')) return '12712'
  if (text.includes('moviepilot')) return '13000'
  return ''
}

function guessQuickUrl(item) {
  const endpointUrl = buildEndpointUrl(item)
  if (endpointUrl) return endpointUrl
  const endpoint = item?.endpointLink || {}
  const host = String(endpoint.hostIP || window.location.hostname || '').trim()
  const port = knownWebPort(item)
  return host && port ? `${window.location.protocol || 'http:'}//${host}:${port}` : ''
}

function resolveIconUrl(item, customIcons = {}) {
  return resolveContainerCustomIconUrl(item, customIcons)
}

function AppIcon({ item, customIcons, size = 'h-9 w-9', rounded = 'rounded-xl' }) {
  const webUrl = getContainerWebUrl(item)
  const customIconUrl = resolveIconUrl(item, customIcons)
  const builtInIconUrl = resolveContainerBuiltInIconUrl(item)
  const [faviconUrl, setFaviconUrl] = useState(() => customIconUrl ? '' : getCachedFavicon(webUrl))
  useEffect(() => {
    let cancelled = false
    if (customIconUrl || !webUrl) {
      setFaviconUrl('')
      return undefined
    }
    const cached = getCachedFavicon(webUrl)
    if (cached) {
      setFaviconUrl(cached)
      return undefined
    }
    resolveFaviconFallback(webUrl).then(url => {
      if (!cancelled && url) setFaviconUrl(url)
    })
    return () => {
      cancelled = true
    }
  }, [customIconUrl, webUrl])
  const fallback = (
    <span className={cn(size, rounded, 'flex items-center justify-center bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300')}>
      <Package className="h-4 w-4" />
    </span>
  )
  return (
    <IconWithFallback
      sources={[customIconUrl, faviconUrl, builtInIconUrl]}
      alt={item?.name || 'app'}
      className={cn(size, rounded, 'object-cover shadow-sm')}
      fallback={fallback}
    />
  )
}

function normalizeImage(item) {
  const size = Number(item?.sizeBytes || item?.Size || item?.size || 0)
  const containers = Number(item?.containers || item?.Containers || 0)
  const tags = item?.repoTags || item?.RepoTags || item?.tags || []
  const dangling = Array.isArray(tags)
    ? tags.length === 0 || tags.some(tag => String(tag).includes('<none>'))
    : String(tags || '').includes('<none>')
  return { size, used: containers > 0, dangling }
}

function formatBytes(size) {
  if (!Number.isFinite(size) || size <= 0) return '-'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = size
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value.toFixed(1)} ${units[index]}`
}

async function loadOverviewWithFallback() {
  try {
    const res = await overviewAPI.getOverview()
    if (res.data?.code !== 200 && res.data?.code !== 0) throw new Error(res.data?.msg || '读取概览失败')
    return res.data.data || {}
  } catch (error) {
    const status = error.response?.status
    const msg = error.response?.data?.msg || error.message || ''
    if (status !== 404 && !String(msg).includes('404')) throw error

    const [containersRes, imagesRes] = await Promise.all([
      containerAPI.getContainers(),
      imageAPI.getImages(),
    ])
    const rawContainers = containersRes.data?.data || []
    const rawImages = imagesRes.data?.data || []
    const normalizedContainers = rawContainers.map(normalizeContainer)
    const normalizedImages = rawImages.map(normalizeImage)
    const runningContainers = normalizedContainers.filter(item => item.status === 'running')
    const totalImageSize = normalizedImages.reduce((sum, item) => sum + item.size, 0)

    return {
      docker: { connected: true, status: 'partial', message: '当前后端未提供 /api/overview，已显示基础数据。' },
      containers: {
        total: normalizedContainers.length,
        running: runningContainers.length,
        stopped: Math.max(0, normalizedContainers.length - runningContainers.length),
      },
      images: {
        total: normalizedImages.length,
        used: normalizedImages.filter(item => item.used).length,
        unused: normalizedImages.filter(item => !item.used).length,
        dangling: normalizedImages.filter(item => item.dangling).length,
        sizeBytes: totalImageSize,
        size: formatBytes(totalImageSize),
      },
      networks: {},
      volumes: {},
      storage: { partial: true, items: [], message: '旧后端未提供 Docker system df。' },
      quickLinks: runningContainers
        .filter(item => item.endpointLink?.suggestedURL)
        .map(item => ({
          id: item.id,
          name: item.name,
          url: item.endpointLink.suggestedURL,
          status: item.status,
          image: item.image,
          container: item.id,
        })),
      runningContainers,
      partialFallback: true,
    }
  }
}

export function Overview({ onNavigate }) {
  const [quickLinkPrefs, setQuickLinkPrefs] = useState(loadQuickLinkPrefs)
  const [isQuickEditing, setIsQuickEditing] = useState(false)
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [draggingQuickLinkId, setDraggingQuickLinkId] = useState('')
  const [selectedQuickContainer, setSelectedQuickContainer] = useState('')
  const [quickAddUrl, setQuickAddUrl] = useState('')

  const { data: customIcons = {} } = useQuery({
    queryKey: ['customIcons'],
    queryFn: async () => {
      const response = await imageAPI.getIcons()
      if (response.data?.code === 200 || response.data?.code === 0) {
        const icons = response.data?.data || {}
        localStorage.setItem('docker_copilot_image_logos', JSON.stringify(icons))
        return icons
      }
      return {}
    },
    initialData: () => {
      try {
        return JSON.parse(localStorage.getItem('docker_copilot_image_logos') || '{}')
      } catch {
        return {}
      }
    },
  })

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['overview'],
    queryFn: loadOverviewWithFallback,
    refetchInterval: 15000,
  })

  useEffect(() => {
    const onGlobalRefresh = () => refetch()
    window.addEventListener('docker-copilot-global-refresh', onGlobalRefresh)
    return () => window.removeEventListener('docker-copilot-global-refresh', onGlobalRefresh)
  }, [refetch])

  useEffect(() => {
    const reloadPrefs = () => setQuickLinkPrefs(loadQuickLinkPrefs())
    window.addEventListener('storage', reloadPrefs)
    window.addEventListener('docker-copilot-quick-links-updated', reloadPrefs)
    return () => {
      window.removeEventListener('storage', reloadPrefs)
      window.removeEventListener('docker-copilot-quick-links-updated', reloadPrefs)
    }
  }, [])

  useEffect(() => {
    saveQuickLinkPrefs(quickLinkPrefs)
  }, [quickLinkPrefs])

  const restartContainer = async (id) => {
    await containerAPI.restartContainer(id)
    refetch()
  }

  const stopContainer = async (id) => {
    await containerAPI.stopContainer(id)
    refetch()
  }

  const containers = data?.containers || {}
  const images = data?.images || {}
  const networks = data?.networks || {}
  const volumes = data?.volumes || {}
  const quickLinks = data?.quickLinks || []
  const runningContainers = data?.runningContainers || []

  const orderedQuickLinks = useMemo(() => {
    const merged = new Map()
    ;(quickLinks || []).forEach(link => merged.set(link.id, link))
    ;(quickLinkPrefs.manual || []).forEach(link => merged.set(link.id, { ...merged.get(link.id), ...link, manual: true }))
    const available = Array.from(merged.values()).filter(link => link?.url && !quickLinkPrefs.deleted?.[link.id] && !quickLinkPrefs.hidden?.[link.id])
    const orderIndex = new Map((quickLinkPrefs.order || []).map((id, index) => [id, index]))
    return [...available].sort((a, b) => {
      const ai = orderIndex.has(a.id) ? orderIndex.get(a.id) : Number.MAX_SAFE_INTEGER
      const bi = orderIndex.has(b.id) ? orderIndex.get(b.id) : Number.MAX_SAFE_INTEGER
      if (ai !== bi) return ai - bi
      return String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hans-CN')
    })
  }, [quickLinks, quickLinkPrefs])

  const restoreableQuickLinks = useMemo(() => {
    const merged = new Map()
    ;(quickLinks || []).forEach(link => merged.set(link.id, link))
    ;(quickLinkPrefs.manual || []).forEach(link => merged.set(link.id, { ...merged.get(link.id), ...link, manual: true }))
    return Array.from(merged.values()).filter(link => quickLinkPrefs.hidden?.[link.id] || quickLinkPrefs.deleted?.[link.id])
  }, [quickLinks, quickLinkPrefs])

  const quickContainerOptions = useMemo(() => {
    return (runningContainers || [])
      .map(item => ({ ...item, url: guessQuickUrl(item), needsManualUrl: !buildEndpointUrl(item) }))
      .filter(item => item.id)
  }, [runningContainers])

  useEffect(() => {
    const selected = quickContainerOptions.find(container => container.id === selectedQuickContainer)
    setQuickAddUrl(selected?.url || '')
  }, [selectedQuickContainer, quickContainerOptions])

  const updateQuickLinkPrefs = (updater) => {
    setQuickLinkPrefs(prev => updater({
      order: Array.isArray(prev.order) ? [...prev.order] : [],
      hidden: { ...(prev.hidden || {}) },
      deleted: { ...(prev.deleted || {}) },
      manual: Array.isArray(prev.manual) ? [...prev.manual] : [],
    }))
  }

  const setLinkVisibility = (id, mode) => {
    updateQuickLinkPrefs(prev => {
      if (mode === 'hide') prev.hidden[id] = true
      if (mode === 'delete') prev.deleted[id] = true
      if (mode === 'restore') {
        delete prev.hidden[id]
        delete prev.deleted[id]
      }
      return prev
    })
  }

  const addContainerQuickLink = async () => {
    const item = quickContainerOptions.find(container => container.id === selectedQuickContainer)
    if (!item) return
    const url = quickAddUrl.trim()
    if (!url) return
    const iconUrl = resolveContainerCustomIconUrl(item, customIcons) || await resolveFaviconFallback(url)
    updateQuickLinkPrefs(prev => {
      const link = {
        id: item.id,
        name: item.name,
        url,
        status: item.status,
        image: getContainerImageRef(item),
        iconUrl: iconUrl || '',
        container: item.id,
      }
      prev.manual = prev.manual.filter(existing => existing.id !== link.id).concat(link)
      delete prev.hidden[link.id]
      delete prev.deleted[link.id]
      if (!prev.order.includes(link.id)) prev.order.push(link.id)
      return prev
    })
    setSelectedQuickContainer('')
    setQuickAddUrl('')
    setShowQuickAdd(false)
  }

  const reorderQuickLink = (sourceId, targetId) => {
    if (!sourceId || !targetId || sourceId === targetId) return
    updateQuickLinkPrefs(prev => {
      const ids = orderedQuickLinks.map(link => link.id)
      const sourceIndex = ids.indexOf(sourceId)
      const targetIndex = ids.indexOf(targetId)
      if (sourceIndex < 0 || targetIndex < 0) return prev
      const [moved] = ids.splice(sourceIndex, 1)
      ids.splice(targetIndex, 0, moved)
      prev.order = ids
      return prev
    })
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {data?.partialFallback && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
            概览接口不可用，已显示基础数据。
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard icon={Server} title="容器" value={containers.total || 0} sub={`运行 ${containers.running || 0} / 停止 ${containers.stopped || 0} / 更新 ${containers.updateAvailable || 0}`} tone="sky" />
          <StatCard icon={Box} title="镜像" value={images.total || 0} sub={`${images.size || '-'} · 未使用 ${images.unused || 0}`} tone="emerald" />
          <StatCard icon={Globe2} title="网络" value={networks.total || 0} sub={`bridge ${networks.bridge || 0} / macvlan ${networks.macvlan || 0}`} tone="violet" />
          <StatCard icon={Database} title="卷" value={volumes.total || 0} sub={`使用中 ${volumes.used || 0} / 疑似未用 ${volumes.unused || 0}`} tone="amber" />
          <StatCard icon={HardDrive} title="存储" value={data?.storage?.partial ? '部分可用' : '已读取'} sub={(data?.storage?.items || []).map(i => `${i.type}:${i.size}`).join('  ') || '等待 Docker system df'} tone="sky" />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-950 dark:text-white">快捷导航</h3>
          <div className="relative flex items-center gap-2">
            {isQuickEditing && (
              <button onClick={() => setShowQuickAdd(value => !value)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                <Plus className="h-3.5 w-3.5" />
                添加
              </button>
            )}
            <button onClick={() => {
              setIsQuickEditing(value => !value)
              setShowQuickAdd(false)
            }} className={cn(
              'inline-flex h-8 items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition',
              isQuickEditing
                ? 'border-teal-500 bg-teal-50 text-teal-700 dark:border-teal-700 dark:bg-teal-950/30 dark:text-teal-200'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
            )}>
              <GripVertical className="h-3.5 w-3.5" />
              {isQuickEditing ? '完成' : '整理'}
            </button>
            {isQuickEditing && showQuickAdd && (
              <div className="absolute right-0 top-10 z-30 w-[min(90vw,360px)] rounded-2xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-800 dark:bg-slate-900">
                <div className="grid grid-cols-1 gap-2">
                  <select className="input h-9 text-sm" value={selectedQuickContainer} onChange={e => setSelectedQuickContainer(e.target.value)}>
                    <option value="">选择容器</option>
                    {quickContainerOptions.map(item => <option key={item.id} value={item.id}>{item.name} · {item.url || '手动填写 URL'}</option>)}
                  </select>
                  <input className="input h-9 text-sm" value={quickAddUrl} onChange={e => setQuickAddUrl(e.target.value)} placeholder="http://192.168.1.10:12712" />
                  <button onClick={addContainerQuickLink} disabled={!selectedQuickContainer || !quickAddUrl.trim()} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-teal-600 px-3 text-xs font-semibold text-white disabled:opacity-50">
                    <Plus className="h-3.5 w-3.5" />
                    添加到快捷导航
                  </button>
                </div>
                {restoreableQuickLinks.length > 0 && (
                  <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-800">
                    <div className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">恢复</div>
                    <div className="flex flex-wrap gap-1.5">
                      {restoreableQuickLinks.slice(0, 6).map(link => (
                        <button key={link.id} onClick={() => setLinkVisibility(link.id, 'restore')} className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800">
                          <RotateCcw className="h-3 w-3 shrink-0" />
                          <span className="truncate">{link.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        {isLoading ? (
          <div className="flex h-24 items-center justify-center text-slate-500"><RefreshCw className="mr-2 h-4 w-4 animate-spin" />加载中</div>
        ) : orderedQuickLinks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">暂无快捷入口</div>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8 2xl:grid-cols-10">
            {orderedQuickLinks.map((link) => (
              <div
                key={link.id}
                draggable={isQuickEditing}
                onDragStart={() => setDraggingQuickLinkId(link.id)}
                onDragOver={(event) => {
                  if (isQuickEditing) event.preventDefault()
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  reorderQuickLink(draggingQuickLinkId, link.id)
                  setDraggingQuickLinkId('')
                }}
                onDragEnd={() => setDraggingQuickLinkId('')}
                className={cn(
                  'group relative rounded-xl border border-slate-200 bg-slate-50/70 p-2 text-center transition dark:border-slate-800 dark:bg-slate-950/30',
                  isQuickEditing
                    ? 'cursor-grab border-dashed hover:border-teal-400 active:cursor-grabbing dark:hover:border-teal-700'
                    : 'hover:border-teal-300 hover:bg-teal-50/80 dark:hover:border-teal-800 dark:hover:bg-teal-950/20',
                  draggingQuickLinkId === link.id && 'opacity-50'
                )}
              >
                {isQuickEditing ? (
                  <div className="block min-w-0 select-none" title="拖动排序">
                    <span className="mx-auto block w-fit"><AppIcon item={link} customIcons={customIcons} size="h-9 w-9" /></span>
                    <span className="mt-1.5 block truncate text-xs font-medium text-slate-900 dark:text-white">{link.name}</span>
                  </div>
                ) : (
                  <a href={link.url} target="_blank" rel="noreferrer" className="block min-w-0" title={link.url}>
                    <span className="mx-auto block w-fit"><AppIcon item={link} customIcons={customIcons} size="h-9 w-9" /></span>
                    <span className="mt-1.5 block truncate text-xs font-medium text-slate-900 dark:text-white">{link.name}</span>
                  </a>
                )}
                {isQuickEditing && (
                  <button onClick={() => setLinkVisibility(link.id, 'delete')} className="absolute -right-1.5 -top-1.5 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-red-200 bg-white text-red-500 shadow-sm hover:bg-red-50 dark:border-red-900/70 dark:bg-slate-900 dark:hover:bg-red-950/40" title="删除">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-950 dark:text-white">运行中的容器</h3>
          <button onClick={() => onNavigate?.('#containers/list')} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
            查看全部
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {runningContainers.slice(0, 4).map(item => (
            <div key={item.id} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <AppIcon item={item} customIcons={customIcons} size="h-10 w-10" />
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-950 dark:text-white">{item.name}</div>
                    <div className="mt-1 truncate text-xs text-slate-500">{item.image}</div>
                  </div>
                </div>
                <Activity className="h-5 w-5 shrink-0 text-emerald-500" />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={() => restartContainer(item.id)} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">重启</button>
                <button onClick={() => stopContainer(item.id)} className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">停止</button>
              </div>
            </div>
          ))}
          {runningContainers.length === 0 && <div className="col-span-full rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">暂无运行中的容器</div>}
        </div>
      </section>
    </div>
  )
}

