import React from 'react'
import {
  Box,
  LogOut,
  Menu,
  X,
  Server,
  Image,
  Store,
  Network,
  Info,
  Bot,
  FileText,
  ChevronRight,
  ChevronLeft,
  Smartphone,
  ArrowUpCircle,
  RotateCcw,
  Minimize2,
  Power
} from 'lucide-react'
import { ThemeToggle } from './ThemeToggle.jsx'
import { UpdatePrompt } from './UpdatePrompt.jsx'
import { cn } from '../utils/cn.js'
import logoImg from '../assets/DockerCopilot-logo.png'
import { useVersionCheck } from '../hooks/useVersionCheck.js'
import { useTheme } from '../hooks/useTheme.jsx'

export function Sidebar({ activeTab, onTabChange, onLogout, isCollapsed = false, onToggleCollapse, windowWidth = 1024 }) {
  const { appearance, theme, setTheme, setAppearance } = useTheme()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false)
  const version = useVersionCheck()

  const sidebarSurface = cn(
    appearance === 'aurora' && 'bg-[linear-gradient(180deg,rgba(255,255,255,0.82)_0%,rgba(248,250,255,0.88)_100%)] dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.92)_0%,rgba(17,24,39,0.96)_100%)] border-primary-100/70 dark:border-primary-900/40',
    appearance === 'manager_green' && 'bg-[linear-gradient(180deg,rgba(255,255,255,0.9)_0%,rgba(244,248,247,0.96)_100%)] dark:bg-[linear-gradient(180deg,rgba(7,19,18,0.96)_0%,rgba(15,31,29,0.98)_100%)] border-teal-100/80 dark:border-teal-900/40',
    appearance === 'night_sail' && 'bg-[linear-gradient(180deg,rgba(241,245,249,0.92)_0%,rgba(226,232,240,0.96)_100%)] dark:bg-[linear-gradient(180deg,rgba(2,6,23,0.95)_0%,rgba(15,23,42,0.98)_100%)] border-slate-200/80 dark:border-slate-800/70',
    appearance === 'mist' && 'bg-[linear-gradient(180deg,rgba(255,255,255,0.86)_0%,rgba(244,244,245,0.94)_100%)] dark:bg-[linear-gradient(180deg,rgba(17,24,39,0.92)_0%,rgba(15,23,42,0.96)_100%)] border-stone-200/80 dark:border-slate-700/60'
  )

  const navItemBase = appearance === 'aurora'
    ? 'text-slate-700 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-white/5'
    : appearance === 'manager_green'
      ? 'text-slate-700 dark:text-slate-200 hover:bg-teal-50/80 dark:hover:bg-teal-900/20'
    : appearance === 'night_sail'
      ? 'text-slate-700 dark:text-slate-200 hover:bg-white/55 dark:hover:bg-sky-900/25'
      : 'text-slate-700 dark:text-slate-300 hover:bg-white/75 dark:hover:bg-white/5'

  const navItemActive = appearance === 'aurora'
    ? 'bg-white/82 dark:bg-primary-900/22 text-primary-700 dark:text-primary-300 font-semibold shadow-sm border border-primary-100/70 dark:border-primary-800/50'
    : appearance === 'manager_green'
      ? 'bg-teal-50 dark:bg-teal-950/35 text-teal-700 dark:text-teal-300 font-semibold shadow-sm border border-teal-100/80 dark:border-teal-800/50'
    : appearance === 'night_sail'
      ? 'bg-white/72 dark:bg-sky-900/24 text-sky-700 dark:text-sky-300 font-semibold shadow-sm border border-sky-100/70 dark:border-sky-800/40'
      : 'bg-white/88 dark:bg-slate-800/55 text-slate-700 dark:text-slate-100 font-semibold shadow-sm border border-stone-200/80 dark:border-slate-700/70'

  const softPanel = appearance === 'aurora'
    ? 'rounded-2xl border border-white/70 bg-white/42 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5'
    : appearance === 'manager_green'
      ? 'rounded-2xl border border-teal-100/80 bg-white/58 shadow-sm backdrop-blur dark:border-teal-900/35 dark:bg-teal-950/16'
    : appearance === 'night_sail'
      ? 'rounded-2xl border border-white/45 bg-white/35 shadow-sm backdrop-blur dark:border-sky-900/30 dark:bg-slate-900/45'
      : 'rounded-2xl border border-white/75 bg-white/48 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5'

  // 智能判断是否可以手动切换侧边栏
  const canToggleSidebar = windowWidth >= 1024
  const isTabletSize = windowWidth >= 768 && windowWidth < 1024
  const isMobileSize = windowWidth < 768
  const isUltraNarrowMobile = windowWidth < 360
  const isCompactMobileHeader = windowWidth < 420

  const handleToggleCollapse = () => {
    // 只在桌面模式允许切换
    if (canToggleSidebar && onToggleCollapse) {
      onToggleCollapse()
    }
  }

  const cycleAppearance = () => {
    const presets = ['aurora', 'manager_green', 'night_sail', 'mist']
    const index = presets.indexOf(appearance)
    setAppearance(presets[(index + 1) % presets.length])
  }

  const cycleMode = () => {
    const presets = ['light', 'dark', 'system']
    const index = presets.indexOf(theme)
    setTheme(presets[(index + 1) % presets.length])
  }

  const toolButtonClass = 'inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-transparent bg-transparent text-slate-500 shadow-none transition-all hover:border-slate-200 hover:bg-white/90 hover:text-slate-800 hover:shadow-sm disabled:opacity-50 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:bg-slate-900/80 dark:hover:text-slate-100'

  const navItems = [
    { id: '#overview', label: '概览', icon: Box },
    { id: '#containers', label: '容器', icon: Server },
    { id: '#images', label: '镜像', icon: Image },
    { id: '#store', label: '商店', icon: Store },
    { id: '#networks', label: '网络', icon: Network },
    { id: '#settings', label: '设置', icon: Bot },
    { id: '#logs', label: '日志', icon: FileText },
    { id: '#about', label: '关于', icon: Info },
  ]
  return (
    <>
      {/* 顶部导航栏 - 仅在手机模式（sm）显示 */}
      {windowWidth < 768 && (
        <div className="fixed top-0 left-0 right-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-2 px-2.5 sm:px-4 z-40 shadow-sm" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: '0.875rem', height: 'calc(3.5rem + env(safe-area-inset-top))' }}>
          {/* 左侧：Logo 和项目信息 */}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <button
              onClick={() => setIsMobileMenuOpen(prev => !prev)}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-700 transition-colors active:scale-95 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700/70"
              title={isMobileMenuOpen ? '关闭导航' : '打开导航'}
              aria-label={isMobileMenuOpen ? '关闭导航' : '打开导航'}
            >
              {isMobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
            <img
              src={logoImg}
              alt="菜单"
              className="h-6 w-6 sm:h-7 sm:w-7 rounded-lg object-cover border-0"
            />
            <div className="min-w-0 flex items-center gap-1 overflow-hidden">
              <span className="truncate text-sm font-semibold text-gray-900 dark:text-white">Docker Copilot</span>
            </div>
          </div>

          {/* 右侧：手机端跳转、主题切换和退出登录 */}
          <div className="ml-1 flex shrink-0 items-center gap-0.5">
            <button
              onClick={() => window.location.assign('./m')}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-sky-600 transition-colors active:scale-95 hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-sky-900/20"
              title="切换到手机端页面"
            >
              <Smartphone className="h-4 w-4" />
            </button>
            {!isCompactMobileHeader && !isUltraNarrowMobile && <ThemeToggle embedded />}
            {!isCompactMobileHeader && (
              <button
                onClick={onLogout}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-red-600 transition-colors active:scale-95 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                title="退出登录"
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
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
            ? isMobileMenuOpen
              ? "translate-x-0 w-[72vw] max-w-[320px]"
              : "-translate-x-full w-[72vw] max-w-[320px]"
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
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="flex-shrink-0">
                    <button
                      onClick={handleToggleCollapse}
                      className={cn(
                        'block rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400/40 transition-opacity duration-200',
                        canToggleSidebar ? 'cursor-pointer hover:opacity-85' : 'cursor-default'
                      )}
                      title={isCollapsed ? '展开侧边栏' : '收缩侧边栏'}
                    >
                      <img
                        src={logoImg}
                        alt="Docker Copilot"
                        className="h-9 w-9 sm:h-11 sm:w-11 rounded-xl object-cover shadow-md transition-all duration-200 border-0"
                      />
                    </button>
                  </div>
                  {!isCollapsed && isMobileSize === false && (
                    <div className="text-left transition-all duration-300 min-w-0 flex-1">
                      <h1 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">Docker Copilot</h1>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">容器管理平台</p>
                    </div>
                  )}
                </div>

                {canToggleSidebar && isCollapsed && (
                  <button
                    onClick={handleToggleCollapse}
                    className={cn(
                      'absolute left-0 bottom-0 flex h-14 w-full items-center justify-center border-t transition-colors',
                      appearance === 'night_sail'
                        ? 'border-slate-200/80 bg-transparent text-slate-500 hover:bg-transparent hover:text-slate-700 dark:border-slate-700/70 dark:bg-transparent dark:text-slate-400 dark:hover:bg-transparent dark:hover:text-slate-200'
                        : 'border-white/70 bg-transparent text-slate-500 hover:bg-transparent hover:text-slate-700 dark:border-white/10 dark:bg-transparent dark:text-slate-400 dark:hover:bg-transparent dark:hover:text-slate-200'
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
                const isActive = activeTab === item.id || String(activeTab || '').startsWith(`${item.id}/`)
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

          {/* 底部工具 */}
          {!isCollapsed && (
            <div className="px-4 sm:px-5 pb-3">
              <div className="grid grid-cols-5 gap-2">
                <button
                  onClick={handleToggleCollapse}
                  disabled={!canToggleSidebar}
                  className={toolButtonClass}
                  title="收起侧边栏"
                >
                  <Minimize2 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => version.setShowUpdatePrompt(true)}
                  className={cn(toolButtonClass, version.hasBackendUpdate && 'text-amber-600 hover:border-amber-200 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/30')}
                  title={version.hasBackendUpdate ? '发现新版本' : '程序更新'}
                >
                  <ArrowUpCircle className={cn('h-4 w-4', version.hasBackendUpdate && 'animate-pulse')} />
                </button>
                <button
                  onClick={cycleAppearance}
                  className={toolButtonClass}
                  title="切换主题"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
                <button
                  onClick={cycleMode}
                  className={toolButtonClass}
                  title="切换明暗配色"
                >
                  <span className="h-4 w-4 rounded-full border border-current bg-[linear-gradient(90deg,currentColor_0_50%,transparent_50%)]" />
                </button>
                <button
                  onClick={onLogout}
                  className={cn(toolButtonClass, 'hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:hover:border-red-900/60 dark:hover:bg-red-950/30 dark:hover:text-red-300')}
                  title="退出登录"
                >
                  <Power className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      <UpdatePrompt
        isVisible={version.showUpdatePrompt}
        onClose={() => version.setShowUpdatePrompt(false)}
        backendVersion={version.backendVersion}
        remoteVersion={version.remoteVersion}
        hasBackendUpdate={version.hasBackendUpdate}
        onUpdateBackend={version.updateBackend}
        onForceUpdateBackend={version.forceUpdateBackend}
        showForceUpdate={version.showForceUpdate}
        isUpdating={version.isUpdating}
        updateMessage={version.updateMessage}
        updateProgress={version.updateProgress}
        isReconnectChecking={version.isReconnectChecking}
        postUpdateNeedsRefresh={version.postUpdateNeedsRefresh}
        onRefreshNow={version.checkForUpdates}
        onUploadProgram={version.uploadProgramUpdate}
      />

    </>
  )
}

// 手机底部导航栏组件
export function MobileBottomNav({ activeTab, onTabChange, windowWidth = 1024 }) {
  const navItems = [
    { id: '#overview', label: '概览', icon: Box },
    { id: '#containers', label: '容器', icon: Server },
    { id: '#images', label: '镜像', icon: Image },
    { id: '#store', label: '商店', icon: Store },
    { id: '#networks', label: '网络', icon: Network },
    { id: '#settings', label: '设置', icon: Bot },
  ]

  return (
    <>
      {windowWidth < 768 && (
        <nav
          className="fixed left-1/2 -translate-x-1/2 z-40 w-[calc(100%-0.5rem)] max-w-md rounded-[1.75rem] border border-gray-200/90 bg-white/95 shadow-xl backdrop-blur dark:border-gray-700/80 dark:bg-gray-800/95 transition-all duration-300"
          style={{ bottom: 'max(env(safe-area-inset-bottom), 0.35rem)' }}
        >
          <div className="grid grid-cols-6 items-center gap-1 px-2 py-2">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = activeTab === item.id || String(activeTab || '').startsWith(`${item.id}/`)
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={cn(
                    'flex min-w-0 items-center justify-center rounded-2xl px-1 py-2 transition-all duration-200 active:scale-95',
                    isActive
                      ? 'bg-primary-100 text-primary-700 shadow-sm dark:bg-primary-900/35 dark:text-primary-300'
                      : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700/60 dark:hover:text-gray-200'
                  )}
                  title={item.label}
                  aria-label={item.label}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                </button>
              )
            })}
          </div>
        </nav>
      )}
    </>
  )
}
