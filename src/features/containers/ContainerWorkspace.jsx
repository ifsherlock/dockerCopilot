import React, { Suspense, lazy, useEffect, useState } from 'react'

const ContainersListView = lazy(() => import('./ContainersListView.jsx'))
const ComposeProjects = lazy(() => import('../compose/ComposeProjects.jsx').then(module => ({ default: module.ComposeProjects })))
const NewDeploy = lazy(() => import('../compose/NewDeploy.jsx').then(module => ({ default: module.NewDeploy })))

function WorkspaceLoading() {
  return (
    <div className="flex min-h-[320px] items-center justify-center text-sm text-slate-500 dark:text-slate-400">
      正在加载...
    </div>
  )
}

export function ContainerWorkspace({ subTab = 'list', onSubTabChange }) {
  const nextTab = ['list', 'compose', 'new'].includes(subTab) ? subTab : 'list'
  const [active, setActive] = useState(nextTab)
  const [focusProject, setFocusProject] = useState('')

  useEffect(() => setActive(nextTab), [nextTab])

  return (
    <div className="space-y-4">
      <Suspense fallback={<WorkspaceLoading />}>
        {active === 'list' && <ContainersListView />}
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
      </Suspense>
    </div>
  )
}
