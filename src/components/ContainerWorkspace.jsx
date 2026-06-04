import React, { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Circle, ExternalLink, FileCode, Link, ListChecks, PackageOpen, Play, RefreshCw, RotateCcw, Save, Square, Terminal, Trash2, X } from 'lucide-react'
import { Containers } from './Containers.jsx'
import { composeAPI, containerAPI, networkAPI, progressAPI } from '../api/client.js'
import { cn } from '../utils/cn.js'

function sanitizeComposeProjectName(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_. -]/g, '').replace(/[ .]+/g, '-').replace(/^[-_]+|[-_]+$/g, '') || 'app'
}

function defaultComposeBaseDir(name) {
  return `/data/compose/${sanitizeComposeProjectName(name)}`
}

function normalizePosixPath(path) {
  const absolute = String(path || '').startsWith('/')
  const parts = []
  String(path || '').split('/').forEach(part => {
    if (!part || part === '.') return
    if (part === '..') {
      if (parts.length > 0) parts.pop()
      return
    }
    parts.push(part)
  })
  return `${absolute ? '/' : ''}${parts.join('/')}` || (absolute ? '/' : '.')
}

function resolveRelativePath(baseDir, source) {
  return normalizePosixPath(`${String(baseDir || '').replace(/\/+$/, '')}/${source}`)
}

function isRelativeBindSource(source) {
  const value = String(source || '').trim()
  return value === '.' || value === '..' || value.startsWith('./') || value.startsWith('../')
}

function parseVolumeSpec(spec) {
  const parts = String(spec || '').split(':')
  if (parts.length < 2) return null
  const source = parts[0].trim()
  if (!isRelativeBindSource(source)) return null
  return { source, target: parts.slice(1).join(':') }
}

function resolveComposeRelativeVolumes(content, baseDir) {
  const mappings = []
  let inVolumes = false
  let volumesIndent = -1
  const lines = String(content || '').split('\n')
  const resolved = lines.map(line => {
    const sectionMatch = line.match(/^(\s*)([A-Za-z0-9_.-]+):\s*$/)
    if (sectionMatch) {
      const indent = sectionMatch[1].length
      const key = sectionMatch[2]
      if (key === 'volumes') {
        inVolumes = true
        volumesIndent = indent
      } else if (inVolumes && indent <= volumesIndent) {
        inVolumes = false
        volumesIndent = -1
      }
    }
    if (!inVolumes) return line
    const itemMatch = line.match(/^(\s*-\s*)(['"]?)([^'"]+)(\2)(\s*(?:#.*)?)$/)
    if (!itemMatch) return line
    const parsed = parseVolumeSpec(itemMatch[3])
    if (!parsed) return line
    const absolute = resolveRelativePath(baseDir, parsed.source)
    mappings.push({ from: parsed.source, to: absolute, target: parsed.target })
    return `${itemMatch[1]}${itemMatch[2]}${absolute}:${parsed.target}${itemMatch[2]}${itemMatch[5]}`
  }).join('\n')
  return { content: resolved, mappings }
}

function extractTemplateVariables(content) {
  const found = new Set()
  String(content || '').replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name) => {
    found.add(name)
    return _
  })
  return Array.from(found).sort()
}

function isPortVariable(name) {
  return /PORT/i.test(name)
}

function defaultTemplateValue(name, projectName) {
  if (name === 'CONTAINER_NAME') return sanitizeComposeProjectName(projectName)
  return ''
}

function applyTemplateVariables(content, values, projectName) {
  return String(content || '').replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (match, name) => {
    const value = String(values[name] ?? defaultTemplateValue(name, projectName) ?? '').trim()
    return value || match
  })
}

function externalNetworkNames(content) {
  const names = []
  const lines = String(content || '').split('\n')
  let inNetworks = false
  let networkIndent = -1
  let current = null
  let currentIndent = -1
  for (const line of lines) {
    const section = line.match(/^(\s*)([A-Za-z0-9_.-]+):\s*$/)
    if (section) {
      const indent = section[1].length
      const key = section[2]
      if (key === 'networks') {
        inNetworks = true
        networkIndent = indent
        current = null
        currentIndent = -1
        continue
      }
      if (inNetworks && indent <= networkIndent) {
        inNetworks = false
      }
      if (inNetworks && indent > networkIndent) {
        current = key
        currentIndent = indent
      }
    }
    if (inNetworks && current && line.match(new RegExp(`^\\s{${currentIndent + 2},}external:\\s*true\\s*$`, 'i'))) {
      names.push(current)
    }
  }
  return Array.from(new Set(names))
}

function progressToText(progress) {
  if (!progress) return ''
  if (Array.isArray(progress.logs) && progress.logs.length) return progress.logs.join('\n')
  return progress.detailMsg || progress.message || ''
}

function isContainerRunning(item) {
  const state = String(item?.state || item?.status || '').toLowerCase()
  return state === 'running' || state.includes('up')
}

function normalizeContainerUrl(value) {
  const url = String(value || '').trim()
  if (!url) return ''
  return /^https?:\/\//i.test(url) ? url : `http://${url}`
}

function hostForProjectLinks() {
  return window.location.hostname || '127.0.0.1'
}

