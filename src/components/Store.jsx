import React, { useEffect, useMemo, useState } from 'react'
import { Download, ExternalLink, Eye, Plus, Power, RefreshCw, Search, Settings, Store as StoreIcon, Trash2, X } from 'lucide-react'
import { storeAPI } from '../api/client.js'
import { cn } from '../utils/cn.js'
import { getImageLogo } from '../config/imageLogos.js'

const casaApps = [
  { name: 'Bazarr', author: 'linuxserver', category: 'Media', description: 'Subtitle companion for Sonarr and Radarr.', image: 'lscr.io/linuxserver/bazarr:latest', port: '6767' },
  { name: 'Calibre Web', author: 'linuxserver', category: 'Media', description: 'Web app for browsing and downloading e-books.', image: 'lscr.io/linuxserver/calibre-web:latest', port: '8083' },
  { name: 'Cloudflared', author: 'Cloudflare', category: 'Developer', description: 'Cloudflare Tunnel daemon for exposing services.', image: 'cloudflare/cloudflared:latest', port: '' },
  { name: 'ChatGPT Next Web', author: 'Yidadaa', category: 'AI', description: 'A well-known ChatGPT web UI.', image: 'yidadaa/chatgpt-next-web:latest', port: '3000' },
  { name: 'CloudBeaver', author: 'dbeaver', category: 'Developer', description: 'Web database management tool.', image: 'dbeaver/cloudbeaver:latest', port: '8978' },
  { name: 'CopyParty', author: '9001', category: 'Utilities', description: 'Portable file server with web UI.', image: 'copyparty/ac:latest', port: '3923' },
]

function serviceName(app) {
  return app.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'app'
}

function composeTemplate(app) {
  if (app.compose && String(app.compose).trim()) return String(app.compose).trimEnd() + '\n'
  const service = serviceName(app)
  const lines = [
    'services:',
    `  ${service}:`,
    `    image: ${app.image}`,
    `    container_name: ${service}`,
    '    restart: unless-stopped',
  ]
  if (app.port) lines.push('    ports:', `      - "${app.port}:${app.port}"`)
  lines.push('    volumes:', `      - ./data/${service}:/config`, '    environment:', '      - TZ=Asia/Shanghai')
  return `${lines.join('\n')}\n`
}

function appIconUrl(app) {
  const icon = String(app?.icon || app?.Icon || '').trim()
  if (icon && (/^(https?:|data:|\/src\/|\/assets\/)/i.test(icon))) return icon
  return getImageLogo(app?.image || app?.Image || '')
}

