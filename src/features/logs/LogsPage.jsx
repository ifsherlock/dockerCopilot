import React, { lazy, Suspense, useState } from 'react'

const ContainerLogsPanel = lazy(() => import('./ContainerLogsPanel.jsx').then(module => ({ default: module.ContainerLogsPanel })))
const ServiceLogsPanel = lazy(() => import('./SystemLogPanels.jsx').then(module => ({ default: module.ServiceLogsPanel })))
const OperationLogsPanel = lazy(() => import('./SystemLogPanels.jsx').then(module => ({ default: module.OperationLogsPanel })))
const TaskLogsPanel = lazy(() => import('./SystemLogPanels.jsx').then(module => ({ default: module.TaskLogsPanel })))

const logTabs = [
  { id: 'container', label: '容器日志' },
  { id: 'service', label: '服务日志' },
  { id: 'operation', label: '操作日志' },
  { id: 'task', label: '任务日志' },
]

export function LogsPage() {
  const [active, setActive] = useState('container')
  const fallback = (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
      正在加载日志面板...
    </div>
  )

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
      <Suspense fallback={fallback}>
        {active === 'container' && <ContainerLogsPanel />}
        {active === 'service' && <ServiceLogsPanel />}
        {active === 'operation' && <OperationLogsPanel />}
        {active === 'task' && <TaskLogsPanel />}
      </Suspense>
    </div>
  )
}

export default LogsPage