function inferContainerWebUrl(item) {
  const ports = String(item?.ports || '').trim()
  const mapped = ports.match(/(?:0\.0\.0\.0|\[::\]|127\.0\.0\.1|localhost)?(?::)?(\d{2,5})\s*->/i)
    || ports.match(/(?:^|[\s,])(\d{2,5})\s*:\s*\d{2,5}/)
  if (mapped?.[1]) return normalizeContainerUrl(`${hostForProjectLinks()}:${mapped[1]}`)

  const text = `${item?.name || ''} ${item?.image || ''} ${item?.service || ''}`.toLowerCase()
  if (text.includes('dockercopilot') || text.includes('docker-copilot')) return normalizeContainerUrl(`${hostForProjectLinks()}:12712`)
  if (text.includes('moviepilot')) return normalizeContainerUrl(`${hostForProjectLinks()}:13080`)
  return ''
}

function addProjectContainerQuickLink(item) {
  const url = inferContainerWebUrl(item)
  if (!url) throw new Error('没有可用 Web URL')
  const key = 'docker_copilot_overview_quick_links'
  const parsed = JSON.parse(localStorage.getItem(key) || '{}')
  const prefs = {
    order: Array.isArray(parsed.order) ? parsed.order : [],
    hidden: parsed.hidden && typeof parsed.hidden === 'object' ? parsed.hidden : {},
    deleted: parsed.deleted && typeof parsed.deleted === 'object' ? parsed.deleted : {},
    manual: Array.isArray(parsed.manual) ? parsed.manual : [],
  }
  const id = item.id || item.name
  const link = {
    id,
    name: item.name || item.service || id,
    url,
    status: item.state || item.status || '',
    image: item.image || '',
    container: item.id || '',
  }
  prefs.manual = prefs.manual.filter(existing => existing.id !== id).concat(link)
  delete prefs.hidden[id]
  delete prefs.deleted[id]
  if (!prefs.order.includes(id)) prefs.order.push(id)
  localStorage.setItem(key, JSON.stringify(prefs))
  window.dispatchEvent(new Event('storage'))
  window.dispatchEvent(new CustomEvent('docker-copilot-quick-links-updated'))
  return url
}

export function ContainerWorkspace({ subTab = 'list', onSubTabChange }) {
  const nextTab = ['list', 'compose', 'new'].includes(subTab) ? subTab : 'list'
  const [active, setActive] = useState(nextTab)
  const [focusProject, setFocusProject] = useState('')

  useEffect(() => setActive(nextTab), [nextTab])

  return (
    <div className="space-y-4">
      {active === 'list' && <Containers />}
      {active === 'compose' && <ComposeProjects focusProject={focusProject} />}
      {active === 'new' && <NewDeploy onViewProject={() => {
        setFocusProject('')
        setActive('compose')
        onSubTabChange?.('compose')
      }} onViewNamedProject={(name) => {
        setFocusProject(name || '')
        setActive('compose')
        onSubTabChange?.('compose')
      }} />}
    </div>
  )
}