export function Store({ onInstall }) {
  const [apps, setApps] = useState(casaApps)
  const [sources, setSources] = useState([])
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [showSources, setShowSources] = useState(false)
  const [draft, setDraft] = useState({ id: '', name: '', url: '', enabled: true })
  const [message, setMessage] = useState('')
  const [loadingSources, setLoadingSources] = useState(false)
  const [loadingApps, setLoadingApps] = useState(false)
  const [previewApp, setPreviewApp] = useState(null)

  const loadApps = async (force = false) => {
    try {
      setLoadingApps(true)
      const res = await storeAPI.getApps(force)
      const list = res.data?.data || []
      if (Array.isArray(list) && list.length > 0) {
        setApps(list)
      } else {
        setApps(casaApps)
        setMessage('商店模板暂不可用，已显示本地示例')
      }
      if (res.data?.msg && res.data.msg !== 'success') setMessage(res.data.msg)
    } catch (error) {
      setMessage(`读取商店失败，已使用本地示例：${error.response?.data?.msg || error.message}`)
      setApps(casaApps)
    } finally {
      setLoadingApps(false)
    }
  }

  const loadSources = async () => {
    try {
      setLoadingSources(true)
      const res = await storeAPI.getSources()
      setSources(res.data?.data || [])
    } finally {
      setLoadingSources(false)
    }
  }

  useEffect(() => {
    loadSources()
    loadApps()
  }, [])

  useEffect(() => {
    const onGlobalRefresh = () => {
      loadSources()
      loadApps(true)
    }
    window.addEventListener('docker-copilot-global-refresh', onGlobalRefresh)
    return () => window.removeEventListener('docker-copilot-global-refresh', onGlobalRefresh)
  }, [])

  const categories = useMemo(() => ['all', ...Array.from(new Set(apps.map(app => app.category || 'CasaOS')))], [apps])
  const filtered = apps.filter(app => {
    const q = query.trim().toLowerCase()
    const hit = !q || [app.name, app.author, app.description, app.category].some(v => String(v || '').toLowerCase().includes(q))
    return hit && (category === 'all' || app.category === category)
  })

  const saveSource = async () => {
    const name = draft.name.trim()
    const url = draft.url.trim()
    if (!name || !url) {
      setMessage('请填写商店源名称和地址')
      return
    }
    if (draft.id) {
      await storeAPI.updateSource(draft.id, { ...draft, name, url })
    } else {
      await storeAPI.saveSource({ ...draft, name, url })
    }
    setDraft({ id: '', name: '', url: '', enabled: true })
    setMessage(draft.id ? '商店源已更新' : '商店源已保存')
    await loadSources()
  }

  const editSource = (source) => {
    setDraft({
      id: source.id || '',
      name: source.name || '',
      url: source.url || '',
      enabled: source.enabled !== false,
    })
  }

  const toggleSource = async (source) => {
    await storeAPI.updateSource(source.id, {
      id: source.id,
      name: source.name,
      url: source.url,
      enabled: source.enabled === false,
    })
    setMessage(source.enabled === false ? '商店源已启用' : '商店源已停用')
    await loadSources()
  }

  const deleteSource = async (id) => {
    await storeAPI.deleteSource(id)
    setMessage('商店源已删除')
    await loadSources()
  }

  const install = (app) => {
    const service = serviceName(app)
    const content = composeTemplate(app)
    localStorage.setItem('docker_copilot_compose_draft', JSON.stringify({
      name: service,
      content,
      source: 'store',
      appName: app.name,
      createdAt: new Date().toISOString(),
    }))
    setMessage(`${app.name} 已准备安装`)
    onInstall?.(service)
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <StoreIcon className="h-4 w-4" />
              应用模板
            </div>
          </div>
          <button
            onClick={() => setShowSources(true)}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Settings className="h-4 w-4" />
            商店源
          </button>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={e => setQuery(e.target.value)} className="input pl-10" placeholder="搜索应用" />
          </div>
          <select value={category} onChange={e => setCategory(e.target.value)} className="input">
            {categories.map(item => <option key={item} value={item}>{item === 'all' ? '全部分类' : item}</option>)}
          </select>
        </div>
      </section>

      {message && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
          {message}
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {filtered.map(app => (
          <div key={app.name} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-sky-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-sky-800">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {appIconUrl(app) ? (
                  <img src={appIconUrl(app)} alt={app.name} className="h-10 w-10 rounded-xl object-cover" />
                ) : (
                  <StoreIcon className="h-7 w-7" />
                )}
              </div>
              <div className="min-w-0">
                <h3 className="truncate font-semibold text-slate-950 dark:text-white">{app.name}</h3>
                <p className="text-sm text-slate-500">{app.author}</p>
              </div>
            </div>
            <p className="mt-4 min-h-12 text-sm leading-6 text-slate-600 dark:text-slate-300">{app.description}</p>
            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">{app.category}</span>
              <div className="flex gap-2">
                <button onClick={() => setPreviewApp(app)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                  <Eye className="h-4 w-4" />
                  模板
                </button>
                <button onClick={() => install(app)} className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700">
                  <Download className="h-4 w-4" />
                  安装
                </button>
              </div>
            </div>
          </div>
        ))}
      </section>

      {previewApp && (
        <ComposePreviewModal app={previewApp} onClose={() => setPreviewApp(null)} onInstall={install} />
      )}

      {showSources && (
        <SourcesModal
          sources={sources}
          draft={draft}
          setDraft={setDraft}
          loadingSources={loadingSources}
          onClose={() => setShowSources(false)}
          onRefresh={loadSources}
          onEdit={editSource}
          onToggle={toggleSource}
          onDelete={deleteSource}
          onSave={saveSource}
        />
      )}
    </div>
  )
}

