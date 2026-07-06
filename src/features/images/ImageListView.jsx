import React from 'react'
import { Ban, ExternalLink, HardDrive, Pencil, RefreshCw, Trash2, Zap } from 'lucide-react'
import { cn } from '../../utils/cn.js'
import { getImageLogo } from '../../config/imageLogos.js'
import { SafeImage, ImageRiskHint } from './components.jsx'
import { buildPullTarget, canonicalRepoLink, formatImageSize, formatTableDateTime, getSizeColor, shortImageId } from './imageUtils.js'

export function ImageListView({
  images,
  viewMode,
  filteredImages,
  selectedImages,
  toggleSelectAllImages,
  toggleImageSelection,
  imageTableWidths,
  customIcons,
  openImageEditModal,
  isImageUpdateIgnored,
  getImageUpdateActionState,
  renderImageUpdateButtons,
  isBatchMode,
  openAcceleratorModal,
  openImageRefLink,
  startImageUpdate,
  setDeleteModal,
  unignoreImageUpdate,
  ignoreImageUpdate,
}) {
  return (
    <>
      {/* 镜像网格 */}
      <div className="py-4">
        {images.length === 0 ? (
          <div className="card p-12 text-center rounded-2xl">
            <HardDrive className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">暂无镜像</h3>
            <p className="text-gray-500 dark:text-gray-400">您还没有任何Docker镜像</p>
          </div>
        ) : viewMode === 'table' ? (
          <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full table-fixed divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900/60">
                  <tr>
                    <th className="w-14 px-4 py-3 text-left">
                      <label className="inline-flex items-center justify-center w-8 h-8 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={filteredImages.length > 0 && filteredImages.every(img => selectedImages.includes(img.id))}
                          onChange={toggleSelectAllImages}
                          className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                        />
                      </label>
                    </th>
                    {[
                      { key: 'name', title: '镜像名称', minWidth: 240 },
                      { key: 'tag', title: 'Tag', minWidth: 110 },
                      { key: 'statusIcon', title: '', minWidth: 52 },
                      { key: 'imageId', title: '镜像ID', minWidth: 120 },
                      { key: 'size', title: '占用空间', minWidth: 110 },
                      { key: 'createTime', title: '创建时间', minWidth: 170 },
                      { key: 'actions', title: '操作', minWidth: 300 },
                    ].map((col) => (
                      <th
                        key={col.key}
                        className="group relative px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap"
                        style={{ width: `${imageTableWidths[col.key]}px`, minWidth: `${col.minWidth}px` }}
                      >
                        {col.title}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700 bg-white dark:bg-gray-800">
                  {filteredImages.map((image) => (
                    <tr key={image.id} onClick={() => toggleImageSelection(image.id)} className={cn(
                      "hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer",
                      selectedImages.includes(image.id) && "bg-primary-50 dark:bg-primary-900/20",
                      isImageUpdateIgnored(image) && "opacity-55 grayscale"
                    )}>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <label className="inline-flex items-center justify-center w-8 h-8 cursor-pointer">
                          <input type="checkbox" checked={selectedImages.includes(image.id)} onChange={() => toggleImageSelection(image.id)} className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500" />
                        </label>
                      </td>
                      <td className="px-4 py-3 min-w-[260px]" style={{ width: `${imageTableWidths.name}px`, minWidth: '220px' }}>
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
                            <SafeImage
                              src={getImageLogo(buildPullTarget(image) || image.name, customIcons)}
                              alt={image.name}
                              className="h-9 w-9 object-cover"
                              fallback={<HardDrive className="h-4 w-4 text-gray-500 dark:text-gray-400" />}
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1 min-w-0">
                              <button
                                onClick={(e) => { e.stopPropagation(); openImageEditModal(image) }}
                                className="font-semibold text-gray-900 dark:text-white truncate max-w-[320px] hover:text-sky-600 dark:hover:text-sky-400 text-left"
                                title={image.inUsed ? '该镜像正被容器引用(包括已停止容器),不能直接修改,请先处理相关容器' : '修改镜像名和 Tag'}
                              >{image.name}</button>
                              <ImageRiskHint image={image} />
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-1">
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap text-left" title={image.tag} style={{ width: `${imageTableWidths.tag}px`, minWidth: '110px' }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); openImageEditModal(image) }}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700"
                          title={image.inUsed ? '该镜像正被容器引用(包括已停止容器),不能直接修改,请先处理相关容器' : '修改镜像名和 Tag'}
                        >
                          <span>{image.tag}</span>
                          <Pencil className="h-3.5 w-3.5 text-gray-400" />
                        </button>
                      </td>
                      <td className="pl-2 pr-0 py-3 whitespace-nowrap" style={{ width: `${imageTableWidths.statusIcon}px`, minWidth: '24px' }}>
                        <div className="flex items-center justify-end" title={image.usageState === 'running' ? '使用中' : image.usageState === 'stopped' ? '已使用（相关容器已停止）' : '未使用'}>
                          <span className={cn(
                            'h-2.5 w-2.5 rounded-full flex-shrink-0',
                            image.usageState === 'running'
                              ? 'bg-green-500'
                              : image.usageState === 'stopped'
                                ? 'bg-amber-500'
                                : 'bg-gray-400'
                          )} />
                        </div>
                      </td>
                      <td className="pl-1 pr-4 py-3 text-sm text-gray-600 dark:text-gray-300 font-mono whitespace-nowrap text-left" title={image.id} style={{ width: `${imageTableWidths.imageId}px`, minWidth: '120px' }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); openImageRefLink(image) }}
                          className="inline-flex items-center gap-1 text-sky-600 dark:text-sky-400 hover:underline"
                          title={canonicalRepoLink(image) || image.name}
                        >
                          <span>{shortImageId(image.id)}</span>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                      </td>
                      <td className={cn('px-4 py-3 text-sm font-semibold whitespace-nowrap text-left', getSizeColor(image.size))} style={{ width: `${imageTableWidths.size}px`, minWidth: '110px' }}>{formatImageSize(image.size)}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap" style={{ width: `${imageTableWidths.createTime}px`, minWidth: '170px' }}>{formatTableDateTime(image.createTime)}</td>
                      {(() => {
                        const actionState = getImageUpdateActionState(image)
                        const showTableProgress = ['update', 'delete', 'force-delete', 'ignore'].includes(actionState?.action) && (actionState?.loading || actionState?.done)
                        return (
                          <td className={cn("px-4 whitespace-nowrap", showTableProgress ? "py-0" : "py-3")} style={{ width: `${imageTableWidths.actions}px`, minWidth: '260px' }}>
                            <div className="flex items-stretch justify-start gap-1.5 min-w-0 h-full">
                              {renderImageUpdateButtons(image, { compact: true })}
                            </div>
                          </td>
                        )
                      })()}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
            {filteredImages
              .map((image) => (
                <div
                  key={image.id}
                  className={cn(
                    "group card p-3 sm:p-4 rounded-2xl hover:shadow-lg transition-all relative",
                    isBatchMode && "cursor-pointer select-none",
                    selectedImages.includes(image.id) && "ring-2 ring-primary-500 bg-primary-50 dark:bg-primary-900/20",
                    isImageUpdateIgnored(image) && "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 hover:border-gray-300 dark:hover:border-gray-600"
                  )}
                  onClick={() => {
                    if (isBatchMode) toggleImageSelection(image.id)
                  }}
                >
                  {(() => {
                    const actionState = getImageUpdateActionState(image)
                    const showCardProgress = actionState?.action === 'update' && (actionState?.loading || actionState?.done)
                    return showCardProgress ? (
                      <div className="absolute inset-0 pointer-events-none rounded-2xl overflow-hidden">
                        <div
                          className={cn(
                            "absolute top-0 left-0 bottom-0 transition-all duration-500 ease-out",
                            actionState?.done
                              ? "bg-gradient-to-r from-green-500/25 via-green-400/25 to-green-500/25"
                              : "bg-gradient-to-r from-primary-500/30 via-primary-400/30 to-primary-500/30"
                          )}
                          style={{ width: `${actionState?.done ? 100 : (actionState?.percentage || 0)}%` }}
                        >
                          <div
                            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer"
                            style={{
                              backgroundSize: '200% 100%',
                              animation: 'shimmer 2s infinite linear'
                            }}
                          />
                        </div>
                      </div>
                    ) : null
                  })()}

                  {isBatchMode && (
                    <div className="absolute right-2 top-2 z-[2]" onClick={(e) => e.stopPropagation()}>
                      <label className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-primary-200 bg-white/95 shadow dark:border-primary-700 dark:bg-gray-900/90">
                        <input
                          type="checkbox"
                          checked={selectedImages.includes(image.id)}
                          onChange={() => toggleImageSelection(image.id)}
                          className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-gray-600"
                        />
                      </label>
                    </div>
                  )}
                  {/* 头部:图标、名字、状态指示器和大小 */}
                  <div className="flex items-start gap-2.5 sm:gap-3 mb-2">
                    <div className="h-9 w-9 sm:h-10 sm:w-10 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
                      <SafeImage
                        src={getImageLogo(buildPullTarget(image) || image.name, customIcons)}
                        alt={image.name}
                        className="h-9 w-9 sm:h-10 sm:w-10 object-cover"
                        fallback={<HardDrive className="h-4 w-4 sm:h-5 sm:w-5 text-gray-500 dark:text-gray-400" />}
                      />
                    </div>

                    {/* 竖线状态指示器 */}
                    <div className="flex flex-col items-center justify-center h-9 sm:h-10">
                      {image.usageState === 'running' && (
                        <div className="w-1 h-5 sm:h-6 bg-gradient-to-b from-green-500 to-green-600 rounded-full flex-shrink-0" />
                      )}
                      {image.usageState === 'stopped' && (
                        <div className="w-1 h-5 sm:h-6 bg-gradient-to-b from-amber-400 to-amber-500 rounded-full flex-shrink-0" />
                      )}
                      {(!image.usageState || image.usageState === 'unused') && (
                        <div className="w-1 h-5 sm:h-6 bg-gray-300 dark:bg-gray-600 rounded-full flex-shrink-0" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-gray-900 dark:text-white truncate text-[13px] sm:text-sm flex items-center gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); openImageEditModal(image) }}
                          className="truncate text-left hover:underline"
                          title={image.inUsed ? '该镜像正被容器引用(包括已停止容器),不能直接修改,请先处理相关容器' : '修改镜像名和 Tag'}
                        >
                          {image.name}
                        </button>
                        <ImageRiskHint image={image} />
                      </h4>
                      <p className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); openImageEditModal(image) }}
                          className="truncate inline-flex items-center gap-1 hover:text-primary-600 dark:hover:text-primary-400 text-sm sm:text-base"
                          title={image.inUsed ? '该镜像正被容器引用(包括已停止容器),不能直接修改,请先处理相关容器' : '修改镜像名和 Tag'}
                        >
                          <span className="truncate">{image.tag}</span>
                          <Pencil className="h-3 w-3 flex-shrink-0" />
                        </button>
                      </p>
                    </div>

                    {!isBatchMode && <div className="absolute top-0 right-0 z-[2]">
                      <button
                        onClick={(e) => { e.stopPropagation(); openAcceleratorModal(buildPullTarget(image) || image.name) }}
                        className="inline-flex items-center justify-center p-0.5 text-amber-500 hover:text-amber-600 dark:hover:text-amber-300 transition-colors active:scale-95"
                        title={`为 ${image.name}:${image.tag} 打开加速拉取`}
                      >
                        <Zap className="h-3.5 w-3.5 fill-current stroke-[2.2]" />
                      </button>
                    </div>}
                  </div>

                  {!isBatchMode && image.haveUpdate && (
                    <div className="absolute -top-[2px] -right-[2px] z-[1] h-[80px] w-[80px] pointer-events-none overflow-hidden rounded-tr-2xl">
                      <div className="absolute top-0 right-0 w-full h-full flex items-center justify-center">
                        <div className="absolute transform rotate-45 translate-x-[26px] -translate-y-[26px] w-[120px] h-[24px] bg-gradient-to-r from-yellow-400 to-yellow-500 dark:from-yellow-500 dark:to-yellow-600 shadow-sm flex items-center justify-center">
                          <span className="relative text-[10px] font-bold text-white tracking-widest uppercase w-full text-center">
                            NEW
                            <div className="absolute top-0 left-0 animate-flow-light"></div>
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {!isBatchMode && isImageUpdateIgnored(image) && (
                    <div className="absolute -top-[2px] -right-[2px] z-[1] h-[86px] w-[86px] pointer-events-none overflow-hidden rounded-tr-2xl">
                      <div className="absolute top-0 right-0 w-full h-full flex items-center justify-center">
                        <div className="absolute transform rotate-45 translate-x-[28px] -translate-y-[28px] w-[128px] h-[24px] bg-gradient-to-r from-gray-400 to-gray-500 dark:from-gray-600 dark:to-gray-700 shadow-sm flex items-center justify-center">
                          <span className="relative text-[10px] font-bold text-white tracking-widest w-full text-center">忽略</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 镜像信息 */}
                  {!isBatchMode && (
                    <div className="space-y-1.5 text-[11px] sm:text-xs mb-2 ml-[58px] sm:ml-[68px] mr-5 sm:mr-6">
                      <div className={cn('mt-1 text-xs font-mono truncate', getSizeColor(image.size))}>
                        占用:{formatImageSize(image.size).replace(/\s+/g, '')}
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); openImageRefLink(image) }}
                        className="mt-1 font-mono text-gray-500 dark:text-gray-400 truncate text-xs hover:text-sky-600 dark:hover:text-sky-400 hover:underline inline-flex items-center gap-1 text-left min-w-0"
                        title={canonicalRepoLink(image) || image.name}
                      >
                        <span>ID:</span>
                        <span className="truncate">{shortImageId(image.id)}</span>
                        <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
                      </button>
                    </div>
                  )}

                  {(() => {
                    const actionState = getImageUpdateActionState(image)
                    const showCardProgress = actionState?.action === 'update' && (actionState?.loading || actionState?.done)
                    return !isBatchMode ? (
                      <div className="grid grid-cols-2 gap-1.5 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700/50 sm:grid-cols-4">
                        {showCardProgress ? (
                          <div className={cn(
                            "col-span-full inline-flex h-9 min-w-0 items-center justify-center gap-2 px-2 rounded-lg border whitespace-nowrap",
                            actionState?.done ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800" : "bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800"
                          )}>
                            {actionState?.done ? <span className="h-4 w-4 text-green-600 dark:text-green-400 text-center leading-4">✓</span> : <RefreshCw className="h-4 w-4 animate-spin text-primary-600 dark:text-primary-400" />}
                            <span className={cn(
                              "text-xs font-medium",
                              actionState?.done ? "text-green-600 dark:text-green-400" : "text-primary-600 dark:text-primary-400"
                            )}>
                              {actionState?.done ? (actionState?.progress || '更新完成') : `更新中${actionState?.percentage ? ` ${Math.round(actionState.percentage)}%` : ''}`}
                            </span>
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={(e) => { e.stopPropagation(); startImageUpdate(image) }}
                              disabled={!image.haveUpdate || isImageUpdateIgnored(image)}
                              className={cn(
                                "inline-flex h-9 min-w-0 items-center justify-center gap-1 px-2 border rounded-lg transition-all duration-200 shadow-sm text-xs font-medium whitespace-nowrap",
                                isImageUpdateIgnored(image)
                                  ? "text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 cursor-not-allowed opacity-70"
                                  : image.haveUpdate
                                    ? "text-yellow-600 dark:text-yellow-400 bg-white dark:bg-gray-800 border-yellow-400 dark:border-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 hover:shadow active:scale-95"
                                    : "text-purple-600 dark:text-purple-400 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:border-purple-200 dark:hover:border-purple-800 hover:shadow active:scale-95"
                              )}
                              title={isImageUpdateIgnored(image) ? '这个镜像已在更新黑名单中' : image.haveUpdate ? '直接按系统默认源更新' : '当前没有检测到可用更新'}
                            >
                              <RefreshCw className="h-4 w-4" />
                              <span className="hidden sm:inline">更新</span>
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setDeleteModal({ isOpen: true, image, force: false }) }}
                              className="inline-flex h-9 min-w-0 items-center justify-center gap-1 px-2 text-red-600 dark:text-red-400 bg-white dark:bg-gray-800 hover:bg-red-50 dark:hover:bg-red-900/20 border border-gray-200 dark:border-gray-700 hover:border-red-200 dark:hover:border-red-800 rounded-lg transition-all duration-200 shadow-sm hover:shadow active:scale-95 text-xs font-medium whitespace-nowrap"
                            >
                              <Trash2 className="h-4 w-4" />
                              <span className="hidden sm:inline">删除</span>
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setDeleteModal({ isOpen: true, image, force: true }) }}
                              className="inline-flex h-9 min-w-0 items-center justify-center gap-1 px-2 text-orange-600 dark:text-orange-400 bg-white dark:bg-gray-800 hover:bg-orange-50 dark:hover:bg-orange-900/20 border border-gray-200 dark:border-gray-700 hover:border-orange-200 dark:hover:border-orange-800 rounded-lg transition-all duration-200 shadow-sm hover:shadow active:scale-95 text-xs font-medium whitespace-nowrap"
                              title="强制删除镜像"
                            >
                              <Trash2 className="h-4 w-4" />
                              <span className="hidden sm:inline">强删</span>
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); (isImageUpdateIgnored(image) ? unignoreImageUpdate(image) : ignoreImageUpdate(image)) }}
                              className={cn(
                                "inline-flex h-9 min-w-0 items-center justify-center gap-1 px-2 border rounded-lg transition-all duration-200 shadow-sm text-xs font-medium whitespace-nowrap",
                                isImageUpdateIgnored(image)
                                  ? "text-amber-700 dark:text-amber-300 bg-white dark:bg-gray-800 border-amber-400 dark:border-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:shadow active:scale-95"
                                  : "text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 hover:shadow active:scale-95"
                              )}
                            >
                              <Ban className="h-4 w-4" />
                              <span className="hidden sm:inline">{isImageUpdateIgnored(image) ? '取消' : '忽略'}</span>
                            </button>
                          </>
                        )}
                      </div>
                    ) : null
                  })()}
                </div>
              ))}
          </div>
        )}
      </div>
    </>
  )
}