function projectStatusMeta(status) {
  switch (status) {
    case 'running':
      return { label: '运行中', className: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/25 dark:text-emerald-300 dark:border-emerald-800/50', icon: CheckCircle2 }
    case 'partial':
      return { label: '部分运行', className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800/50', icon: AlertTriangle }
    case 'error':
      return { label: '异常', className: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/25 dark:text-red-300 dark:border-red-800/50', icon: AlertTriangle }
    case 'stopped':
      return { label: '已停止', className: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700', icon: Circle }
    default:
      return { label: '未知', className: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700', icon: Circle }
  }
}

function ComposeProjects({ focusProject = '' }) {
  const [projects, setProjects] = useState([])
  const [selected, setSelected] = useState(null)
  const [content, setContent] = useState('')
  const [message, setMessage] = useState('')
  const [confirm, setConfirm] = useState(null)
  const [taskId, setTaskId] = useState('')
  const [taskProgress, setTaskProgress] = useState(null)
  const [taskTitle, setTaskTitle] = useState('')
  const [containerLog, setContainerLog] = useState(null)
  const [containerBusy, setContainerBusy] = useState({})
  const completedTaskRef = useRef('')

  const emitGlobalRefresh = (source = 'compose-project') => {
    window.dispatchEvent(new CustomEvent('docker-copilot-global-refresh', {
      detail: { source, activeTab: '#containers/project', at: Date.now() },
    }))
  }

  const load = async () => {
    const res = await composeAPI.getProjects()
    setProjects(res.data?.data || [])
  }

  const open = async (name) => {
    const res = await composeAPI.getProject(name)
    const project = res.data?.data
    setSelected(project)
    setContent(project?.content || '')
  }

  const refreshSelected = async (projectName = selected?.name) => {
    await load()
    if (projectName) await open(projectName)
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (focusProject) open(focusProject)
  }, [focusProject])

  useEffect(() => {
    const onGlobalRefresh = () => refreshSelected()
    window.addEventListener('docker-copilot-global-refresh', onGlobalRefresh)
    return () => window.removeEventListener('docker-copilot-global-refresh', onGlobalRefresh)
  }, [selected?.name])

  useEffect(() => {
    if (!taskId) return undefined
    let cancelled = false
    const tick = async () => {
      try {
        const res = await progressAPI.getProgress(taskId)
        const progress = res.data?.data
        if (!cancelled) setTaskProgress(progress)
        if (progress?.isDone && selected?.name && completedTaskRef.current !== taskId) {
          completedTaskRef.current = taskId
          await refreshSelected(selected.name)
          emitGlobalRefresh('compose-task-complete')
        }
      } catch (err) {
        if (!cancelled) setMessage(err.response?.data?.msg || err.message || '读取任务日志失败')
      }
    }
    tick()
    const timer = window.setInterval(tick, 1200)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [taskId, selected?.name])

  const save = async () => {
    if (!selected?.name) return
    const res = await composeAPI.updateProject(selected.name, { name: selected.name, content })
    const project = res.data?.data
    setSelected(project || selected)
    setContent(project?.content || content)
    setMessage('已保存')
    load()
  }

  const action = async (name, act, label) => {
    const res = await composeAPI.runAction(name, act)
    const nextTaskId = res.data?.data?.taskID || ''
    completedTaskRef.current = ''
    setTaskId(nextTaskId)
    setTaskProgress(null)
    setTaskTitle(label)
    setMessage(nextTaskId ? `${label}任务已提交` : `${label}任务已提交，但未返回任务 ID`)
  }

  const clearProject = async () => {
    if (!selected?.name) return
    const res = await composeAPI.clearProject(selected.name)
    setTaskId('')
    setTaskProgress({
      percentage: 100,
      isDone: true,
      logs: [`清除完成: 已删除 ${res.data?.data?.removed || 0} 个关联容器`],
    })
    setTaskTitle('清除')
    setConfirm(null)
    await refreshSelected(selected.name)
    emitGlobalRefresh('compose-clear')
  }

  const deleteProject = async () => {
    if (!selected?.name) return
    await composeAPI.deleteProject(selected.name)
    setTaskId('')
    setTaskProgress({
      percentage: 100,
      isDone: true,
      logs: [`删除完成: 已删除 ${selected.name} 项目文件`],
    })
    setTaskTitle('删除')
    setConfirm(null)
    setSelected(null)
    setContent('')
    await load()
    emitGlobalRefresh('compose-delete')
  }

  const runContainerAction = async (item, act) => {
    const id = item?.id || item?.name
    if (!id) return
    setContainerBusy(prev => ({ ...prev, [id]: act }))
    try {
      if (act === 'start') await containerAPI.startContainer(id)
      if (act === 'stop') await containerAPI.stopContainer(id)
      if (act === 'restart') await containerAPI.restartContainer(id)
      if (act === 'delete') await containerAPI.deleteContainer(id)
      await refreshSelected()
      emitGlobalRefresh('compose-container-action')
      setMessage('容器操作完成')
    } catch (err) {
      setMessage(err.response?.data?.msg || err.message || '容器操作失败')
    } finally {
      setContainerBusy(prev => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    }
  }

  const openContainerLogs = async (item) => {
    const id = item?.id || item?.name
    if (!id) return
    setContainerLog({ title: item.name || id, text: '日志加载中...', loading: true })
    try {
      const res = await containerAPI.getContainerLogs(id, 300)
      setContainerLog({ title: item.name || id, text: res.data?.data || res.data?.msg || '', loading: false })
    } catch (err) {
      setContainerLog({ title: item.name || id, text: err.response?.data?.msg || err.message || '读取日志失败', loading: false })
    }
  }

  const addServiceQuickLink = (item) => {
    try {
      const url = addProjectContainerQuickLink(item)
      setMessage(`已添加快捷导航：${url}`)
    } catch (err) {
      setMessage(err.message || '添加快捷导航失败')
    }
  }

  const taskText = progressToText(taskProgress)

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-slate-950 dark:text-white">项目</h3>
          <button onClick={load} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800" title="刷新项目">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-2">
          {projects.map(project => {
            const meta = projectStatusMeta(project.status)
            const Icon = meta.icon
            return (
              <button key={project.name} onClick={() => open(project.name)} className={cn('w-full rounded-xl border p-3 text-left transition', selected?.name === project.name ? 'border-sky-300 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/30' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className={cn('inline-flex h-6 min-w-6 items-center justify-center rounded-full border', meta.className)}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="truncate font-medium text-slate-900 dark:text-white">{project.name}</div>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {project.runningCount || 0} 运行 · {project.stoppedCount || 0} 停止 · {project.errorCount || 0} 异常
                    </div>
                  </div>
                  <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium', meta.className)}>{meta.label}</span>
                </div>
                <div className="mt-2 text-xs text-slate-500">{project.serviceCount} 服务 · {project.updatedAt}</div>
              </button>
            )
          })}
          {projects.length === 0 && <div className="text-sm text-slate-500">暂无项目，在“新建”中保存。</div>}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {selected ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-slate-950 dark:text-white">{selected.name}</h3>
                  {(() => {
                    const meta = projectStatusMeta(selected.status)
                    const Icon = meta.icon
                    return <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium', meta.className)}><Icon className="h-3 w-3" />{meta.label}</span>
                  })()}
                </div>
                <p className="truncate text-xs text-slate-500">{selected.path}</p>
                <p className="mt-1 text-xs text-slate-500">服务 {selected.serviceCount || 0} · 运行 {selected.runningCount || 0} · 停止 {selected.stoppedCount || 0} · 异常 {selected.errorCount || 0}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => action(selected.name, 'up', '启动')} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">启动</button>
                <button onClick={() => action(selected.name, 'stop', '停止')} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">停止</button>
                <button onClick={() => action(selected.name, 'restart', '重启')} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">重启</button>
                <button onClick={() => action(selected.name, 'pull', '拉取')} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">拉取</button>
                <button onClick={() => action(selected.name, 'rebuild', '重建')} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">重建</button>
                <button onClick={save} className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-2 text-xs font-medium text-white"><Save className="h-3.5 w-3.5" />保存</button>
                <button onClick={() => setConfirm({ type: 'clear', name: selected.name, count: (selected.containers || []).length })} className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-2 text-xs font-medium text-white"><Trash2 className="h-3.5 w-3.5" />清除</button>
                <button onClick={() => setConfirm({ type: 'delete', name: selected.name, count: (selected.containers || []).length })} className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white"><Trash2 className="h-3.5 w-3.5" />删除</button>
              </div>
            </div>
            </div>

            <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
              <textarea value={content} onChange={e => setContent(e.target.value)} className="h-[58vh] min-h-[420px] w-full rounded-xl border border-slate-200 bg-slate-950 p-4 font-mono text-sm leading-6 text-emerald-100 outline-none dark:border-slate-700" />
              <div className="space-y-3">
                <Panel title="服务">
                  <div className="max-h-[30vh] space-y-2 overflow-auto pr-1">
                    {(selected.containers || []).length > 0 ? selected.containers.map(item => (
                      <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm dark:border-slate-800 dark:bg-slate-900">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate font-medium text-slate-900 dark:text-white">{item.name}</div>
                            <div className="mt-0.5 truncate text-xs text-slate-500">{item.service || 'service'} · {item.image}</div>
                          </div>
                          <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium', projectStatusMeta(item.state === 'running' ? 'running' : item.state === 'restarting' || item.state === 'dead' ? 'error' : 'stopped').className)}>
                            {item.state || 'unknown'}
                          </span>
                        </div>
                        {item.ports && <div className="mt-2 text-xs text-slate-500">{item.ports}</div>}
                        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-2 dark:border-slate-800">
                          <button onClick={() => openContainerLogs(item)} className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-[11px] font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"><Terminal className="h-3 w-3" />日志</button>
                          {inferContainerWebUrl(item) && <a href={inferContainerWebUrl(item)} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center gap-1 rounded-md border border-sky-200 px-2 text-[11px] font-medium text-sky-700 hover:bg-sky-50 dark:border-sky-900/60 dark:text-sky-300 dark:hover:bg-sky-950/30"><ExternalLink className="h-3 w-3" />Web</a>}
                          {inferContainerWebUrl(item) && <button onClick={() => addServiceQuickLink(item)} className="inline-flex h-7 items-center gap-1 rounded-md border border-teal-200 px-2 text-[11px] font-medium text-teal-700 hover:bg-teal-50 dark:border-teal-900/60 dark:text-teal-300 dark:hover:bg-teal-950/30"><Link className="h-3 w-3" />快捷</button>}
                          {isContainerRunning(item) ? (
                            <button onClick={() => runContainerAction(item, 'stop')} disabled={Boolean(containerBusy[item.id || item.name])} className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"><Square className="h-3 w-3" />停止</button>
                          ) : (
                            <button onClick={() => runContainerAction(item, 'start')} disabled={Boolean(containerBusy[item.id || item.name])} className="inline-flex h-7 items-center gap-1 rounded-md border border-emerald-200 px-2 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-900/60 dark:text-emerald-300 dark:hover:bg-emerald-950/30"><Play className="h-3 w-3" />启动</button>
                          )}
                          <button onClick={() => runContainerAction(item, 'restart')} disabled={Boolean(containerBusy[item.id || item.name])} className="inline-flex h-7 items-center gap-1 rounded-md border border-sky-200 px-2 text-[11px] font-medium text-sky-700 hover:bg-sky-50 disabled:opacity-50 dark:border-sky-900/60 dark:text-sky-300 dark:hover:bg-sky-950/30"><RotateCcw className="h-3 w-3" />重启</button>
                          {!isContainerRunning(item) && <button onClick={() => runContainerAction(item, 'delete')} disabled={Boolean(containerBusy[item.id || item.name])} className="inline-flex h-7 items-center gap-1 rounded-md border border-red-200 px-2 text-[11px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/30"><Trash2 className="h-3 w-3" />删除</button>}
                        </div>
                      </div>
                    )) : <div className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-slate-700">暂无关联容器</div>}
                  </div>
                </Panel>
                <TerminalPanel title={taskTitle ? `${taskTitle}日志` : '项目日志'} taskId={taskId} progress={taskProgress} text={taskText || '项目操作后会在这里显示日志。'} />
              </div>
            </div>
            {message && <div className="text-sm text-emerald-600 dark:text-emerald-300">{message}</div>}
          </div>
        ) : (
          <div className="flex h-96 items-center justify-center text-slate-500">选择项目查看 YAML</div>
        )}
      </div>

      {confirm && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-slate-950 dark:text-white">{confirm.type === 'clear' ? '清除项目容器' : '删除项目文件'}</div>
                <div className="mt-1 text-sm text-slate-500">项目：{confirm.name}</div>
                <div className="mt-1 text-xs text-slate-500">关联容器：{confirm.count}</div>
              </div>
              <button onClick={() => setConfirm(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300">
              {confirm.type === 'clear'
                ? '会停止并删除该项目关联的所有容器，保留 docker-compose.yaml。'
                : '只删除项目文件目录，不删除容器。'}
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setConfirm(null)} className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">取消</button>
              <button onClick={confirm.type === 'clear' ? clearProject : deleteProject} className={cn('flex-1 rounded-xl px-4 py-2.5 text-sm font-medium text-white', confirm.type === 'clear' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-red-600 hover:bg-red-700')}>
                确认{confirm.type === 'clear' ? '清除' : '删除'}
              </button>
            </div>
          </div>
        </div>
      )}
      {containerLog && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-900 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-100">{containerLog.title}</div>
                <div className="text-xs text-slate-400">容器日志</div>
              </div>
              <button onClick={() => setContainerLog(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100"><X className="h-4 w-4" /></button>
            </div>
            <pre className="max-h-[70vh] min-h-[360px] overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-sm leading-6 text-emerald-100">
              {containerLog.text || '暂无日志'}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

function NewDeploy({ onViewProject, onViewNamedProject }) {
  const [mode, setMode] = useState('form')
  const [rightPanel, setRightPanel] = useState('compose')
  const [projectName, setProjectName] = useState('')
  const [image, setImage] = useState('')
  const [containerName, setContainerName] = useState('')
  const [ports, setPorts] = useState('')
  const [volumes, setVolumes] = useState('')
  const [envs, setEnvs] = useState('')
  const [network, setNetwork] = useState('')
  const [restartPolicy, setRestartPolicy] = useState('unless-stopped')
  const [dockerRun, setDockerRun] = useState('')
  const [yaml, setYaml] = useState('')
  const [message, setMessage] = useState('')
  const [deploying, setDeploying] = useState(false)
  const [containers, setContainers] = useState([])
  const [containerSearch, setContainerSearch] = useState('')
  const [selectedContainerIds, setSelectedContainerIds] = useState([])
  const [loadingContainers, setLoadingContainers] = useState(false)
  const [error, setError] = useState('')
  const [baseDir, setBaseDir] = useState(defaultComposeBaseDir('app'))
  const [baseDirTouched, setBaseDirTouched] = useState(false)
  const [taskId, setTaskId] = useState('')
  const [taskProgress, setTaskProgress] = useState(null)
  const [deployedProjectName, setDeployedProjectName] = useState('')
  const [templateValues, setTemplateValues] = useState({})
  const [storeAppName, setStoreAppName] = useState('')
  const [networks, setNetworks] = useState([])
  const completedDeployTaskRef = useRef('')

  const emitDeployRefresh = (source = 'new-deploy') => {
    window.dispatchEvent(new CustomEvent('docker-copilot-global-refresh', {
      detail: { source, activeTab: '#containers/new', at: Date.now() },
    }))
  }

  const loadNetworks = async () => {
    try {
      const res = await networkAPI.getNetworks()
      setNetworks(res.data?.data || [])
    } catch {
      setNetworks([])
    }
  }

  const projectSaveName = projectName || containerName || 'app'
  const defaultBaseDir = useMemo(() => defaultComposeBaseDir(projectSaveName), [projectSaveName])
  const effectiveBaseDir = baseDir.trim() || defaultBaseDir

  useEffect(() => {
    if (!baseDirTouched) setBaseDir(defaultBaseDir)
  }, [baseDirTouched, defaultBaseDir])

  useEffect(() => {
    try {
      const raw = localStorage.getItem('docker_copilot_compose_draft')
      if (!raw) return
      const draft = JSON.parse(raw)
      if (!draft?.content) return
      setProjectName(draft.name || '')
      setContainerName(draft.name || '')
      setYaml(draft.content)
      setMode('yaml')
      setRightPanel('params')
      setStoreAppName(draft.appName || '')
      setMessage(draft.appName ? `已载入 ${draft.appName}` : '已载入 Compose')
      localStorage.removeItem('docker_copilot_compose_draft')
    } catch {
      localStorage.removeItem('docker_copilot_compose_draft')
    }
  }, [])

  useEffect(() => { loadNetworks() }, [])

  useEffect(() => {
    if (!taskId || rightPanel !== 'logs') return undefined
    let cancelled = false
    const tick = async () => {
      try {
        const res = await progressAPI.getProgress(taskId)
        const progress = res.data?.data
        if (!cancelled) setTaskProgress(progress)
        if (progress?.isDone) {
          setDeploying(false)
          setMessage(progress.detailMsg || progress.message || '部署完成')
          setRightPanel('logs')
          if (completedDeployTaskRef.current !== taskId) {
            completedDeployTaskRef.current = taskId
            emitDeployRefresh('new-deploy-complete')
          }
        }
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.msg || err.message || '读取部署进度失败')
      }
    }
    tick()
    const timer = window.setInterval(tick, 1200)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [taskId, rightPanel])

  const generatedYaml = useMemo(() => {
    if (mode === 'yaml' || mode === 'run' || mode === 'containers') return yaml
    const name = projectName || containerName || 'app'
    const lines = ['services:', `  ${name}:`, `    image: ${image || 'nginx:latest'}`, `    container_name: ${containerName || name}`]
    if (restartPolicy && restartPolicy !== 'no') lines.push(`    restart: ${restartPolicy}`)
    if (network.trim()) lines.push(`    network_mode: ${network.trim()}`)
    const addList = (title, value) => {
      const items = value.split(/\n+/).map(v => v.trim()).filter(Boolean)
      if (!items.length) return
      lines.push(`    ${title}:`)
      items.forEach(item => lines.push(`      - ${item}`))
    }
    addList('ports', ports)
    addList('volumes', volumes)
    addList('environment', envs)
    return lines.join('\n')
  }, [mode, yaml, projectName, containerName, image, ports, volumes, envs, network, restartPolicy])

  const templateVariables = useMemo(() => extractTemplateVariables(generatedYaml), [generatedYaml])
  const templateValueMap = useMemo(() => {
    const next = {}
    templateVariables.forEach(name => {
      next[name] = String(templateValues[name] ?? defaultTemplateValue(name, projectSaveName) ?? '')
    })
    return next
  }, [templateVariables, templateValues, projectSaveName])
  const unresolvedVariables = templateVariables.filter(name => !String(templateValueMap[name] || '').trim())
  const templatedYaml = useMemo(() => applyTemplateVariables(generatedYaml, templateValueMap, projectSaveName), [generatedYaml, templateValueMap, projectSaveName])
  const resolvedCompose = useMemo(() => resolveComposeRelativeVolumes(templatedYaml, effectiveBaseDir), [templatedYaml, effectiveBaseDir])
  const missingExternalNetworks = useMemo(() => {
    const available = new Set(networks.map(item => item.name || item.Name).filter(Boolean))
    return externalNetworkNames(resolvedCompose.content).filter(name => !available.has(name))
  }, [resolvedCompose.content, networks])

  const convertRun = async () => {
    if (!dockerRun.trim()) {
      setError('请先粘贴命令行')
      return
    }
    try {
      setError('')
      const res = await composeAPI.fromDockerRun(dockerRun)
      const content = res.data?.data?.content || ''
      if (!content.trim()) {
        setError('未生成 Compose 内容，请检查命令行')
        return
      }
      setYaml(content)
      setMode('run')
      setRightPanel('compose')
      setMessage('已转换为 Compose')
    } catch (err) {
      setError(err.response?.data?.msg || err.message || '命令行转换失败')
    }
  }

  const normalizeContainer = (item) => {
    const id = item?.id || item?.ID || item?.Id || ''
    const rawName = item?.name || item?.Name || item?.Names?.[0] || ''
    const name = String(rawName || id.slice(0, 12)).replace(/^\//, '')
    const image = item?.usingImage || item?.createImage || item?.Image || item?.image || ''
    const status = item?.status || item?.Status || item?.state || item?.State || ''
    return { id, name, image, status }
  }

  const visibleContainers = useMemo(() => {
    const keyword = containerSearch.trim().toLowerCase()
    const list = containers.map(normalizeContainer).filter(item => item.id)
    if (!keyword) return list
    return list.filter(item => [item.name, item.image, item.status, item.id].some(value => String(value || '').toLowerCase().includes(keyword)))
  }, [containers, containerSearch])

  const loadContainers = async () => {
    setLoadingContainers(true)
    try {
      const res = await containerAPI.getContainers()
      setContainers(res.data?.data || [])
      setMode('containers')
      setRightPanel('compose')
    } finally {
      setLoadingContainers(false)
    }
  }

  useEffect(() => {
    const onGlobalRefresh = () => {
      loadNetworks()
      if (mode === 'containers') loadContainers()
    }
    window.addEventListener('docker-copilot-global-refresh', onGlobalRefresh)
    return () => window.removeEventListener('docker-copilot-global-refresh', onGlobalRefresh)
  }, [mode])

  const toggleContainer = (id) => {
    setSelectedContainerIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id])
  }

  const loadFromContainers = async (ids = selectedContainerIds) => {
    try {
      setError('')
      const res = await composeAPI.fromContainers(ids)
      setYaml(res.data?.data?.content || '')
      const selectedNames = containers.map(normalizeContainer).filter(item => ids.includes(item.id)).map(item => item.name).filter(Boolean)
      setProjectName(selectedNames.length === 1 ? selectedNames[0] : 'container-export')
      setContainerName('')
      setMode('yaml')
      setRightPanel('compose')
      setMessage(ids.length ? `已从 ${ids.length} 个容器生成 Compose` : '已从全部容器生成 Compose')
    } catch (err) {
      setError(err.response?.data?.msg || err.message || '从容器生成 Compose 失败')
    }
  }

  const canSave = mode !== 'containers' && generatedYaml.trim() && (mode !== 'form' || image.trim()) && unresolvedVariables.length === 0

  const save = async () => {
    if (!canSave) {
      if (unresolvedVariables.length) setError(`请先填写模板参数：${unresolvedVariables.join(', ')}`)
      else setError(mode === 'form' ? '请至少填写镜像名称后再保存' : '请先生成或填写 docker-compose.yaml')
      return ''
    }
    const name = projectSaveName
    try {
      setError('')
      const res = await composeAPI.saveProject({ name, content: resolvedCompose.content })
      const savedName = res.data?.data?.name || name
      setMessage(`已保存：${savedName}`)
      if (mode === 'yaml' || mode === 'run') setYaml(resolvedCompose.content)
      emitDeployRefresh('new-deploy-save')
      return savedName
    } catch (err) {
      setError(err.response?.data?.msg || err.message || '保存失败')
      return ''
    }
  }

  const saveAndDeploy = async () => {
    try {
      setDeploying(true)
      setError('')
      const name = await save()
      if (!name) {
        setDeploying(false)
        return
      }
      const res = await composeAPI.runAction(name, 'up')
      const nextTaskId = res.data?.data?.taskID || ''
      if (!nextTaskId) throw new Error('未返回部署任务 ID')
      completedDeployTaskRef.current = ''
      setTaskId(nextTaskId)
      setTaskProgress(null)
      setDeployedProjectName(name)
      setRightPanel('logs')
      setMessage(`部署任务已提交：${nextTaskId}`)
    } catch (err) {
      setError(err.response?.data?.msg || err.message || '提交部署任务失败')
      setDeploying(false)
    }
  }

  const progressText = progressToText(taskProgress)
  const sourceItems = [
    { id: 'form', label: '可视化', icon: ListChecks },
    { id: 'run', label: '命令行', icon: Terminal },
    { id: 'yaml', label: 'Compose', icon: FileCode },
    { id: 'containers', label: '容器生成', icon: PackageOpen },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[190px_minmax(420px,0.95fr)_minmax(420px,1.05fr)]">
      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="grid gap-2">
          {sourceItems.map(item => {
            const Icon = item.icon
            return (
              <button key={item.id} onClick={() => {
                if (item.id === 'containers') {
                  loadContainers()
                  return
                }
                setMode(item.id)
                setRightPanel(item.id === 'run' ? 'compose' : rightPanel)
              }} className={cn('flex items-center gap-2 rounded-xl border px-3 py-3 text-left text-sm font-semibold transition', mode === item.id ? 'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900/70 dark:bg-teal-950/40 dark:text-teal-300' : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-white dark:border-slate-800 dark:bg-slate-950/30 dark:text-slate-300 dark:hover:bg-slate-800')}>
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            )
          })}
        </div>
      </section>

      <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {storeAppName && <div className="mb-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-300">来自商店：{storeAppName}</div>}
        {mode === 'containers' && (
          <ContainerPicker
            loading={loadingContainers}
            containers={visibleContainers}
            selectedIds={selectedContainerIds}
            search={containerSearch}
            setSearch={setContainerSearch}
            setSelectedIds={setSelectedContainerIds}
            toggle={toggleContainer}
            generateSelected={() => loadFromContainers(selectedContainerIds)}
            generateAll={() => loadFromContainers([])}
          />
        )}
        {mode === 'form' && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <DeployField label="项目名" hint="/data/compose/<project>">
                <input className="input" placeholder="nginx-stack" value={projectName} onChange={e => setProjectName(e.target.value)} />
              </DeployField>
              <DeployField label="容器名" hint="可留空">
                <input className="input" placeholder="nginx" value={containerName} onChange={e => setContainerName(e.target.value)} />
              </DeployField>
            </div>
            <DeployField label="镜像" hint="必填">
              <input className="input" placeholder="nginx:latest" value={image} onChange={e => setImage(e.target.value)} />
            </DeployField>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <DeployField label="网络">
                <input className="input" placeholder="bridge" value={network} onChange={e => setNetwork(e.target.value)} />
              </DeployField>
              <DeployField label="重启策略">
                <select className="input" value={restartPolicy} onChange={e => setRestartPolicy(e.target.value)}>
                  <option value="unless-stopped">unless-stopped</option>
                  <option value="always">always</option>
                  <option value="on-failure">on-failure</option>
                  <option value="no">no</option>
                </select>
              </DeployField>
            </div>
            <DeployField label="端口映射" hint="每行一个">
              <textarea className="input min-h-20" placeholder="8080:80" value={ports} onChange={e => setPorts(e.target.value)} />
            </DeployField>
            <DeployField label="卷挂载" hint="./data:/config">
              <textarea className="input min-h-20" placeholder="./data:/config" value={volumes} onChange={e => setVolumes(e.target.value)} />
            </DeployField>
            <DeployField label="环境变量" hint="每行一个">
              <textarea className="input min-h-20" placeholder="TZ=Asia/Shanghai" value={envs} onChange={e => setEnvs(e.target.value)} />
            </DeployField>
          </div>
        )}
        {mode === 'run' && (
          <div className="space-y-3">
            <DeployField label="命令行" hint="docker run">
              <textarea className="input min-h-40 font-mono" placeholder="docker run -d --name nginx -p 8080:80 nginx:latest" value={dockerRun} onChange={e => setDockerRun(e.target.value)} />
            </DeployField>
            <button onClick={convertRun} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-slate-900"><Terminal className="h-4 w-4" />转换为 Compose</button>
          </div>
        )}
        {mode === 'yaml' && (
          <DeployField label="docker-compose.yaml" hint="直接编辑">
            <textarea className="input min-h-[460px] font-mono" placeholder="services:\n  app:\n    image: nginx:latest" value={yaml} onChange={e => setYaml(e.target.value)} />
          </DeployField>
        )}
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button onClick={save} disabled={!canSave} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">保存</button>
          <button onClick={saveAndDeploy} disabled={deploying || !canSave} className="rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60">{deploying ? '正在提交...' : '保存并部署'}</button>
        </div>
        {error && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">{error}</div>}
        {message && <div className="mt-3 text-sm text-emerald-600 dark:text-emerald-300">{message}</div>}
      </section>

      <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-slate-100 p-1 dark:bg-slate-950/50">
          {[
            ['compose', 'Compose'],
            ['params', `参数${templateVariables.length ? `(${templateVariables.length})` : ''}`],
            ['logs', '日志'],
          ].map(([id, label]) => (
            <button key={id} onClick={() => setRightPanel(id)} className={cn('flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition', rightPanel === id ? 'bg-white text-slate-950 shadow-sm dark:bg-slate-800 dark:text-white' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200')}>
              {label}
            </button>
          ))}
        </div>
        {rightPanel === 'compose' && (
          <ComposePreviewPanel
            content={resolvedCompose.content}
            baseDir={baseDir}
            defaultBaseDir={defaultBaseDir}
            setBaseDir={setBaseDir}
            resetBaseDir={() => {
              setBaseDirTouched(false)
              setBaseDir(defaultBaseDir)
            }}
            touchBaseDir={() => setBaseDirTouched(true)}
            mappings={resolvedCompose.mappings}
            missingNetworks={missingExternalNetworks}
          />
        )}
        {rightPanel === 'params' && (
          <TemplateParamsPanel
            variables={templateVariables}
            values={templateValueMap}
            rawValues={templateValues}
            projectName={projectSaveName}
            setValues={setTemplateValues}
            missingNetworks={missingExternalNetworks}
          />
        )}
        {rightPanel === 'logs' && (
          <TerminalPanel
            title="部署日志"
            taskId={taskId}
            progress={taskProgress}
            text={progressText || '点击“保存并部署”后显示部署日志。'}
            actions={taskId ? (
              <div className="flex gap-2">
                <button onClick={() => setRightPanel('compose')} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800">返回编辑</button>
                <button onClick={() => (deployedProjectName ? onViewNamedProject?.(deployedProjectName) : onViewProject?.())} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800">查看项目</button>
              </div>
            ) : null}
          />
        )}
      </section>
    </div>
  )
}

function ContainerPicker({ loading, containers, selectedIds, search, setSearch, setSelectedIds, toggle, generateSelected, generateAll }) {
  return (
    <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-slate-900 dark:text-white">从容器生成 Compose</div>
        <button onClick={() => setSelectedIds(containers.map(item => item.id))} disabled={containers.length === 0} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-white disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
          全选当前
        </button>
      </div>
      <input className="input mt-3" placeholder="搜索容器" value={search} onChange={e => setSearch(e.target.value)} />
      <div className="mt-3 max-h-56 space-y-2 overflow-auto pr-1">
        {containers.map(item => (
          <label key={item.id} className={cn('flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition', selectedIds.includes(item.id) ? 'border-sky-300 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/30' : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800')}>
            <input type="checkbox" className="mt-1 h-4 w-4 rounded border-slate-300 text-sky-600" checked={selectedIds.includes(item.id)} onChange={() => toggle(item.id)} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900 dark:text-white">{item.name}</span>
              <span className="mt-1 block truncate text-xs text-slate-500 dark:text-slate-400">{item.image || '未知镜像'} · {item.status || item.id.slice(0, 12)}</span>
            </span>
          </label>
        ))}
        {!loading && containers.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-slate-700">没有匹配容器</div>}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button onClick={generateSelected} disabled={selectedIds.length === 0} className="rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">生成选中{selectedIds.length ? ` (${selectedIds.length})` : ''}</button>
        <button onClick={generateAll} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-white dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">生成全部</button>
      </div>
    </div>
  )
}

function ComposePreviewPanel({ content, baseDir, defaultBaseDir, setBaseDir, resetBaseDir, touchBaseDir, mappings, missingNetworks }) {
  return (
    <div className="flex min-h-[560px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 p-3 shadow-sm dark:border-slate-800">
      <div className="mb-3 space-y-2">
        <div className="flex items-center justify-between gap-3 text-xs font-medium text-slate-400">
          <span>Compose 预览</span>
          <span>{content.split('\n').length} 行</span>
        </div>
        <label className="block">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-300">部署基础目录</span>
            <button type="button" onClick={resetBaseDir} className="text-xs text-slate-500 hover:text-slate-300">默认</button>
          </div>
          <input className="h-9 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 outline-none focus:border-teal-500" value={baseDir || defaultBaseDir} onChange={e => {
            touchBaseDir()
            setBaseDir(e.target.value)
          }} />
        </label>
        {mappings.length > 0 && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            <div className="font-medium">相对路径将保存为绝对路径</div>
            <div className="mt-1 space-y-0.5">
              {mappings.slice(0, 4).map((item, index) => <div key={`${item.from}-${index}`} className="truncate">{item.from} {'->'} {item.to}</div>)}
              {mappings.length > 4 && <div>还有 {mappings.length - 4} 条</div>}
            </div>
          </div>
        )}
        {missingNetworks.length > 0 && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            缺少外部网络：{missingNetworks.join(', ')}。部署时会自动创建 bridge 网络。
          </div>
        )}
      </div>
      <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-900/70 p-3 font-mono text-sm leading-6 text-emerald-100">{content}</pre>
    </div>
  )
}

function TemplateParamsPanel({ variables, values, rawValues, projectName, setValues, missingNetworks }) {
  if (variables.length === 0 && missingNetworks.length === 0) {
    return <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-dashed border-slate-300 text-sm text-slate-500 dark:border-slate-700">当前模板没有参数。</div>
  }
  return (
    <div className="space-y-3">
      {variables.map(name => (
        <DeployField key={name} label={name} hint={isPortVariable(name) ? '必填端口' : name === 'CONTAINER_NAME' ? '默认项目名' : '必填'}>
          <input className="input" value={values[name] || ''} placeholder={name === 'CONTAINER_NAME' ? sanitizeComposeProjectName(projectName) : isPortVariable(name) ? '例如 8080' : name} onChange={e => setValues({ ...rawValues, [name]: e.target.value })} />
        </DeployField>
      ))}
      {missingNetworks.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
          缺少外部网络：{missingNetworks.join(', ')}。部署时会自动创建 bridge 网络。
        </div>
      )}
    </div>
  )
}

function TerminalPanel({ title, taskId, progress, text, actions }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 text-emerald-100">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/80 px-3 py-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-100">{title}</div>
          {taskId && <div className="truncate text-xs text-slate-400">taskID · {taskId}</div>}
        </div>
        <div className="flex items-center gap-3">
          {progress && <span className="text-xs text-slate-400">{Math.max(0, Math.min(100, Number(progress?.percentage) || 0))}%</span>}
          {actions}
        </div>
      </div>
      <pre className="max-h-[48vh] min-h-[260px] overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-sm leading-6">{text}</pre>
    </div>
  )
}

function Panel({ title, children }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
      <div className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">{title}</div>
      {children}
    </div>
  )
}

function DeployField({ label, hint, children }) {
  return (
    <label className="block">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{label}</span>
        {hint && <span className="truncate text-xs text-slate-500 dark:text-slate-400">{hint}</span>}
      </div>
      {children}
    </label>
  )
}