function ComposePreviewModal({ app, onClose, onInstall }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="min-w-0">
            <h3 className="truncate font-semibold text-slate-950 dark:text-white">{app.name} Compose</h3>
            <p className="mt-1 text-xs text-slate-500">{app.image || app.sourceId}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title="关闭">
            <X className="h-5 w-5" />
          </button>
        </div>
        <pre className="min-h-0 flex-1 overflow-auto bg-slate-950 p-5 font-mono text-sm leading-6 text-emerald-100">{composeTemplate(app)}</pre>
        <div className="flex flex-col gap-2 border-t border-slate-200 p-4 dark:border-slate-800 sm:flex-row sm:justify-end">
          <button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">关闭</button>
          <button onClick={() => onInstall(app)} className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700">安装</button>
        </div>
      </div>
    </div>
  )
}

function SourcesModal({ sources, draft, setDraft, loadingSources, onClose, onRefresh, onEdit, onToggle, onDelete, onSave }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h3 className="font-semibold text-slate-950 dark:text-white">商店源</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">管理模板源。</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onRefresh} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title="刷新">
              <RefreshCw className={cn('h-4 w-4', loadingSources && 'animate-spin')} />
            </button>
            <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title="关闭">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-2">
            {sources.map(source => (
              <div key={source.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 px-3 py-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 font-medium text-slate-950 dark:text-white">
                    <span>{source.name}</span>
                    {source.builtin && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-600 dark:bg-sky-950/40 dark:text-sky-300">内置</span>}
                    <span className={cn('rounded-full px-2 py-0.5 text-xs', source.enabled === false ? 'bg-slate-100 text-slate-500 dark:bg-slate-800' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300')}>
                      {source.enabled === false ? '停用' : '启用'}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-xs text-slate-500">{source.url}</div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <a href={source.url} target="_blank" rel="noreferrer" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800" title="打开">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                  <button onClick={() => onEdit(source)} className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800" title="编辑">编辑</button>
                  <button onClick={() => onToggle(source)} className={cn('inline-flex h-9 w-9 items-center justify-center rounded-lg border', source.enabled === false ? 'border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-900 dark:hover:bg-emerald-950/30' : 'border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800')} title={source.enabled === false ? '启用' : '停用'}>
                    <Power className="h-4 w-4" />
                  </button>
                  {!source.builtin && (
                    <button onClick={() => onDelete(source.id)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/30" title="删除">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/30">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[180px_minmax(0,1fr)_auto_auto]">
              <input className="input" placeholder="源名称" value={draft.name} onChange={e => setDraft(prev => ({ ...prev, name: e.target.value }))} />
              <input className="input" placeholder="源地址" value={draft.url} onChange={e => setDraft(prev => ({ ...prev, url: e.target.value }))} />
              <label className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                <input type="checkbox" checked={draft.enabled !== false} onChange={e => setDraft(prev => ({ ...prev, enabled: e.target.checked }))} />
                启用
              </label>
              <button onClick={onSave} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 text-sm font-medium text-white hover:bg-sky-700">
                <Plus className="h-4 w-4" />
                {draft.id ? '保存' : '添加'}
              </button>
            </div>
            {draft.id && (
              <button onClick={() => setDraft({ id: '', name: '', url: '', enabled: true })} className="mt-2 text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100">
                取消编辑
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

