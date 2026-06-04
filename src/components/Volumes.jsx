import React, { useEffect, useMemo, useState } from 'react'
import { Database, Search, Trash2 } from 'lucide-react'
import { volumeAPI } from '../api/client.js'

export function Volumes() {
  const [volumes, setVolumes] = useState([])
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState('')

  const load = async () => {
    const res = await volumeAPI.getVolumes()
    setVolumes(res.data?.data || [])
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    const onGlobalRefresh = () => load()
    window.addEventListener('docker-copilot-global-refresh', onGlobalRefresh)
    return () => window.removeEventListener('docker-copilot-global-refresh', onGlobalRefresh)
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return volumes
    return volumes.filter(v => [v.name, v.driver, v.mountpoint, ...(v.containers || [])].some(x => String(x || '').toLowerCase().includes(q)))
  }, [volumes, query])

  const remove = async (name) => {
    await volumeAPI.deleteVolume(name)
    setMessage(`卷 ${name} 已删除`)
    await load()
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-5">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 pr-0 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400"><Database className="h-4 w-4" />Docker Volumes</div>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">卷</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">查看数据持久化存储和关联容器，删除未使用卷。</p>
          </div>
        </div>
        <div className="relative mt-5">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={e => setQuery(e.target.value)} className="input pl-10" placeholder="搜索卷、挂载路径或容器..." />
        </div>
      </section>

      {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">{message}</div>}

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="grid grid-cols-1 gap-3">
          {filtered.map(volume => (
            <div key={volume.name} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="break-all font-semibold text-slate-950 dark:text-white">{volume.name}</h3>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">{volume.driver}</span>
                    <span className={volume.inUse ? 'rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'}>{volume.inUse ? '使用中' : '疑似未使用'}</span>
                  </div>
                  <div className="mt-2 break-all text-xs text-slate-500">{volume.mountpoint}</div>
                  {volume.containers?.length > 0 && <div className="mt-2 text-xs text-slate-500">关联容器: {volume.containers.join(', ')}</div>}
                </div>
                {!volume.inUse && <button onClick={() => remove(volume.name)} className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-sm text-red-600 dark:border-red-900"><Trash2 className="h-4 w-4" />删除</button>}
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">暂无卷</div>}
        </div>
      </section>
    </div>
  )
}
