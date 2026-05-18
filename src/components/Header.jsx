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
  NotebookText,
  ChevronDown,
  ChevronRight
} from 'lucide-react'
import { ThemeToggle } from './ThemeToggle.jsx'
import { UpdatePrompt } from './UpdatePrompt.jsx'
import { cn } from '../utils/cn.js'
import logoImg from '../assets/DockerCopilot-logo.png'
import { useVersionCheck } from '../hooks/useVersionCheck.js'

export function Sidebar({ activeTab, onTabChange, onLogout, isCollapsed = false, onToggleCollapse, windowWidth = 1024 }) {
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
    updateBackend,
    checkForUpdates
  } = useVersionCheck()

  const displayVersion = (value) => {
    const raw = String(value || '2.1.3').trim()
    return raw.startsWith('v') ? raw : `v${raw}`
  }

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
      id: '#backups',
      label: '备份',
      icon: DatabaseBackup,
    },
    {
      id: '#bot',
      label: '交互',
      icon: Bot,
    },
    {
      id: '#logs',
      label: '日志',
      icon: NotebookText,
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
          "fixed inset-y-0 left-0 z-50 bg-white dark:bg-gray-800 shadow-xl lg:shadow-none transform transition-all duration-300 ease-in-out flex flex-col",
          isCollapsed ? "w-20" : "w-64 sm:w-72 md:w-64",
          // 手机模式：根据菜单打开状态显示/隐藏；md及以上：始终显示
          windowWidth < 768
            ? (isMobileMenuOpen ? "translate-x-0" : "-translate-x-full")
            : "translate-x-0",
          "max-h-screen overflow-y-auto",
          // 手机模式距顶部导航栏下方，其他模式从顶部开始
          windowWidth < 768 ? "top-14" : "top-0",
          "border-r border-gray-200 dark:border-gray-700"
        )}
      >
        <div className="flex flex-col h-full">
          {/* 头部 - 现代卡片设计 (仅在非手机模式显示) */}
          {isMobileSize === false && (
            <div className="p-4 sm:p-5 flex-shrink-0">
              <button
                onClick={handleToggleCollapse}
                disabled={!canToggleSidebar}
                className={cn(
                  "w-full flex items-center transition-all duration-300 group",
                  !canToggleSidebar ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:opacity-80",
                  isCollapsed ? "justify-center" : "space-x-3"
                )}
                title={
                  isMobileSize ? "手机模式" :
                    isTabletSize ? "平板模式（自动收缩）" :
                      isCollapsed ? "展开侧边栏" : "收起侧边栏"
                }
              >
                <div className="flex-shrink-0">
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
            </div>
          )}

          {/* 分割线 */}
          <div className="px-4 sm:px-5">
            <div className="h-px bg-gradient-to-r from-transparent via-gray-200 dark:via-gray-700 to-transparent" />
          </div>

          {/* 导航菜单 */}
          <nav className={cn("flex-1 py-6 sm:py-8 overflow-y-auto space-y-2", isCollapsed ? "px-2.5" : "px-3 sm:px-4")}>
            <ul className="space-y-0.5">
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
                        "w-full flex items-center rounded-lg text-left transition-all duration-200 group active:scale-95 relative overflow-hidden",
                        isCollapsed ? "justify-center p-2.5 sm:p-3" : "space-x-3 px-3 sm:px-4 py-2.5 sm:py-3",
                        isActive
                          ? "bg-gradient-to-r from-primary-50 to-primary-100/50 dark:from-primary-900/30 dark:to-primary-900/10 text-primary-700 dark:text-primary-300 font-semibold shadow-sm"
                          : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50"
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
          <div className={cn("flex flex-col flex-shrink-0", isCollapsed ? "p-2.5" : "p-4 sm:p-5")}>
            {/* 分割线 */}
            <div className="mb-4">
              <div className="h-px bg-gradient-to-r from-transparent via-gray-200 dark:via-gray-700 to-transparent" />
            </div>

            {/* 操作按钮 */}
            <div className={cn(
              "flex items-stretch gap-2 mb-4",
              isCollapsed ? "flex-col" : "justify-between"
            )}>
              {isCollapsed ? (
                <>
                  <ThemeToggle collapsed={isCollapsed} />
                  <button
                    onClick={onLogout}
                    className="flex items-center justify-center gap-2 transition-all duration-200 group active:scale-95 p-2.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg w-full"
                    title="退出登录"
                  >
                    <LogOut className="h-4 w-4 flex-shrink-0 group-hover:rotate-12 transition-transform duration-300" />
                  </button>
                </>
              ) : (
                <div className="flex items-stretch gap-2 w-full rounded-xl bg-gray-100 dark:bg-gray-800 p-1">
                  <ThemeToggle collapsed={false} embedded />
                  <button
                    onClick={onLogout}
                    className="flex items-center justify-center gap-2 px-3 py-2.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg flex-1 min-w-0 transition-all duration-200 group active:scale-95"
                    title="退出登录"
                  >
                    <LogOut className="h-4 w-4 flex-shrink-0 group-hover:rotate-12 transition-transform duration-300" />
                    <span className="text-xs sm:text-sm font-medium whitespace-nowrap">退出</span>
                  </button>
                </div>
              )}
            </div>

            {/* 版本信息部分 */}
            {isCollapsed ? (
              // 收起状态 - 竖向堆叠的迷你卡片
              <div className="space-y-2">
                {/* 状态指示 */}
                <div className="flex justify-center">
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 group hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-all duration-200 cursor-help" title={`在线 - ${displayVersion(backendVersion)}`}>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  </span>
                </div>

                {/* 开发人员 */}
                <button
                  onClick={() => setIsDevInfoExpanded(!isDevInfoExpanded)}
                  className="flex justify-center w-full"
                  title={isDevInfoExpanded ? "隐藏开发人员" : "显示开发人员"}
                >
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-900/30 hover:bg-primary-200 dark:hover:bg-primary-900/50 transition-all duration-200">
                    <span className="text-xs font-bold text-primary-600 dark:text-primary-400">👥</span>
                  </span>
                </button>

                {/* 更新提示 */}
                {hasBackendUpdate && (
                  <button
                    onClick={() => setShowUpdatePrompt(true)}
                    className="flex justify-center w-full"
                    title="有新版本"
                  >
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-all duration-200 animate-pulse">
                      <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                    </span>
                  </button>
                )}
              </div>
            ) : (
              // 展开状态 - 完整卡片
              <div className="space-y-3">
                {/* 版本信息卡片 - 现代卡片风格 */}
                <div className="rounded-2xl overflow-hidden shadow-md bg-gradient-to-br from-primary-500/10 via-transparent to-purple-500/10 dark:from-primary-600/10 dark:via-transparent dark:to-purple-600/10 border border-primary-200/50 dark:border-primary-700/50 transition-all duration-300 hover:shadow-lg hover:border-primary-300/70 dark:hover:border-primary-600/70">

                  {/* 主要信息区 */}
                  <div className="px-4 py-4 space-y-4">
                    {/* 版本 */}
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">后端版本</span>
                      <span className="text-lg font-bold bg-gradient-to-r from-primary-600 to-purple-600 dark:from-primary-400 dark:to-purple-400 bg-clip-text text-transparent">
                        {displayVersion(backendVersion)}
                      </span>
                    </div>

                    {/* 开发人员 - 分段显示 */}
                    <div className="space-y-2 pt-1 border-t border-primary-200/50 dark:border-primary-700/50">
                      <button
                        onClick={() => setIsDevInfoExpanded(!isDevInfoExpanded)}
                        className="flex items-center justify-between w-full py-2 px-2 -mx-2 rounded-lg transition-colors hover:bg-primary-100/50 dark:hover:bg-primary-900/20"
                      >
                        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                          <span>👥</span>
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
                          <div className="rounded-xl p-3 bg-white dark:bg-gray-800/70 border border-blue-200 dark:border-blue-800/50 shadow-sm hover:shadow-md transition-shadow">
                            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1.5">🎨 前端</p>
                            <p className="font-bold text-gray-900 dark:text-white text-sm">DongShu</p>
                          </div>
                          <div className="rounded-xl p-3 bg-white dark:bg-gray-800/70 border border-purple-200 dark:border-purple-800/50 shadow-sm hover:shadow-md transition-shadow">
                            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1.5">⚙️ 后端</p>
                            <p className="font-bold text-gray-900 dark:text-white text-sm">onlyLTY</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 构建信息 */}
                    <div className="space-y-2.5 pt-2.5 border-t border-primary-200/50 dark:border-primary-700/50 text-xs">
                      {buildDate && (
                        <div className="flex items-center justify-between gap-2 py-1">
                          <span className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400 flex-shrink-0">
                            <span>🔨</span>
                            <span>构建日期</span>
                          </span>
                          <span className="font-semibold text-gray-700 dark:text-gray-300 text-right text-xs flex-shrink-0" title={formatVersionBuildDate(buildDate)}>
                            {formatVersionBuildDate(buildDate).split(' ')[0]}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* 更新提示 */}
                    {hasBackendUpdate && (
                      <button
                        onClick={() => setShowUpdatePrompt(true)}
                        className="w-full py-2.5 px-3 mt-1 rounded-lg bg-gradient-to-r from-amber-400/20 to-orange-400/20 dark:from-amber-900/30 dark:to-orange-900/30 border border-amber-300 dark:border-amber-700/50 text-amber-700 dark:text-amber-300 hover:from-amber-400/30 hover:to-orange-400/30 dark:hover:from-amber-900/40 dark:hover:to-orange-900/40 font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                        <span>有新版本可更新</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>



      {/* 版本更新提示弹窗 */}
      <UpdatePrompt
        isVisible={showUpdatePrompt}
        onClose={() => setShowUpdatePrompt(false)}
        backendVersion={backendVersion}
        remoteVersion={remoteVersion}
        hasBackendUpdate={hasBackendUpdate}
        onUpdateBackend={updateBackend}
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
      id: '#backups',
      label: '备份',
      icon: DatabaseBackup,
    },
    {
      id: '#bot',
      label: '交互',
      icon: Bot,
    },
    {
      id: '#logs',
      label: '日志',
      icon: NotebookText,
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
