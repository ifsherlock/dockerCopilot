import React from 'react'
import { cn } from '../../utils/cn.js'
import { isPortVariable, sanitizeComposeProjectName } from './composeUtils.js'

export function ExternalProjectPicker({ loading, projects, onPick, onRefresh }) {
  return (
    <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-900 dark:text-white">导入外部 Compose 项目</div>
          <div className="mt-0.5 text-xs text-slate-500">在宿主机上用 compose 创建、未托管到面板的项目</div>
        </div>
        <button onClick={onRefresh} disabled={loading} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-white disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
          {loading ? '扫描中...' : '重新扫描'}
        </button>
      </div>
      <div className="mt-3 max-h-72 space-y-2 overflow-auto pr-1">
        {projects.map(project => (
          <button key={project.name} onClick={() => onPick(project)} className="w-full rounded-xl border border-dashed border-slate-300 bg-white p-3 text-left transition hover:border-sky-300 hover:bg-sky-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-sky-800 dark:hover:bg-sky-950/30">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-slate-900 dark:text-white">{project.name}</span>
                  <span className="shrink-0 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-300">外部</span>
                </div>
                <div className="mt-1 truncate text-xs text-slate-500">
                  {(project.containers || []).length} 容器 · 运行 {project.runningCount || 0}
                  {project.workingDir ? ` · ${project.workingDir}` : ''}
                </div>
              </div>
              <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium',
                project.source === 'file'
                  ? 'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900/60 dark:bg-teal-950/30 dark:text-teal-300'
                  : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300')}>
                {project.source === 'file' ? 'compose 文件可读' : '由容器反向生成'}
              </span>
            </div>
          </button>
        ))}
        {!loading && projects.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-slate-700">
            未发现外部 Compose 项目（面板托管的项目不会出现在这里）
          </div>
        )}
      </div>
    </div>
  )
}

export function ContainerPicker({ loading, containers, selectedIds, search, setSearch, setSelectedIds, toggle, generateSelected, generateAll }) {
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

export function ComposePreviewPanel({ content, baseDir, defaultBaseDir, setBaseDir, resetBaseDir, touchBaseDir, mappings, missingNetworks }) {
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

export function TemplateParamsPanel({ variables, values, rawValues, projectName, setValues, missingNetworks }) {
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

export function TerminalPanel({ title, taskId, progress, text, actions }) {
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

export function Panel({ title, children }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
      <div className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">{title}</div>
      {children}
    </div>
  )
}

export function DeployField({ label, hint, children }) {
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
