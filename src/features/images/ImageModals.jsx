import React from 'react'
import { AlertCircle, CheckCircle, ExternalLink, Gauge, HardDrive, Logs, Plus, RefreshCw, Trash2, X, Zap } from 'lucide-react'
import { cn } from '../../utils/cn.js'
import { getImageLogo } from '../../config/imageLogos.js'
import { SafeImage } from './components.jsx'
import { buildPullTarget, canonicalRepoLink, formatImageSize } from './imageUtils.js'

export function ImageModals({
  successModal,
  setSuccessModal,
  pruneModal,
  setPruneModal,
  handlePrune,
  isLoading,
  customIcons,
  acceleratorModal,
  setAcceleratorModal,
  testAcceleratorLatency,
  testingAccelerators,
  acceleratorOptions,
  formatLatency,
  selectAcceleratorSource,
  startAcceleratedPull,
  newAccelerator,
  setNewAccelerator,
  addAccelerator,
  latencyClassName,
  setConfirmRemoveAccelerator,
  confirmRemoveAccelerator,
  removeAccelerator,
  editImageModal,
  setEditImageModal,
  openImageRefLink,
  saveImageRetag,
  confirmBatchDeleteModal,
  setConfirmBatchDeleteModal,
  handleBatchDelete,
  deleteModal,
  setDeleteModal,
  handleDeleteImage,
}) {
  return (
    <>
      {/* 成功弹窗 */}
      {successModal.isOpen && (
        <div className="fixed inset-0 z-[10000] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-md w-full overflow-hidden transform transition-all duration-300 scale-100 hover:scale-105">
            {/* 顶部装饰条 */}
            <div className="h-1 bg-gradient-to-r from-green-400 via-emerald-500 to-green-600"></div>

            <div className="p-8 flex flex-col items-center text-center">
              {/* 成功图标容器 - 带脉冲动画 */}
              <div className="relative mb-6">
                <div className="absolute inset-0 bg-green-400/20 rounded-full blur-xl animate-pulse"></div>
                <div className="relative h-16 w-16 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 rounded-full flex items-center justify-center border border-green-200 dark:border-green-700">
                  <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400 animate-bounceIn" />
                </div>
              </div>

              {/* 标题 */}
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                操作成功
              </h3>

              {/* 分隔线 */}
              <div className="w-12 h-1 bg-gradient-to-r from-transparent via-green-400 to-transparent rounded-full mb-4"></div>

              {/* 消息内容 */}
              <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed mb-8">
                {successModal.message}
              </p>

              {/* 按钮 */}
              <button
                onClick={() => setSuccessModal({ isOpen: false, message: '' })}
                className="w-full px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-semibold rounded-xl transition-all duration-300 transform hover:shadow-lg hover:scale-105 active:scale-95 shadow-lg"
              >
                完成
              </button>
            </div>

            {/* 底部装饰 */}
            <div className="h-0.5 bg-gradient-to-r from-transparent via-green-200 dark:via-green-800 to-transparent"></div>
          </div>
        </div>
      )}

      {/* 批量删除确认弹窗 */}
      {pruneModal.isOpen && (
        <div className="fixed inset-0 z-[10000] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-2xl w-full max-h-96 flex flex-col overflow-hidden transform transition-all duration-300 scale-100">
            {/* 顶部装饰条 */}
            <div className="h-1 bg-gradient-to-r from-orange-400 via-red-500 to-orange-600"></div>

            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-start gap-4">
                <div className="relative h-12 w-12 bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-900/30 dark:to-red-900/30 rounded-full flex items-center justify-center flex-shrink-0 border border-orange-200 dark:border-orange-700 flex-shrink-0">
                  <AlertCircle className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                    {pruneModal.type === 'dangling' ? '删除无Tag镜像' : pruneModal.type === 'unused' ? '删除未使用的镜像' : '删除所选镜像'}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                    将永久删除 <span className="font-semibold text-orange-600 dark:text-orange-400">{pruneModal.images.length} 个</span> 镜像,此操作不可恢复
                  </p>
                </div>
              </div>
            </div>

            {/* 镜像列表 */}
            <div className="flex-1 overflow-y-auto px-6 py-4 bg-gray-50/50 dark:bg-gray-700/20">
              <div className="space-y-2">
                {pruneModal.images.map((img) => (
                  <div key={img.id} className="flex items-center gap-3 p-3 bg-white dark:bg-gray-700 rounded-xl hover:shadow-md transition-all duration-200">
                    <div className="h-8 w-8 bg-gray-200 dark:bg-gray-600 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
                      <SafeImage
                        src={getImageLogo(buildPullTarget(img) || img.name, customIcons)}
                        alt={img.name}
                        className="h-8 w-8 object-cover"
                        fallback={<HardDrive className="h-4 w-4 text-gray-500 dark:text-gray-400" />}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {img.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {img.tag}
                      </p>
                    </div>
                    <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 flex-shrink-0 bg-gray-100 dark:bg-gray-600 px-2 py-1 rounded-lg">
                      {formatImageSize(img.size)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 底部按钮 */}
            <div className="p-6 border-t border-gray-200 dark:border-gray-700 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700/50 flex gap-3">
              <button
                onClick={() => setPruneModal({ isOpen: false, type: null, images: [] })}
                className="flex-1 px-4 py-2.5 text-sm font-semibold bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-600 transition-all duration-300 transform hover:shadow-md active:scale-95 border border-gray-200 dark:border-gray-600"
              >
                取消
              </button>
              <button
                onClick={() => {
                  handlePrune(pruneModal.type)
                  setPruneModal({ isOpen: false, type: null, images: [] })
                }}
                disabled={isLoading}
                className="flex-1 px-4 py-2.5 text-sm font-semibold bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 text-white rounded-xl transition-all duration-300 transform hover:shadow-lg hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    删除中...
                  </span>
                ) : (
                  '确认删除'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {acceleratorModal.isOpen && (
        <div className="fixed inset-0 z-[10000] bg-black/40 backdrop-blur-sm p-2 sm:p-4 animate-fadeIn">
          <div className="mx-auto flex h-full w-full max-w-3xl items-center justify-center">
            <div className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-gray-800">
              <div className="h-1 bg-gradient-to-r from-sky-400 via-blue-500 to-cyan-500"></div>
              <div className="flex items-center justify-between gap-3 border-b border-gray-200 p-4 dark:border-gray-700 sm:p-6">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-sky-100 dark:bg-sky-900/40 sm:h-11 sm:w-11">
                    <Zap className="h-5 w-5 fill-current stroke-[2.2] text-sky-600 dark:text-sky-300 sm:h-6 sm:w-6" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-bold text-gray-900 dark:text-white sm:text-lg">加速拉取镜像</h3>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">410 宽度下按移动端卡片布局自适应显示</p>
                  </div>
                </div>
                <button
                  onClick={() => setAcceleratorModal({ isOpen: false, imageName: '', taskId: '', logs: '', selectedSource: '' })}
                  className="rounded-xl p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4 overflow-y-auto p-4 sm:space-y-5 sm:p-6">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-800/40">
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">镜像名称</label>
                  <input
                    value={acceleratorModal.imageName}
                    onChange={(e) => setAcceleratorModal(prev => ({ ...prev, imageName: e.target.value }))}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500"
                    placeholder="例如 library/nginx:latest"
                  />

                  <div className="mt-3 flex items-center justify-between gap-2">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">拉取源</label>
                    <button
                      type="button"
                      onClick={testAcceleratorLatency}
                      className="inline-flex items-center gap-1 text-xs text-slate-500 transition-colors hover:text-sky-600 dark:text-slate-400 dark:hover:text-sky-300"
                    >
                      <Gauge className={cn("h-3.5 w-3.5", testingAccelerators && "animate-pulse text-sky-500")} />
                      {testingAccelerators ? '测速中...' : '重新测速'}
                    </button>
                  </div>
                  <select
                    value={acceleratorModal.selectedSource}
                    onChange={(e) => selectAcceleratorSource(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                  >
                    {acceleratorOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label} · {formatLatency(opt.value)}</option>)}
                  </select>

                  <div className="mt-2 rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                    当前默认源：{acceleratorOptions.find(opt => opt.value === acceleratorModal.selectedSource)?.label || '未选择'}
                  </div>

                  <button
                    onClick={startAcceleratedPull}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-500 px-4 py-3 text-sm font-semibold text-white transition-colors hover:from-sky-600 hover:to-blue-600"
                  >
                    <Zap className="h-4 w-4 fill-current stroke-[2.2]" />
                    开始加速拉取
                  </button>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-800/40">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">镜像加速源</h3>
                      <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">添加自定义源后，可在上方拉取源下拉中直接选择，并保存为默认拉取源。</p>
                    </div>
                    <span className="flex-shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500 shadow-sm dark:bg-slate-900 dark:text-slate-300">
                      {acceleratorOptions.length} 个
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
                    <input
                      value={newAccelerator}
                      onChange={(e) => setNewAccelerator(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') addAccelerator() }}
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500"
                      placeholder="输入加速源,回车保存"
                    />
                    <button
                      onClick={addAccelerator}
                      className="inline-flex items-center justify-center gap-1 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-sky-700"
                    >
                      <Plus className="h-4 w-4" />
                      添加并设为可选
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {acceleratorOptions.map(opt => (
                      <div
                        key={opt.value}
                        className={cn(
                          "flex max-w-full items-center gap-2 rounded-xl border px-3 py-2 text-xs",
                          acceleratorModal.selectedSource === opt.value
                            ? "border-sky-300 bg-sky-100 text-sky-700 dark:border-sky-700 dark:bg-sky-900/30 dark:text-sky-300"
                            : "border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-300"
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => selectAcceleratorSource(opt.value)}
                          className="inline-flex min-w-0 items-center gap-1 text-left"
                        >
                          <span className="truncate">{opt.label}</span>
                          <span className={cn("font-mono", latencyClassName(opt.value))}>{formatLatency(opt.value)}</span>
                        </button>
                        {!opt.value.startsWith('__') && (
                          <button
                            type="button"
                            onClick={() => setConfirmRemoveAccelerator({ isOpen: true, source: opt.value })}
                            className="rounded p-0.5 text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
                            title="删除这个加速源"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-800/40">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                      <Logs className="h-4 w-4" />
                      日志输出
                    </label>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      {acceleratorModal.taskId ? '任务进行中' : '等待开始'}
                    </span>
                  </div>
                  <pre className="h-48 overflow-auto rounded-2xl bg-gray-950 p-4 text-xs text-green-300 whitespace-pre-wrap sm:h-56">{acceleratorModal.logs || '等待开始拉取...'}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmRemoveAccelerator.isOpen && (
        <div className="fixed inset-0 z-[10000] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="w-full max-w-md rounded-3xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">删除加速源</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">确认后会从配置里移除这个镜像加速源。</p>
              </div>
              <button onClick={() => setConfirmRemoveAccelerator({ isOpen: false, source: '' })} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 text-sm text-amber-800 dark:text-amber-200">
              确定删除加速源 <span className="font-mono font-semibold break-all">{confirmRemoveAccelerator.source}</span> 吗?删错了可以稍后再手动添加回来。
            </div>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setConfirmRemoveAccelerator({ isOpen: false, source: '' })} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">取消</button>
              <button onClick={() => removeAccelerator(confirmRemoveAccelerator.source)} className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl bg-gradient-to-r from-red-500 to-orange-500 text-white hover:from-red-600 hover:to-orange-600 shadow-lg">确认删除</button>
            </div>
          </div>
        </div>
      )}

      {editImageModal.isOpen && (
        <div className="fixed inset-0 z-[10000] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-sky-400 via-blue-500 to-cyan-500"></div>
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">修改镜像名 / Tag</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">仅允许修改未使用的镜像;如果镜像正在被容器使用,请先关闭相关容器。</p>
              </div>
              <button onClick={() => setEditImageModal({ isOpen: false, image: null, name: '', tag: '', saving: false })} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">镜像名</label>
                <input value={editImageModal.name} onChange={(e) => setEditImageModal(prev => ({ ...prev, name: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm" placeholder="例如 nginx / ghcr.io/owner/repo" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tag</label>
                <input value={editImageModal.tag} onChange={(e) => setEditImageModal(prev => ({ ...prev, tag: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm" placeholder="例如 latest / 1.27 / dev" />
              </div>
              <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-4 text-xs space-y-1 text-gray-600 dark:text-gray-300">
                <div>当前镜像:<span className="font-mono">{editImageModal.image?.name}:{editImageModal.image?.tag}</span></div>
                <div>
                  来源链接:
                  {canonicalRepoLink(editImageModal.image) ? (
                    <button
                      onClick={() => openImageRefLink(editImageModal.image)}
                      className="ml-1 font-mono break-all text-sky-600 dark:text-sky-400 hover:underline text-left inline-flex items-center gap-1"
                      title={canonicalRepoLink(editImageModal.image)}
                    >
                      <span>{canonicalRepoLink(editImageModal.image)}</span>
                      <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
                    </button>
                  ) : (
                    <span className="ml-1 font-mono break-all">无</span>
                  )}
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex gap-3">
              <button onClick={() => setEditImageModal({ isOpen: false, image: null, name: '', tag: '', saving: false })} className="flex-1 px-4 py-2.5 text-sm font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600">取消</button>
              <button onClick={saveImageRetag} disabled={editImageModal.saving} className="flex-1 px-4 py-2.5 text-sm font-semibold bg-gradient-to-r from-sky-500 to-blue-500 hover:from-sky-600 hover:to-blue-600 text-white rounded-xl transition-all disabled:opacity-50 shadow-lg">
                {editImageModal.saving ? '保存中...' : '保存修改'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 批量强制删除确认弹窗 */}
      {confirmBatchDeleteModal.isOpen && (
        <div className="fixed inset-0 z-[10000] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-xl w-full overflow-hidden transform transition-all duration-300 scale-100">
            <div className="h-1 bg-gradient-to-r from-orange-400 via-red-500 to-orange-600"></div>
            <div className="p-6">
              <div className="flex items-start gap-4 mb-5">
                <div className="relative h-12 w-12 bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-900/30 dark:to-red-900/30 rounded-full flex items-center justify-center flex-shrink-0 border border-orange-200 dark:border-orange-700">
                  <AlertCircle className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">批量强制删除镜像</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">此操作不可恢复,请再次确认</p>
                </div>
              </div>
              <div className="text-sm leading-relaxed text-gray-600 dark:text-gray-300 mb-6">
                确定要强制删除 <span className="font-semibold text-orange-600 dark:text-orange-300">{confirmBatchDeleteModal.images.length}</span> 个镜像吗?
                <span className="block mt-2 text-orange-600 dark:text-orange-300">强制删除会跳过常规保护,适合处理多标签/多仓库引用或普通删除冲突的镜像。</span>
              </div>
              <div className="max-h-40 overflow-auto rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-3 text-xs text-gray-600 dark:text-gray-300 mb-6">
                <div className="space-y-1.5">
                  {confirmBatchDeleteModal.images.slice(0, 12).map(img => (
                    <div key={img.id} className="flex items-center justify-between gap-3">
                      <span className="truncate">{img.name}:{img.tag}</span>
                      <span className="font-mono text-[11px] text-gray-400">{String(img.id || '').slice(0, 12)}</span>
                    </div>
                  ))}
                  {confirmBatchDeleteModal.images.length > 12 && (
                    <div className="text-gray-400">... 还有 {confirmBatchDeleteModal.images.length - 12} 个镜像</div>
                  )}
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmBatchDeleteModal({ isOpen: false, images: [], force: false })}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-all border border-gray-200 dark:border-gray-600"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    const imgs = confirmBatchDeleteModal.images
                    const force = confirmBatchDeleteModal.force
                    setConfirmBatchDeleteModal({ isOpen: false, images: [], force: false })
                    handleBatchDelete(imgs, force)
                  }}
                  disabled={isLoading}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white rounded-xl transition-all disabled:opacity-50 shadow-lg"
                >
                  确认强制删除
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {deleteModal.isOpen && (
        <div className="fixed inset-0 z-[10000] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-md w-full overflow-hidden transform transition-all duration-300 scale-100">
            {/* 顶部装饰条 */}
            {/*<div className="h-1 bg-gradient-to-r from-red-400 via-rose-500 to-red-600"></div>*/}

            <div className="p-8 flex flex-col">
              {/* 图标和标题 */}
              <div className="flex items-start gap-4 mb-6">
                <div className="relative h-12 w-12 bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-900/30 dark:to-rose-900/30 rounded-full flex items-center justify-center flex-shrink-0 border border-red-200 dark:border-red-700">
                  <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                    {deleteModal.force ? '强制删除镜像' : '删除镜像'}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">此操作不可恢复</p>
                </div>
              </div>

              {/* 分隔线 */}
              <div className="w-full h-px bg-gradient-to-r from-transparent via-red-200 dark:via-red-800 to-transparent mb-6"></div>

              {/* 消息内容 */}
              <div className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed mb-8">
                {deleteModal.force ? (
                  <>
                    确定要强制删除镜像{' '}
                    <span className="font-semibold text-red-600 dark:text-red-400">"{deleteModal.image?.name}"</span>
                    {' '}吗?这会跳过常规保护,适合处理"多标签/多仓库引用"或普通删除冲突的镜像。
                  </>
                ) : (
                  <>
                    确定要删除镜像{' '}
                    <span className="font-semibold text-red-600 dark:text-red-400">"{deleteModal.image?.name}"</span>
                    {' '}吗?
                    {!deleteModal.image?.inUsed && deleteModal.image?.multiRef && (
                      <span className="block mt-2 text-orange-600 dark:text-orange-300">这个镜像存在多引用,普通删除很可能失败,建议直接使用"强制删除"。</span>
                    )}
                  </>
                )}
              </div>

              {/* 按钮组 */}
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteModal({ isOpen: false, image: null })}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-all duration-300 transform hover:shadow-md active:scale-95 border border-gray-200 dark:border-gray-600"
                >
                  取消
                </button>
                <button
                  onClick={() => deleteModal.image && handleDeleteImage(deleteModal.image.id, deleteModal.force)}
                  disabled={isLoading}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600 text-white rounded-xl transition-all duration-300 transform hover:shadow-lg hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      删除中
                    </span>
                  ) : (
                    '确认删除'
                  )}
                </button>
              </div>
            </div>

            {/* 底部装饰 */}
            <div className="h-0.5 bg-gradient-to-r from-transparent via-red-200 dark:via-red-800 to-transparent"></div>
          </div>
        </div>
      )}
    </>
  )
}
