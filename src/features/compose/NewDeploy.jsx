import React, { useEffect, useMemo, useRef, useState } from 'react'
import { FileCode, FolderInput, ListChecks, PackageOpen, Terminal } from 'lucide-react'
import { composeAPI, containerAPI, networkAPI, progressAPI } from '../../api/client.js'
import { cn } from '../../utils/cn.js'
import { applyTemplateVariables, defaultComposeBaseDir, defaultTemplateValue, externalNetworkNames, extractTemplateVariables, isPortVariable, progressToText, resolveComposeRelativeVolumes, sanitizeComposeProjectName } from './composeUtils.js'
import { ComposePreviewPanel, ContainerPicker, DeployField, ExternalProjectPicker, TemplateParamsPanel, TerminalPanel } from './panels.jsx'

export function NewDeploy({ onViewProject, onViewNamedProject }) {
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
  const [externalProjects, setExternalProjects] = useState([])
  const [loadingExternal, setLoadingExternal] = useState(false)
  const [externalEnvContent, setExternalEnvContent] = useState('')
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
    if (mode === 'yaml' || mode === 'run' || mode === 'containers' || mode === 'external') return yaml
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

  const loadExternalProjects = async () => {
    setLoadingExternal(true)
    try {
      const res = await composeAPI.getExternalProjects()
      setExternalProjects(res.data?.data || [])
      setMode('external')
      setRightPanel('compose')
    } catch (err) {
      setError(err.response?.data?.msg || err.message || '扫描外部项目失败')
    } finally {
      setLoadingExternal(false)
    }
  }

  const parseEnvFile = (raw) => {
    const values = {}
    String(raw || '').split('\n').forEach(line => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) return
      const eq = trimmed.indexOf('=')
      if (eq <= 0) return
      const key = trimmed.slice(0, eq).trim()
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return
      let value = trimmed.slice(eq + 1).trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      values[key] = value
    })
    return values
  }

  const pickExternalProject = (project) => {
    if (!project?.content) {
      setError('该项目没有可用的 Compose 内容')
      return
    }
    setYaml(project.content)
    setProjectName(project.name || '')
    setContainerName('')
    setExternalEnvContent(project.envFileContent || '')
    // .env 中的值预填为模板参数，避免用户被要求重填 .env 里已有的变量。
    setTemplateValues(parseEnvFile(project.envFileContent))
    if (project.workingDir) {
      setBaseDir(project.workingDir)
      setBaseDirTouched(true)
    }
    setMode('yaml')
    setRightPanel('compose')
    setError('')
    setMessage(project.source === 'file'
      ? `已载入外部项目 ${project.name}（读取自 ${project.sourceDetail || '宿主机文件'}）`
      : `已载入外部项目 ${project.name}（compose 文件不可读，内容由容器配置反向生成）`)
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
      setExternalEnvContent('')
      setMode('yaml')
      setRightPanel('compose')
      setMessage(ids.length ? `已从 ${ids.length} 个容器生成 Compose` : '已从全部容器生成 Compose')
    } catch (err) {
      setError(err.response?.data?.msg || err.message || '从容器生成 Compose 失败')
    }
  }

  const canSave = mode !== 'containers' && mode !== 'external' && generatedYaml.trim() && (mode !== 'form' || image.trim()) && unresolvedVariables.length === 0

  const save = async () => {
    if (!canSave) {
      if (unresolvedVariables.length) setError(`请先填写模板参数：${unresolvedVariables.join(', ')}`)
      else setError(mode === 'form' ? '请至少填写镜像名称后再保存' : '请先生成或填写 docker-compose.yaml')
      return ''
    }
    const name = projectSaveName
    try {
      setError('')
      const payload = { name, content: resolvedCompose.content }
      if (externalEnvContent.trim()) payload.envFileContent = externalEnvContent
      const res = await composeAPI.saveProject(payload)
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
    { id: 'external', label: '外部项目', icon: FolderInput },
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
                if (item.id === 'external') {
                  loadExternalProjects()
                  return
                }
                if (item.id === 'form' || item.id === 'run' || item.id === 'yaml') setExternalEnvContent('')
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
        {mode === 'external' && (
          <ExternalProjectPicker
            loading={loadingExternal}
            projects={externalProjects}
            onPick={pickExternalProject}
            onRefresh={loadExternalProjects}
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
        {externalEnvContent.trim() && (
          <div className="mt-3 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs text-teal-700 dark:border-teal-900/60 dark:bg-teal-950/30 dark:text-teal-300">
            已附带外部项目的 .env（保存时写入项目目录，参数已按 .env 预填）
          </div>
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
