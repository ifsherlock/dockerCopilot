"use client"

import { Eye, EyeOff, Github, Globe, LoaderCircle, Package, RefreshCw, Search, Trash2, Zap } from "lucide-react"

import { cn } from "@/lib/utils"
import type { ImageInfo } from "@/lib/api"
import { EmptyState, StatCard } from "../components/MobilePrimitives"
import { parseImageRepoLink } from "../mobileUtils"

type ImageFilterKey = "all" | "inUse" | "unused" | "updatable"
type PageType = "containers" | "images" | "config" | "backups" | "logs" | "about"

type ImagesViewProps = {
  imageQuery: string
  setImageQuery: (value: string) => void
  imageStats: { total: number; inUse: number; unused: number; updatable: number }
  imageFilter: ImageFilterKey
  setImageFilter: (value: ImageFilterKey | ((prev: ImageFilterKey) => ImageFilterKey)) => void
  refreshing: boolean
  filteredImages: ImageInfo[]
  isImageUpdateIgnored: (image: ImageInfo) => boolean
  blacklistPendingKey: string
  buildPullTarget: (image: ImageInfo) => string
  getImageIcon: (image: ImageInfo) => string | null
  handleDeleteImage: (id: string, force?: boolean) => void
  handleImageUpdate: (image: ImageInfo) => void
  setPullImageName: (value: string) => void
  setActivePage: (page: PageType) => void
  handleToggleImageIgnore: (image: ImageInfo) => void
  pendingAction: string
}

export function ImagesView(props: ImagesViewProps) {
  const {
    imageQuery,
    setImageQuery,
    imageStats,
    imageFilter,
    setImageFilter,
    refreshing,
    filteredImages,
    isImageUpdateIgnored,
    blacklistPendingKey,
    buildPullTarget,
    getImageIcon,
    handleDeleteImage,
    handleImageUpdate,
    setPullImageName,
    setActivePage,
    handleToggleImageIgnore,
    pendingAction,
  } = props

  return (
    <div className="space-y-4">
            {/* 搜索 */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={imageQuery}
                onChange={(e) => setImageQuery(e.target.value)}
                placeholder="搜索镜像..."
                className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900"
              />
            </div>

            {/* 统计卡片：4个一行 */}
            <div className="grid grid-cols-4 gap-3">
              <StatCard label="总数" value={imageStats.total} accent="bg-slate-400" active={imageFilter === "all"} onClick={() => setImageFilter("all")} />
              <StatCard label="使用" value={imageStats.inUse} accent="bg-emerald-500" active={imageFilter === "inUse"} onClick={() => setImageFilter((prev) => (prev === "inUse" ? "all" : "inUse"))} />
              <StatCard label="空闲" value={imageStats.unused} accent="bg-amber-500" active={imageFilter === "unused"} onClick={() => setImageFilter((prev) => (prev === "unused" ? "all" : "unused"))} />
              <StatCard label="更新" value={imageStats.updatable} accent="bg-blue-500" active={imageFilter === "updatable"} onClick={() => setImageFilter((prev) => (prev === "updatable" ? "all" : "updatable"))} />
            </div>

            {/* 列表 */}
            {refreshing ? (
              <div className="flex items-center justify-center py-12">
                <LoaderCircle className="h-6 w-6 animate-spin text-blue-500" />
              </div>
            ) : filteredImages.length === 0 ? (
              <EmptyState title="暂无镜像" description={imageQuery ? "未找到匹配的镜像" : "没有可显示的镜像"} />
            ) : (
              <div className="space-y-3">
                {filteredImages.map((img) => {
                  const repoLinks = parseImageRepoLink(img.name, img.tag)
                  const isIgnored = isImageUpdateIgnored(img)
                  const blacklistBusy = blacklistPendingKey === `image-${img.id}`
                  const pullTarget = buildPullTarget(img)
                  return (
                    <div
                      key={img.id}
                      className={cn(
                        "rounded-2xl p-4 shadow-sm ring-1 transition-all",
                        isIgnored
                          ? "bg-slate-100/90 dark:bg-slate-900/90 ring-slate-300 dark:ring-slate-700 opacity-70 grayscale"
                          : "bg-white dark:bg-slate-900 ring-slate-100 dark:ring-slate-700"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
                          {getImageIcon(img) ? (
                            <img src={getImageIcon(img)!} alt="" className="h-8 w-8 object-contain" />
                          ) : (
                            <Package className="h-5 w-5 text-slate-400" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {img.name}:{img.tag}
                            </span>
                            {img.inUsed && <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" title="使用" />}
                            {isIgnored ? (
                              <span className="inline-flex items-center justify-center text-amber-600 dark:text-amber-300" title="已忽略">
                                <EyeOff className="h-3.5 w-3.5" />
                              </span>
                            ) : img.haveUpdate ? (
                              <span className="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
                                更新
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                            {(repoLinks.github || repoLinks.dockerHub) && (
                              <a
                                href={repoLinks.github || repoLinks.dockerHub}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={cn(
                                  "inline-flex h-5 w-5 items-center justify-center rounded-md transition-colors",
                                  repoLinks.github
                                    ? "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                                    : "bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40"
                                )}
                                title={repoLinks.github ? "GitHub" : "Docker Hub"}
                                aria-label={repoLinks.github ? "GitHub" : "Docker Hub"}
                              >
                                {repoLinks.github ? <Github className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
                              </a>
                            )}
                            <span>{img.size}</span>
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-4 gap-2">
                        <button
                          type="button"
                          onClick={() => handleDeleteImage(img.id)}
                          disabled={pendingAction === `delete-${img.id}`}
                          title="删除镜像"
                          aria-label="删除镜像"
                          className="flex h-10 w-full items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-600 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30"
                        >
                          {pendingAction === `delete-${img.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleImageUpdate(img)}
                          disabled={!img.haveUpdate || isIgnored || pendingAction === `update-image-${img.id}`}
                          title={isIgnored ? "该镜像已在更新黑名单中" : img.haveUpdate ? "更新镜像" : "当前没有可用更新"}
                          aria-label="更新镜像"
                          className={cn(
                            "flex h-10 w-full items-center justify-center rounded-xl border transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                            img.haveUpdate && !isIgnored
                              ? "border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 dark:border-blue-900/50 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30"
                              : "border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500"
                          )}
                        >
                          {pendingAction === `update-image-${img.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPullImageName(pullTarget || img.name)
                            setActivePage("backups")
                          }}
                          title="打开加速拉取"
                          aria-label="打开加速拉取"
                          className="flex h-10 w-full items-center justify-center rounded-xl border border-purple-200 bg-purple-50 text-purple-600 transition-colors hover:bg-purple-100 dark:border-purple-900/50 dark:bg-purple-900/20 dark:text-purple-400 dark:hover:bg-purple-900/30"
                        >
                          <Zap className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleImageIgnore(img)}
                          disabled={blacklistBusy}
                          title={isIgnored ? "取消忽略更新" : "忽略更新"}
                          aria-label={isIgnored ? "取消忽略更新" : "忽略更新"}
                          className={cn(
                            "flex h-10 w-full items-center justify-center rounded-xl border transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                            isIgnored
                              ? "border-amber-200 bg-amber-50 text-amber-600 hover:bg-amber-100 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-400 dark:hover:bg-amber-900/30"
                              : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                          )}
                        >
                          {blacklistBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : isIgnored ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
  )
}
