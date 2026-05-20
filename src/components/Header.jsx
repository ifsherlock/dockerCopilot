import React from 'react'
import {
  Box,
  HardDrive,
  LogOut,
  Menu,
  X,
  Server,
  Image,
  DatabaseBackup,
  Palette,
  Info,
  Bot,
  FileText,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  RefreshCw,
  ArrowUpCircle,
  ShieldCheck
} from 'lucide-react'
import { ThemeToggle } from './ThemeToggle.jsx'
import { UpdatePrompt } from './UpdatePrompt.jsx'
import { cn } from '../utils/cn.js'
import logoImg from '../assets/DockerCopilot-logo.png'
import { useVersionCheck } from '../hooks/useVersionCheck.js'
import { useTheme } from '../hooks/useTheme.jsx'

export function Sidebar({ activeTab, onTabChange, onLogout, isCollapsed = false, onToggleCollapse, windowWidth = 1024 }) {
  const { appearance } = useTheme()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false)
  const [isDevInfoExpanded, setIsDevInfoExpanded] = React.useState(false)

  // 时间格式转换函数 - 将UTC时间转换为北京时间
  const formatVersionBuildDate = (dateString) => {
    try {
      const date = new Date(dateString)
      if (isNaN(date.getTime())) {
        return dateString
      }

      // 转换为北京时间 (UTC+8)
      const beijingDate = new Date(date.getTime() + 8 * 60 * 60 * 1000)

      return beijingDate.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).replace(/\//g, '-')
    } catch (error) {
      return dateString
    }
  }

  // 使用版本检查 Hook
  const {
    showUpdatePrompt,
    setShowUpdatePrompt,
    backendVersion,
    remoteVersion,
    buildDate,
    hasBackendUpdate,
    isUpdating,
    updateMessage,
    showForceUpdate,
    updateProgress,
    isReconnectChecking,
    postUpdateNeedsRefresh,
    uploadProgramUpdate,
    updateBackend,
    forceUpdateBackend,
    checkForUpdates
  } = useVersionCheck()

  const displayVersion = (value) => {
    const raw = String(value || '').trim()
    if (!raw) return '--'
    return raw.startsWith('v') ? raw : `v${raw}`
  }

  const sidebarSurface = cn(
    appearance === 'aurora' && 'bg-[linear-gradient(180deg,rgba(255,255,255,0.82)_0%,rgba(248,250,255,0.88)_100%)] dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.92)_0%,rgba(17,24,39,0.96)_100%)] border-primary-100/70 dark:border-primary-900/40',
    appearance === 'night_sail' && 'bg-[linear-gradient(180deg,rgba(241,245,249,0.92)_0%,rgba(226,232,240,0.96)_100%)] dark:bg-[linear-gradient(180deg,rgba(2,6,23,0.95)_0%,rgba(15,23,42,0.98)_100%)] border-slate-200/80 dark:border-slate-800/70',
    appearance === 'mist' && 'bg-[linear-gradient(180deg,rgba(255,255,255,0.86)_0%,rgba(244,244,245,0.94)_100%)] dark:bg-[linear-gradient(180deg,rgba(17,24,39,0.92)_0%,rgba(15,23,42,0.96)_100%)] border-stone-200/80 dark:border-slate-700/60'
  )

  const navItemBase = appearance === 'aurora'
    ? 'text-slate-700 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-white/5'
    : appearance === 'night_sail'
      ? 'text-slate-700 dark:text-slate-200 hover:bg-white/55 dark:hover:bg-sky-900/25'
      : 'text-slate-700 dark:text-slate-300 hover:bg-white/75 dark:hover:bg-white/5'

  const navItemActive = appearance === 'aurora'
    ? 'bg-white/82 dark:bg-primary-900/22 text-primary-700 dark:text-primary-300 font-semibold shadow-sm border border-primary-100/70 dark:border-primary-800/50'
    : appearance === 'night_sail'
      ? 'bg-white/72 dark:bg-sky-900/24 text-sky-700 dark:text-sky-300 font-semibold shadow-sm border border-sky-100/70 dark:border-sky-800/40'
      : 'bg-white/88 dark:bg-slate-800/55 text-slate-700 dark:text-slate-100 font-semibold shadow-sm border border-stone-200/80 dark:border-slate-700/70'

  const softPanel = appearance === 'aurora'
    ? 'rounded-2xl border border-white/70 bg-white/42 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5'
    : appearance === 'night_sail'
      ? 'rounded-2xl border border-white/45 bg-white/35 shadow-sm backdrop-blur dark:border-sky-900/30 dark:bg-slate-900/45'
      : 'rounded-2xl border border-white/75 bg-white/48 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5'

  const updateCardClass = hasBackendUpdate
    ? (appearance === 'night_sail'
        ? 'bg-sky-500/10 border-sky-300/60 text-sky-900 dark:bg-sky-900/30 dark:border-sky-700/40 dark:text-sky-100 hover:bg-sky-500/15 dark:hover:bg-sky-900/40'
        : 'bg-amber-400/12 border-amber-300/70 text-amber-900 dark:bg-amber-900/28 dark:border-amber-700/45 dark:text-amber-100 hover:bg-amber-400/18 dark:hover:bg-amber-900/38')
    : (appearance === 'night_sail'
        ? 'bg-white/48 border-white/60 text-slate-700 dark:bg-slate-900/46 dark:border-slate-700/55 dark:text-slate-200 hover:bg-white/65 dark:hover:bg-slate-800/60'
        : 'bg-white/48 border-white/70 text-slate-600 dark:bg-white/5 dark:border-white/10 dark:text-slate-300 hover:bg-white/65 dark:hover:bg-white/10')

  // 智能判断是否可以手动切换侧边栏
  const canToggleSidebar = windowWidth >= 1024
  const isTabletSize = windowWidth >= 768 && windowWidth < 1024
  const isMobileSize = windowWidth < 768

  const handleToggleCollapse = () => {
    // 只在桌面模式允许切换
    if (canToggleSidebar && onToggleCollapse) {
      onToggleCollapse()
    }
  }

  const navItems = [
    {
      id: '#containers',
      label: '容器',
      icon: Server,
    },
    {
      id: '#images',
      label: '镜像',
      icon: Box,
    },
    {
      id: '#bot',
      label: '配置',
      icon: Bot,
    },
    {
      id: '#backups',
      label: '备份',
      icon: DatabaseBackup,
    },
    {
      id: '#logs',
      label: '日志',
      icon: FileText,
    },
    {
      id: '#about',
      label: '关于',
      icon: Info,
    },
  ]

  return (
    <>
      {/* 顶部导航栏 - 仅在手机模式（sm）显示 */}
      {windowWidth < 768 && (
        <div className="fixed top-0 left-0 right-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-3 sm:px-4 z-40 shadow-sm" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: '0.875rem', height: 'calc(3.5rem + env(safe-area-inset-top))' }}>
          {/* 左侧：Logo 和项目信息 */}
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity active:scale-95 rounded-lg group"
            title="打开菜单"
          >
            <img
              src={logoImg}
              alt="菜单"
              className="h-6 w-6 sm:h-7 sm:w-7 rounded-lg object-cover border-0"
            />
            <div className="flex items-center gap-1">
              <span className="text-sm font-semibold text-gray-900 dark:text-white">Docker Copilot</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">{displayVersion(backendVersion)}</span>
            </div>
          </button>

          {/* 右侧：主题切换和退出登录 */}
          <div className="flex items-center gap-1">
            <ThemeToggle collapsed={false} />
            <button
              onClick={onLogout}
              className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors active:scale-95"
              title="退出登录"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {/* 添加顶部导航栏的占位符 - 仅在手机模式显示 */}
      {windowWidth < 768 && <div style={{ height: 'calc(3.5rem + env(safe-area-inset-top))' }} />}

      {/* 侧边栏遮罩 - 仅在手机菜单打开时显示 */}
      {windowWidth < 768 && isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* 侧边栏 */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 shadow-xl lg:shadow-none transform transition-all duration-300 ease-in-out flex flex-col backdrop-blur-xl",
          isCollapsed ? "w-20" : "w-64 sm:w-72 md:w-64",
          windowWidth < 768
            ? (isMobileMenuOpen ? "translate-x-0" : "-translate-x-full")
            : "translate-x-0",
          "max-h-screen overflow-y-auto border-r",
          windowWidth < 768 ? "top-14" : "top-0",
          sidebarSurface
        )}
      >
        <div className="flex flex-col h-full">
          {/* 头部 - 现代卡片设计 (仅在非手机模式显示) */}
          {isMobileSize === false && (
            <div className={cn("p-4 sm:p-5 flex-shrink-0", isCollapsed ? 'pb-3' : 'pb-1')}>
              <div className={cn("flex items-start", isCollapsed ? "justify-center" : "justify-between gap-3")}>
                <button
                  onClick={handleToggleCollapse}
                  disabled={!canToggleSidebar}
                  className={cn(
                    "flex items-center transition-all duration-300 group",
                    !canToggleSidebar ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:opacity-80",
                    isCollapsed ? "justify-center" : "space-x-3 min-w-0 flex-1"
                  )}
                  title={
                    isMobileSize ? "手机模式" :
                      isTabletSize ? "平板模式（自动收缩）" :
                        isCollapsed ? "展开侧边栏" : "收起侧边栏"
                  }
                >
                  <div className="flex-shrink-0 relative">
                    <img
                      src={logoImg}
                      alt="Docker Copilot"
                      className="h-9 w-9 sm:h-11 sm:w-11 rounded-xl object-cover shadow-md group-hover:shadow-lg group-hover:scale-110 transition-all duration-200 border-0"
                    />
                  </div>
                  {!isCollapsed && isMobileSize === false && (
                    <div className="text-left transition-all duration-300 min-w-0 flex-1">
                      <h1 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">Docker Copilot</h1>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">容器管理平台</p>
                    </div>
                  )}
                </button>

                {canToggleSidebar && isCollapsed && (
                  <button
                    onClick={handleToggleCollapse}
                    className={cn(
                      'absolute left-0 bottom-0 flex h-14 w-full items-center justify-center border-t transition-colors',
                      appearance === 'night_sail'
                        ? 'border-slate-200/80 bg-white/55 text-slate-500 hover:bg-white/75 hover:text-slate-700 dark:border-slate-700/70 dark:bg-slate-900/55 dark:text-slate-400 dark:hover:bg-slate-800/75 dark:hover:text-slate-200'
                        : 'border-white/70 bg-white/45 text-slate-500 hover:bg-white/65 hover:text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-200'
                    )}
                    title="展开侧边栏"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 分割线 */}
          <div className="px-4 sm:px-5">
            <div className="h-px bg-gradient-to-r from-transparent via-gray-200 dark:via-gray-700 to-transparent" />
          </div>

          {/* 导航菜单 */}
          <nav className={cn("flex-1 overflow-y-auto", isCollapsed ? "px-2.5 py-5" : "px-3 sm:px-4 py-5 sm:py-6")}>
            <ul className={cn(isCollapsed ? 'space-y-3' : 'space-y-1')}>
              {navItems.map((item, index) => {
                const Icon = item.icon
                const isActive = activeTab === item.id
                return (
                  <li key={item.id}>
                    <button
                      onClick={() => {
                        onTabChange(item.id)
                        setIsMobileMenuOpen(false)
                      }}
                      className={cn(
                        "w-full flex items-center rounded-xl text-left transition-all duration-200 group active:scale-95 relative overflow-hidden",
                        isCollapsed ? "justify-center h-14 w-14 mx-auto" : "space-x-3 px-3 sm:px-4 py-2.5 sm:py-3",
                        isActive
                          ? navItemActive
                          : navItemBase
                      )}
                      title={isCollapsed ? item.label : undefined}
                    >
                      {/* 左侧指示条 */}
                      {isActive && !isCollapsed && (
                        <div className="absolute left-0 top-0 bottom-0 w-1" />
                      )}

                      <Icon className={cn(
                        "flex-shrink-0 transition-all duration-200",
                        isCollapsed ? "h-6 w-6" : "h-5 w-5",
                        isActive && "scale-110"
                      )} />
                      {!isCollapsed && (
                        <span className="truncate text-sm sm:text-base font-medium">{item.label}</span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </nav>

          {/* 底部操作区 - 所有尺寸都显示 */}
          <div className={cn("flex flex-col flex-shrink-0", isCollapsed ? "px-2.5 pb-[72px] pt-0" : "p-4 sm:p-5 pb-[92px]")}>
            {/* 分割线 */}
            <div className="mb-4">
              <div className="h-px bg-gradient-to-r from-transparent via-gray-200 dark:via-gray-700 to-transparent" />
            </div>

            {/* 操作按钮 */}
            <div className={cn(
              "flex items-stretch gap-2 mb-4",
              isCollapsed ? "flex-col items-center pt-1 gap-2.5" : "justify-between"
            )}>
              {isCollapsed ? (
                <>
                  <button
                    onClick={() => setShowUpdatePrompt(true)}
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-200 group active:scale-95",
                      hasBackendUpdate
                        ? "text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                        : "text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700/60"
                    )}
                    title={hasBackendUpdate ? '发现新版本，点击查看更新' : '当前已是最新版本'}
                  >
                    <ArrowUpCircle className={cn("h-4.5 w-4.5 flex-shrink-0", hasBackendUpdate && 'animate-pulse')} />
                  </button>
                  <div className="flex h-auto w-9 items-center justify-center">
                    <ThemeToggle collapsed />
                  </div>
                  <button
                    onClick={onLogout}
                    className="flex h-9 w-9 items-center justify-center transition-all duration-200 group active:scale-95 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                    title="退出登录"
                  >
                    <LogOut className="h-4.5 w-4.5 flex-shrink-0 group-hover:rotate-12 transition-transform duration-300" />
                  </button>
                </>
              ) : (
                <div className={cn("w-full px-4 py-2.5", softPanel)}>
                  <div className="flex items-center gap-4">
                    <div className="inline-flex w-[18px] flex-shrink-0" />
                    <div className="flex items-center gap-4">
                      <ThemeToggle embedded />
                      <button
                        onClick={onLogout}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-red-600 transition-all duration-200 hover:bg-white/65 hover:text-red-700 dark:text-red-400 dark:hover:bg-white/10 dark:hover:text-red-300 group active:scale-95"
                        title="退出登录"
                      >
                        <LogOut className="h-5 w-5 flex-shrink-0 group-hover:rotate-12 transition-transform duration-300" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 版本信息部分 */}
            {isCollapsed ? null : (
              // 展开状态 - 完整卡片
              <div className="space-y-4 pb-16">
                {/* 版本信息卡片 - 现代卡片风格 */}
                <div className={cn(
                  'rounded-2xl overflow-hidden shadow-sm border transition-all duration-300',
                  softPanel
                )}>

                  {/* 主要信息区 */}
                  <div className="px-4 py-4 space-y-3.5">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="inline-flex min-w-0 items-center gap-1.5 font-medium text-gray-600 dark:text-gray-400">
                        <ShieldCheck className="h-3.5 w-3.5 flex-shrink-0" />
                        <span>后端版本</span>
                      </span>
                      <span className="max-w-[132px] truncate text-xs font-semibold text-gray-800 dark:text-gray-100" title={displayVersion(backendVersion)}>
                        {displayVersion(backendVersion)}
                      </span>
                    </div>

                    {/* 开发人员 - 分段显示 */}
                    <div className="space-y-2 pt-1 border-t border-primary-200/50 dark:border-primary-700/50">
                      <button
                        onClick={() => setIsDevInfoExpanded(!isDevInfoExpanded)}
                        className="flex items-center justify-between w-full py-1.5 px-0 rounded-lg transition-colors hover:bg-primary-100/50 dark:hover:bg-primary-900/20"
                      >
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-gray-300">
                          <span className="inline-flex w-[14px] justify-center">👥</span>
                          <span>开发团队</span>
                        </span>
                        {isDevInfoExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5 text-primary-600 dark:text-primary-400" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-gray-400 dark:text-gray-600" />
                        )}
                      </button>

                      {isDevInfoExpanded && (
                        <div className="animate-in fade-in slide-in-from-top-2 duration-200 grid grid-cols-2 gap-2 pt-2">
                          <div className="rounded-xl p-3 bg-white/55 dark:bg-white/5 border border-white/70 dark:border-white/10 shadow-sm transition-shadow">
                            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1.5">🎨 前端</p>
                            <p className="font-bold text-gray-900 dark:text-white text-sm">DongShu</p>
                          </div>
                          <div className="rounded-xl p-3 bg-white/55 dark:bg-white/5 border border-white/70 dark:border-white/10 shadow-sm transition-shadow">
                            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1.5">⚙️ 后端</p>
                            <p className="font-bold text-gray-900 dark:text-white text-sm">onlyLTY</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 构建信息 */}
                    <div className="space-y-2 pt-2 border-t border-primary-200/50 dark:border-primary-700/50 text-xs">
                      {buildDate && (
                        <div className="flex items-center justify-between gap-2 py-1">
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 flex-shrink-0">
                            <span className="inline-flex w-[14px] justify-center">🛠</span>
                            <span>构建日期</span>
                          </span>
                          <span className="font-medium text-gray-700 dark:text-gray-300 text-right text-xs flex-shrink-0" title={formatVersionBuildDate(buildDate)}>
                            {formatVersionBuildDate(buildDate).split(' ')[0]}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="border-t border-primary-200/40 dark:border-primary-700/40 pt-2">
                      <button
                        onClick={() => setShowUpdatePrompt(true)}
                        className={cn(
                          'w-full rounded-xl px-0 py-1.5 text-left transition-all duration-200 hover:bg-white/65 dark:hover:bg-white/10',
                          hasBackendUpdate
                            ? 'text-amber-800 dark:text-amber-200'
                            : 'text-gray-600 dark:text-gray-300'
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="inline-flex items-center gap-1.5 text-xs font-medium flex-wrap">
                              <span className={cn('inline-flex w-[14px] justify-center', hasBackendUpdate ? 'text-amber-500' : 'text-gray-400 dark:text-gray-500')}>
                                <ArrowUpCircle className={cn('h-3.5 w-3.5', hasBackendUpdate && 'animate-pulse')} />
                              </span>
                              <span>{hasBackendUpdate ? '检测到更新' : '已是最新'}</span>
                              <span className={cn('text-[11px] font-normal', hasBackendUpdate ? 'text-amber-700/90 dark:text-amber-300/90' : 'text-gray-500 dark:text-gray-400')}>
                                · {hasBackendUpdate ? '点击查看并更新' : '点击手动更新'}
                              </span>
                            </div>
                          </div>
                          {hasBackendUpdate && (
                            <span className="text-[11px] font-medium text-amber-600 dark:text-amber-300">{remoteVersion ? `→ ${displayVersion(remoteVersion)}` : ''}</span>
                          )}
                        </div>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {canToggleSidebar && !isCollapsed && isMobileSize === false && (
        <div className="fixed left-0 bottom-0 z-[60] w-64 sm:w-72 md:w-64 p-4 sm:p-5 pointer-events-none">
          <button
            onClick={handleToggleCollapse}
            className={cn(
              'pointer-events-auto w-full rounded-2xl border px-4 py-3 shadow-sm transition-colors',
              appearance === 'night_sail'
                ? 'border-slate-200/80 bg-white/55 text-slate-700 hover:bg-white/75 hover:text-slate-900 dark:border-slate-700/70 dark:bg-slate-900/55 dark:text-slate-200 dark:hover:bg-slate-800/75 dark:hover:text-white'
                : 'border-white/70 bg-white/45 text-slate-700 hover:bg-white/65 hover:text-slate-900 dark:border-white/10 dark:bg-white/10 dark:text-slate-300 dark:hover:bg-white/15 dark:hover:text-white'
            )}
            title="收起侧边栏"
          >
            <div className="flex items-center gap-3 text-sm font-medium">
              <ChevronLeft className="h-4 w-4 flex-shrink-0" />
              <span>收起侧边栏</span>
            </div>
          </button>
        </div>
      )}


      {/* 版本更新提示弹窗 */}
      <UpdatePrompt
        isVisible={showUpdatePrompt}
        onClose={() => setShowUpdatePrompt(false)}
        backendVersion={backendVersion}
        remoteVersion={remoteVersion}
        hasBackendUpdate={hasBackendUpdate}
        onUpdateBackend={updateBackend}
        onForceUpdateBackend={forceUpdateBackend}
        showForceUpdate={showForceUpdate}
        isUpdating={isUpdating}
        updateMessage={updateMessage}
        updateProgress={updateProgress}
        isReconnectChecking={isReconnectChecking}
        postUpdateNeedsRefresh={postUpdateNeedsRefresh}
        onRefreshNow={checkForUpdates}
        onUploadProgram={uploadProgramUpdate}
      />
    </>
  )
}

// 手机底部导航栏组件
export function MobileBottomNav({ activeTab, onTabChange, windowWidth = 1024 }) {
  const navItems = [
    {
      id: '#containers',
      label: '容器',
      icon: Server,
    },
    {
      id: '#images',
      label: '镜像',
      icon: Box,
    },
    {
      id: '#bot',
      label: '配置',
      icon: Bot,
    },
    {
      id: '#backups',
      label: '备份',
      icon: DatabaseBackup,
    },
    {
      id: '#logs',
      label: '日志',
      icon: FileText,
    },
    {
      id: '#about',
      label: '关于',
      icon: Info,
    },
  ]

  return (
    <>
      {windowWidth < 768 && (
        <nav
          className="fixed left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full z-40 shadow-lg transition-all duration-300"
          style={{
            bottom: 'env(safe-area-inset-bottom, 0.5rem)',
            paddingBottom: '0.5rem'
          }}
        >
          <div className="flex items-center justify-around px-3 py-3.5 gap-2">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = activeTab === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 py-2.5 px-3 rounded-full transition-all duration-200 active:scale-95 flex-1",
                    isActive
                      ? "text-primary-600 dark:text-primary-400 bg-primary-100 dark:bg-primary-900/40"
                      : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/50"
                  )}
                  title={item.label}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  <span className="text-xs font-medium">{item.label}</span>
                </button>
              )
            })}
          </div>
        </nav>
      )}
    </>
  )
}
