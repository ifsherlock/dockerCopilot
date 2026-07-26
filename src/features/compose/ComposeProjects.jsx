import React, { useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Circle, CloudDownload, ExternalLink, FolderInput, Link, Play, RefreshCw, RotateCcw, Save, Square, Terminal, Trash2, X } from 'lucide-react'
import { composeAPI, containerAPI, progressAPI } from '../../api/client.js'
import { cn } from '../../utils/cn.js'
import { addProjectContainerQuickLink, defaultComposeBaseDir, inferContainerWebUrl, isContainerRunning, progressToText, resolveComposeRelativeVolumes } from './composeUtils.js'
import { Panel, TerminalPanel } from './panels.jsx'

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


export function ComposeProjects({ focusProject = '' }) {
  const [projects, setProjects] = useState([])
  const [externalProjects, setExternalProjects] = useState([])
  const [projectSearch, setProjectSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [selectedExternal, setSelectedExternal] = useState(null)
  const [externalContent, setExternalContent] = useState('')
  const [importing, setImporting] = useState(false)
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
    try {
      const external = await composeAPI.getExternalProjects()
      setExternalProjects(external.data?.data || [])
    } catch {
      setExternalProjects([])
    }
  }

  const open = async (name) => {
    const res = await composeAPI.getProject(name)
    const project = res.data?.data
    setSelected(project)
    setSelectedExternal(null)
    setContent(project?.content || '')
  }

  const openExternal = (project) => {
    setSelected(null)
    setSelectedExternal(project)
    setExternalContent(project?.content || '')
    setContent('')
  }

  const importExternal = async () => {
    if (!selectedExternal?.name || !externalContent.trim()) return
    setImporting(true)
    try {
      // 相对卷路径按原 working_dir 改写为绝对路径，避免导入后目录错位。
      const baseDir = selectedExternal.workingDir || defaultComposeBaseDir(selectedExternal.name)
      const resolved = resolveComposeRelativeVolumes(externalContent, baseDir)
      const payload = { name: selectedExternal.name, content: resolved.content }
      if (selectedExternal.envFileContent) payload.envFileContent = selectedExternal.envFileContent
      await composeAPI.saveProject(payload)
      setMessage(`已导入 ${selectedExternal.name}，现有容器将按项目名自动关联`)
      const importedName = selectedExternal.name
      setSelectedExternal(null)
      await load()
      await open(importedName)
      emitGlobalRefresh('compose-import-external')
    } catch (err) {
      setMessage(err.response?.data?.msg || err.message || '导入失败')
    } finally {
      setImporting(false)
    }
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
  const searchKeyword = projectSearch.trim().toLowerCase()
  const matchProject = (project) => !searchKeyword || String(project.name || '').toLowerCase().includes(searchKeyword)
  const visibleProjects = projects.filter(matchProject)
  const visibleExternalProjects = externalProjects.filter(matchProject)

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-slate-950 dark:text-white">项目</h3>
          <button onClick={load} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800" title="刷新项目">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
        <input
          className="input mb-3"
          placeholder="搜索项目名"
          value={projectSearch}
          onChange={e => setProjectSearch(e.target.value)}
        />
        <div className="max-h-[68vh] space-y-2 overflow-y-auto pr-1">
          {(visibleProjects.length > 0 || visibleExternalProjects.length > 0) && (
            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">托管项目 · {visibleProjects.length}</div>
          )}
          {visibleProjects.map(project => {
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
          {visibleProjects.length === 0 && (
            <div className="text-sm text-slate-500">{projectSearch.trim() ? '没有匹配的托管项目' : '暂无托管项目，在“新建”中保存。'}</div>
          )}

          {visibleExternalProjects.length > 0 && (
            <div className="pt-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">外部项目 · {visibleExternalProjects.length}</div>
          )}
          {visibleExternalProjects.map(project => {
            const meta = projectStatusMeta(project.status)
            return (
              <button key={`external-${project.name}`} onClick={() => openExternal(project)} className={cn('w-full rounded-xl border border-dashed p-3 text-left transition', selectedExternal?.name === project.name ? 'border-sky-400 bg-sky-50 dark:border-sky-700 dark:bg-sky-950/30' : 'border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="truncate font-medium text-slate-900 dark:text-white">{project.name}</div>
                      <span className="shrink-0 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-300">外部</span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {(project.containers || []).length} 容器 · {project.source === 'file' ? 'compose 可读' : '文件不可读'}
                    </div>
                  </div>
                  <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium', meta.className)}>{meta.label}</span>
                </div>
              </button>
            )
          })}
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
                <button onClick={() => setConfirm({ type: 'redeploy', name: selected.name, containers: selected.containers || [] })} className="inline-flex items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-medium text-teal-700 hover:bg-teal-100 dark:border-teal-900/60 dark:bg-teal-950/30 dark:text-teal-300 dark:hover:bg-teal-950/50"><CloudDownload className="h-3.5 w-3.5" />更新重建</button>
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
        ) : selectedExternal ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-950 dark:text-white">{selectedExternal.name}</h3>
                    <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-300">外部项目</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {(selectedExternal.containers || []).length} 容器 · 运行 {selectedExternal.runningCount || 0}
                    {selectedExternal.workingDir ? ` · 工作目录 ${selectedExternal.workingDir}` : ''}
                  </p>
                </div>
                <button onClick={importExternal} disabled={importing || !externalContent.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"><FolderInput className="h-3.5 w-3.5" />{importing ? '导入中...' : '导入为托管项目'}</button>
              </div>
            </div>

            {selectedExternal.source === 'file' ? (
              <div className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-700 dark:border-teal-900/60 dark:bg-teal-950/30 dark:text-teal-300">
                已读取宿主机原文件：{selectedExternal.sourceDetail}
                {selectedExternal.envFileContent ? '（同目录 .env 将一并导入）' : ''}，可编辑后导入。
              </div>
            ) : (
              <div className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
                <div>
                  原 compose 文件在宿主机的 {selectedExternal.sourceDetail || selectedExternal.configFiles?.[0] || selectedExternal.workingDir || '未知路径'}，
                  该路径没有挂载进 DockerCopilot 容器，容器里读不到这个文件（容器只能看到挂载进来的目录）。
                </div>
                <div>
                  以下内容是按容器当前实际配置反向生成的，与原文件运行效果一致（不含原文件的注释与变量写法），可编辑核对后导入。
                </div>
                <div className="text-xs opacity-80">
                  想直接读取原文件：给 DockerCopilot 容器追加挂载该目录（如 -v {selectedExternal.workingDir || '/宿主机compose目录'}:{selectedExternal.workingDir || '/宿主机compose目录'}:ro），任何覆盖该路径的挂载都会被自动识别。
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
              <textarea value={externalContent} onChange={e => setExternalContent(e.target.value)} placeholder="未获取到 Compose 内容" className="h-[52vh] min-h-[380px] w-full rounded-xl border border-slate-200 bg-slate-950 p-4 font-mono text-sm leading-6 text-emerald-100 outline-none dark:border-slate-700" />
              <Panel title="关联容器">
                <div className="max-h-[48vh] space-y-2 overflow-auto pr-1">
                  {(selectedExternal.containers || []).map(item => (
                    <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm dark:border-slate-800 dark:bg-slate-900">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium text-slate-900 dark:text-white">{item.name}</span>
                            {item.update && <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">有新镜像</span>}
                          </div>
                          <div className="mt-0.5 truncate text-xs text-slate-500">{item.service || 'service'} · {item.image}</div>
                        </div>
                        <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium', projectStatusMeta(item.state === 'running' ? 'running' : item.state === 'restarting' || item.state === 'dead' ? 'error' : 'stopped').className)}>
                          {item.state || 'unknown'}
                        </span>
                      </div>
                      {item.ports && <div className="mt-2 text-xs text-slate-500">{item.ports}</div>}
                    </div>
                  ))}
                  {(selectedExternal.containers || []).length === 0 && <div className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-slate-700">暂无关联容器</div>}
                </div>
              </Panel>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950/40">
              导入后项目文件保存到 /data/compose/{selectedExternal.name}/，正在运行的容器不受影响；之后的启动/重建操作会按项目名平滑接管现有容器。相对卷路径将按原工作目录改写为绝对路径。
            </div>
            {message && <div className="text-sm text-emerald-600 dark:text-emerald-300">{message}</div>}
          </div>
        ) : (
          <div className="flex h-96 items-center justify-center text-slate-500">选择项目查看 YAML</div>
        )}
      </div>

      {confirm && confirm.type === 'redeploy' && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-lg font-semibold text-slate-950 dark:text-white"><CloudDownload className="h-5 w-5 text-teal-600 dark:text-teal-400" />拉取并重建 {confirm.name}</div>
                <div className="mt-1 text-sm text-slate-500">将拉取最新镜像并强制重建以下 {(confirm.containers || []).length} 个容器，挂载卷中的数据不受影响。</div>
              </div>
              <button onClick={() => setConfirm(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-3 max-h-48 space-y-1.5 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
              {(confirm.containers || []).map(item => (
                <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate text-slate-700 dark:text-slate-200">{item.name}</span>
                  {item.update
                    ? <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">有新镜像</span>
                    : <span className="shrink-0 text-[11px] text-slate-400">未检出更新</span>}
                </div>
              ))}
              {(confirm.containers || []).length === 0 && <div className="text-sm text-slate-500">当前无关联容器，将按 Compose 内容全新创建。</div>}
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setConfirm(null)} className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">取消</button>
              <button onClick={() => { setConfirm(null); action(confirm.name, 'redeploy', '更新重建') }} className="flex-1 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700">开始重建</button>
            </div>
          </div>
        </div>
      )}
      {confirm && confirm.type !== 'redeploy' && (
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
