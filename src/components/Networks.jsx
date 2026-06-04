import React, { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Cable, Plus, Router, Trash2 } from 'lucide-react'
import { containerAPI, networkAPI } from '../api/client.js'
import { cn } from '../utils/cn.js'

export function Networks() {
  const [networks, setNetworks] = useState([])
  const [containers, setContainers] = useState([])
  const [filter, setFilter] = useState('all')
  const [bridgeStatus, setBridgeStatus] = useState(null)
  const [message, setMessage] = useState('')
  const [form, setForm] = useState({ name: '', driver: 'bridge', parent: '', subnet: '', gateway: '', ipRange: '' })
  const [ipForm, setIpForm] = useState({ networkId: '', containerID: '', ipv4Address: '' })
  const [replaceForm, setReplaceForm] = useState({ oldId: '', name: '', parent: '', subnet: '', gateway: '', ipRange: '', migrate: true, deleteOld: false })
  const [replaceResult, setReplaceResult] = useState(null)
  const [panel, setPanel] = useState('')
  const [macvlanMode, setMacvlanMode] = useState('create')

  const load = async () => {
    const [netRes, bridgeRes, containerRes] = await Promise.all([
      networkAPI.getNetworks(),
      networkAPI.getMacvlanBridgeStatus(),
      containerAPI.getContainers(),
    ])
    setNetworks(netRes.data?.data || [])
    setBridgeStatus(bridgeRes.data?.data || null)
    setContainers(containerRes.data?.data || [])
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    const onGlobalRefresh = () => load()
    window.addEventListener('docker-copilot-global-refresh', onGlobalRefresh)
    return () => window.removeEventListener('docker-copilot-global-refresh', onGlobalRefresh)
  }, [])

  const filtered = useMemo(() => networks.filter(item => {
    if (filter === 'all') return true
    if (filter === 'unused') return !item.builtin && item.containers === 0
    if (filter === 'custom') return !item.builtin
    return item.driver === filter
  }), [networks, filter])

  const create = async () => {
    const payload = { ...form }
    const api = form.driver === 'macvlan' ? networkAPI.createMacvlan : networkAPI.createNetwork
    const res = await api(payload)
    setMessage(res.data?.msg || '网络已创建')
    setForm({ name: '', driver: 'bridge', parent: '', subnet: '', gateway: '', ipRange: '' })
    await load()
  }

  const remove = async (id) => {
    await networkAPI.deleteNetwork(id)
    await load()
  }

  const setContainerIP = async () => {
    await networkAPI.setContainerIP(ipForm.networkId, { containerID: ipForm.containerID, ipv4Address: ipForm.ipv4Address, force: true })
    setMessage('容器 IP 已更新')
    setIpForm({ networkId: '', containerID: '', ipv4Address: '' })
    await load()
  }

  const selectedReplaceNetwork = networks.find(item => item.id === replaceForm.oldId)

  const replaceMacvlan = async () => {
    if (!replaceForm.oldId) {
      setMessage('请选择旧 macvlan 网络')
      return
    }
    if (!replaceForm.name.trim()) {
      setMessage('请填写新 macvlan 网络名称')
      return
    }
    if (replaceForm.deleteOld && !replaceForm.migrate) {
      setMessage('删除旧网络前必须迁移容器')
      return
    }
    const ok = window.confirm('macvlan 不能原地修改。系统会创建新网络，并按确认项迁移容器。继续吗？')
    if (!ok) return
    const res = await networkAPI.replaceMacvlan(replaceForm.oldId, {
      name: replaceForm.name,
      driver: 'macvlan',
      parent: replaceForm.parent,
      subnet: replaceForm.subnet,
      gateway: replaceForm.gateway,
      ipRange: replaceForm.ipRange,
      migrate: replaceForm.migrate,
      deleteOld: replaceForm.deleteOld,
    })
    const data = res.data?.data
    setReplaceResult(data || null)
    setMessage(res.data?.code === 200 ? 'macvlan 替换流程已完成' : (res.data?.msg || 'macvlan 替换失败'))
    await load()
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            {['all', 'bridge', 'macvlan', 'custom', 'unused'].map(item => (
              <button
                key={item}
                onClick={() => setFilter(item)}
                className={cn(
                  'rounded-xl px-3 py-2 text-sm font-medium',
                  filter === item
                    ? 'bg-teal-50 text-teal-700 ring-1 ring-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:ring-teal-900/70'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                )}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => { setForm(prev => ({ ...prev, driver: 'bridge' })); setPanel('create') }} className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700"><Plus className="h-4 w-4" />bridge</button>
            <button onClick={() => { setForm(prev => ({ ...prev, driver: 'macvlan' })); setMacvlanMode('create'); setPanel('macvlan') }} className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700"><Router className="h-4 w-4" />macvlan</button>
            <button onClick={() => setPanel('ip')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"><Cable className="h-4 w-4" />容器 IP</button>
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300">
          宿主机桥接状态：{bridgeStatus?.message || '等待检测'}
          {(bridgeStatus?.commands || []).length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-semibold text-slate-500">查看命令</summary>
              <pre className="mt-2 overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-emerald-100">{(bridgeStatus?.commands || []).join('\n')}</pre>
            </details>
          )}
        </div>
      </section>

      {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">{message}</div>}

      {panel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm" onClick={() => setPanel('')}>
          <div className="max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-900" onClick={e => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="font-semibold text-slate-950 dark:text-white">{panel === 'create' ? `创建 ${form.driver}` : panel === 'macvlan' ? 'macvlan' : '调整容器 IP'}</h3>
              <button onClick={() => setPanel('')} className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">关闭</button>
            </div>
            {panel === 'create' && <CreatePanel form={form} setForm={setForm} create={create} close={() => setPanel('')} />}
            {panel === 'macvlan' && (
              <MacvlanPanel
                mode={macvlanMode}
                setMode={setMacvlanMode}
                form={form}
                setForm={setForm}
                create={create}
                networks={networks}
                replaceForm={replaceForm}
                setReplaceForm={setReplaceForm}
                selectedReplaceNetwork={selectedReplaceNetwork}
                replaceMacvlan={replaceMacvlan}
                replaceResult={replaceResult}
                close={() => setPanel('')}
              />
            )}
            {panel === 'ip' && <IPPanel networks={networks} containers={containers} ipForm={ipForm} setIpForm={setIpForm} setContainerIP={setContainerIP} close={() => setPanel('')} />}
          </div>
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {filtered.map(item => (
          <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Cable className="h-4 w-4 text-sky-500" />
                  <h3 className="truncate font-semibold text-slate-950 dark:text-white">{item.name}</h3>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">{item.driver}</span>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-1 text-xs text-slate-500">
                  <span>ID: {String(item.id).slice(0, 12)}</span>
                  <span>容器: {item.containers || 0}</span>
                  <span>Subnet: {item.subnet || '-'}</span>
                  <span>Gateway: {item.gateway || '-'}</span>
                </div>
                {item.containerNames?.length > 0 && <div className="mt-2 truncate text-xs text-slate-500">关联: {item.containerNames.join(', ')}</div>}
              </div>
              {!item.builtin && <button onClick={() => remove(item.id)} className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/30"><Trash2 className="h-4 w-4" />删除</button>}
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}

function CreatePanel({ form, setForm, create, close }) {
  return (
    <div className="space-y-3">
      <input className="input" placeholder="网络名称" value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} />
      <select className="input" value={form.driver} onChange={e => setForm(prev => ({ ...prev, driver: e.target.value }))}>
        <option value="bridge">bridge</option>
        <option value="macvlan">macvlan</option>
      </select>
      {form.driver === 'macvlan' && <input className="input" placeholder="父接口 parent，例如 eth0" value={form.parent} onChange={e => setForm(prev => ({ ...prev, parent: e.target.value }))} />}
      <input className="input" placeholder="Subnet，例如 192.168.50.0/24" value={form.subnet} onChange={e => setForm(prev => ({ ...prev, subnet: e.target.value }))} />
      <input className="input" placeholder="Gateway，例如 192.168.50.1" value={form.gateway} onChange={e => setForm(prev => ({ ...prev, gateway: e.target.value }))} />
      <input className="input" placeholder="IP Range，可选" value={form.ipRange} onChange={e => setForm(prev => ({ ...prev, ipRange: e.target.value }))} />
      <button onClick={async () => { await create(); close() }} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white"><Plus className="h-4 w-4" />创建</button>
    </div>
  )
}

function MacvlanPanel({ mode, setMode, form, setForm, create, networks, replaceForm, setReplaceForm, selectedReplaceNetwork, replaceMacvlan, replaceResult, close }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 dark:bg-slate-950/50">
        <button
          onClick={() => setMode('create')}
          className={cn('rounded-lg px-3 py-2 text-sm font-semibold', mode === 'create' ? 'bg-white text-teal-700 shadow-sm dark:bg-slate-800 dark:text-teal-300' : 'text-slate-500 dark:text-slate-400')}
        >
          新建
        </button>
        <button
          onClick={() => setMode('replace')}
          className={cn('rounded-lg px-3 py-2 text-sm font-semibold', mode === 'replace' ? 'bg-white text-amber-700 shadow-sm dark:bg-slate-800 dark:text-amber-300' : 'text-slate-500 dark:text-slate-400')}
        >
          修改替换
        </button>
      </div>
      {mode === 'create' ? (
        <CreatePanel form={{ ...form, driver: 'macvlan' }} setForm={setForm} create={create} close={close} />
      ) : (
        <ReplacePanel
          networks={networks}
          replaceForm={replaceForm}
          setReplaceForm={setReplaceForm}
          selectedReplaceNetwork={selectedReplaceNetwork}
          replaceMacvlan={replaceMacvlan}
          replaceResult={replaceResult}
        />
      )}
    </div>
  )
}

function ReplacePanel({ networks, replaceForm, setReplaceForm, selectedReplaceNetwork, replaceMacvlan, replaceResult }) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">Docker network 不能原地修改。这里会创建新网络，再按确认项迁移。</div>
      <select className="input" value={replaceForm.oldId} onChange={e => setReplaceForm(prev => ({ ...prev, oldId: e.target.value }))}>
        <option value="">选择旧 macvlan 网络</option>
        {networks.filter(n => n.driver === 'macvlan').map(n => <option key={n.id} value={n.id}>{n.name} · {n.subnet || '-'}</option>)}
      </select>
      {selectedReplaceNetwork && <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-950/40">关联容器：{selectedReplaceNetwork.containerNames?.length ? selectedReplaceNetwork.containerNames.join(', ') : '无'}</div>}
      <input className="input" placeholder="新网络名称" value={replaceForm.name} onChange={e => setReplaceForm(prev => ({ ...prev, name: e.target.value }))} />
      <input className="input" placeholder="新父接口 parent，例如 eth0" value={replaceForm.parent} onChange={e => setReplaceForm(prev => ({ ...prev, parent: e.target.value }))} />
      <input className="input" placeholder="新 Subnet，例如 192.168.50.0/24" value={replaceForm.subnet} onChange={e => setReplaceForm(prev => ({ ...prev, subnet: e.target.value }))} />
      <input className="input" placeholder="新 Gateway，例如 192.168.50.1" value={replaceForm.gateway} onChange={e => setReplaceForm(prev => ({ ...prev, gateway: e.target.value }))} />
      <input className="input" placeholder="新 IP Range，可选" value={replaceForm.ipRange} onChange={e => setReplaceForm(prev => ({ ...prev, ipRange: e.target.value }))} />
      <label className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 dark:border-slate-800 dark:text-slate-200"><input type="checkbox" checked={replaceForm.migrate} onChange={e => setReplaceForm(prev => ({ ...prev, migrate: e.target.checked, deleteOld: e.target.checked ? prev.deleteOld : false }))} />迁移旧网络容器</label>
      <label className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 dark:border-slate-800 dark:text-slate-200"><input type="checkbox" checked={replaceForm.deleteOld} disabled={!replaceForm.migrate} onChange={e => setReplaceForm(prev => ({ ...prev, deleteOld: e.target.checked }))} />成功后删除旧网络</label>
      <button onClick={replaceMacvlan} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-3 text-sm font-semibold text-white hover:bg-amber-700"><AlertTriangle className="h-4 w-4" />创建替代网络</button>
      {replaceResult && <div className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600 dark:bg-slate-950 dark:text-slate-300">新网络：{replaceResult.newName || replaceResult.newId}；已迁移：{replaceResult.migrated?.length ? replaceResult.migrated.join(', ') : '无'}</div>}
    </div>
  )
}

function IPPanel({ networks, containers, ipForm, setIpForm, setContainerIP, close }) {
  return (
    <div className="space-y-3">
      <select className="input" value={ipForm.networkId} onChange={e => setIpForm(prev => ({ ...prev, networkId: e.target.value }))}>
        <option value="">选择 macvlan 网络</option>
        {networks.filter(n => n.driver === 'macvlan').map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
      </select>
      <select className="input" value={ipForm.containerID} onChange={e => setIpForm(prev => ({ ...prev, containerID: e.target.value }))}>
        <option value="">选择容器</option>
        {containers.map(item => (
          <option key={item.id} value={item.id}>
            {item.name || item.id} · {String(item.id || '').slice(0, 12)}
          </option>
        ))}
      </select>
      <input className="input" placeholder="IPv4，例如 192.168.50.20" value={ipForm.ipv4Address} onChange={e => setIpForm(prev => ({ ...prev, ipv4Address: e.target.value }))} />
      <button onClick={async () => { await setContainerIP(); close() }} className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white dark:bg-white dark:text-slate-900">断开并重新连接</button>
    </div>
  )
}

