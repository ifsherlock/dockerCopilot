import React, { Suspense, lazy, useState, useEffect } from 'react'
import { Auth } from './components/Auth.jsx'
import { Sidebar, MobileBottomNav } from './components/Header.jsx'
import { PageHeader } from './components/PageHeader.jsx'
import { ThemeProvider, useTheme } from './hooks/useTheme.jsx'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FileCode, ListTree, Plus } from 'lucide-react'
import { cn } from './utils/cn.js'

import { containerAPI, imageAPI, overviewAPI } from './api/client.js'

const OverviewPage = lazy(() => import('./app/routes/OverviewPage.jsx'))
const ContainersPage = lazy(() => import('./app/routes/ContainersPage.jsx'))
const StorePage = lazy(() => import('./app/routes/StorePage.jsx'))
const ImagesPage = lazy(() => import('./app/routes/ImagesPage.jsx'))
const NetworksPage = lazy(() => import('./app/routes/NetworksPage.jsx'))
const IconsPage = lazy(() => import('./app/routes/IconsPage.jsx'))
const BackupsPage = lazy(() => import('./app/routes/BackupsPage.jsx'))
const SettingsPage = lazy(() => import('./app/routes/SettingsPage.jsx'))
const BotPage = lazy(() => import('./app/routes/BotPage.jsx'))
const LogsPage = lazy(() => import('./app/routes/LogsPage.jsx'))
const AboutPage = lazy(() => import('./app/routes/AboutPage.jsx'))

// 创建一个全局的QueryClient实例
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

const containerTabs = [
  { id: 'list', label: '容器', icon: ListTree },
  { id: 'compose', label: '项目', icon: FileCode },
  { id: 'new', label: '新建', icon: Plus },
]

const pageMeta = {
  '#overview': { title: '概览' },
  '#containers': { title: '容器', tabs: containerTabs },
  '#store': { title: '商店' },
  '#images': { title: '镜像' },
  '#networks': { title: '网络' },
  '#settings': { title: '设置' },
  '#bot': { title: '自动化' },
  '#logs': { title: '日志' },
  '#about': { title: '关于' },
}

const normalizeRoute = (rawHash) => {
  const cleanHash = String(rawHash || '').split('?')[0]
  if (!cleanHash.startsWith('#')) return '#overview'

  const [main, rawSub] = cleanHash.split('/')
  if (!pageMeta[main]) return '#overview'

  if (main === '#containers') {
    const sub = containerTabs.some(tab => tab.id === rawSub) ? rawSub : 'list'
    return `${main}/${sub}`
  }

  return main
}

function PageLoading() {
  return (
    <div className="flex min-h-[360px] items-center justify-center text-sm text-gray-500 dark:text-gray-400">
      正在加载...
    </div>
  )
}

function AppContent() {
  const { appearance } = useTheme()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [activeTab, setActiveTab] = useState(() => (
    typeof window !== 'undefined' ? normalizeRoute(window.location.hash) : '#overview'
  ))
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024)
  const [userPreferredCollapsed, setUserPreferredCollapsed] = useState(false)
  const [dockerStatus, setDockerStatus] = useState({
    connected: false,
    endpoint: '',
    message: '正在检测 Docker 服务',
    status: 'checking',
  })
  const [isGlobalRefreshing, setIsGlobalRefreshing] = useState(false)

  // 智能计算侧边栏是否应该收缩
  const getSmartCollapsedState = (width, userPreference) => {
    if (width < 768) {
      // 手机模式：不在乎收缩状态，菜单模式处理
      return false
    } else if (width < 1024) {
      // 平板模式：强制收缩，忽略用户偏好
      return true
    } else {
      // 桌面模式：使用用户偏好
      return userPreference
    }
  }

  const isSidebarCollapsed = getSmartCollapsedState(windowWidth, userPreferredCollapsed)

  const refreshDockerStatus = async () => {
    try {
      const res = await overviewAPI.getOverview()
      const docker = res.data?.data?.docker || {}
      setDockerStatus({
        connected: Boolean(docker.connected),
        endpoint: docker.endpoint || '',
        message: docker.message || (docker.connected ? 'Docker 服务已连接' : 'Docker 服务连接异常'),
        status: docker.status || (docker.connected ? 'connected' : 'error'),
        serverVersion: docker.serverVersion || '',
        apiVersion: docker.apiVersion || '',
      })
    } catch (error) {
      const status = error.response?.status
      const rawMessage = error.response?.data?.msg || error.message || ''
      if (status === 404 || String(rawMessage).includes('404')) {
        try {
          await containerAPI.getContainers()
          setDockerStatus({
            connected: true,
            endpoint: typeof window !== 'undefined' ? window.location.host : '',
            message: '当前后端未提供新版概览接口，已使用旧容器接口确认服务可用',
            status: 'partial',
          })
          return
        } catch {
          // Fall through to the normal error status below.
        }
      }
      const message = error.response?.status === 401 || error.response?.status === 403
        ? '权限不足或登录已失效'
        : (rawMessage || 'Docker 服务连接异常')
      setDockerStatus({
        connected: false,
        endpoint: '',
        message,
        status: 'error',
      })
    }
  }

  useEffect(() => {
    // 检查本地存储中是否有token
    const token = localStorage.getItem('docker_copilot_token')
    if (token) {
      setIsAuthenticated(true)
    }

    // 同步图标配置
    const syncIcons = async () => {
      try {
        const response = await imageAPI.getIcons()
        if (response.data.code === 200 || response.data.code === 0) {
          const icons = response.data.data
          // 简单的全量更新，以后如果支持前端删除，可能需要合并逻辑
          localStorage.setItem('docker_copilot_image_logos', JSON.stringify(icons))
        }
      } catch (error) {
        console.error('Failed to sync icons:', error)
      }
    }
    syncIcons()

    // 监听storage事件，当其他标签页修改localStorage时更新认证状态
    const handleStorageChange = (e) => {
      if (e.key === 'docker_copilot_token') {
        if (e.newValue) {
          setIsAuthenticated(true)
        } else {
          setIsAuthenticated(false)
        }
      }
    }

    window.addEventListener('storage', handleStorageChange)

    // 监听自定义事件，用于在本标签页中处理认证状态变化
    const handleAuthChange = (e) => {
      if (e.detail.authenticated) {
        setIsAuthenticated(true)
      } else {
        setIsAuthenticated(false)
      }
    }

    window.addEventListener('authChange', handleAuthChange)

    // 监听窗口大小变化
    const handleResize = () => {
      const width = window.innerWidth
      setWindowWidth(width)
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('authChange', handleAuthChange)
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  useEffect(() => {
    const handleHashChange = () => {
      setActiveTab(normalizeRoute(window.location.hash))
    }

    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const nextHash = normalizeRoute(activeTab)
    if (normalizeRoute(window.location.hash) !== nextHash) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${nextHash}`)
    }
  }, [activeTab])

  useEffect(() => {
    if (!isAuthenticated) return
    refreshDockerStatus()
    const timer = window.setInterval(refreshDockerStatus, 30000)
    return () => window.clearInterval(timer)
  }, [isAuthenticated])

  const handleLogin = () => {
    setIsAuthenticated(true)
    // 触发自定义事件通知其他组件认证状态已更新
    window.dispatchEvent(new CustomEvent('authChange', { detail: { authenticated: true } }))
  }

  const handleLogout = () => {
    localStorage.removeItem('docker_copilot_token')
    setIsAuthenticated(false)
    // 触发自定义事件通知其他组件认证状态已更新
    window.dispatchEvent(new CustomEvent('authChange', { detail: { authenticated: false } }))
  }

  const handleTabChange = (tab) => {
    setActiveTab(normalizeRoute(tab))
  }

  const handleToggleCollapse = () => {
    // 只有在桌面模式下才允许手动切换
    if (windowWidth >= 1024) {
      setUserPreferredCollapsed(!userPreferredCollapsed)
    }
  }

  const handleGlobalRefresh = async (source = 'page-header') => {
    const startedAt = Date.now()
    setIsGlobalRefreshing(true)
    try {
      await Promise.allSettled([
        queryClient.invalidateQueries(),
        refreshDockerStatus(),
      ])
      window.dispatchEvent(new CustomEvent('docker-copilot-global-refresh', {
        detail: { source, activeTab, at: Date.now() },
      }))
    } finally {
      const remaining = Math.max(0, 500 - (Date.now() - startedAt))
      window.setTimeout(() => setIsGlobalRefreshing(false), remaining)
    }
  }

  const [mainTab, subTab = 'list'] = String(activeTab || '#overview').split('/')
  const meta = pageMeta[mainTab] || pageMeta['#overview']

  const renderContent = () => {
    switch (mainTab) {
      case '#overview':
        return <OverviewPage onNavigate={handleTabChange} />
      case '#containers':
        return <ContainersPage subTab={subTab || 'list'} onSubTabChange={(next) => setActiveTab(normalizeRoute(`#containers/${next}`))} />
      case '#store':
        return <StorePage onInstall={() => setActiveTab('#containers/new')} />
      case '#images':
        return <ImagesPage />
      case '#networks':
        return <NetworksPage />
      case '#icons':
        return <IconsPage />
      case '#backups':
        return <BackupsPage />
      case '#settings':
        return <SettingsPage onNavigate={handleTabChange} />
      case '#bot':
        return <BotPage />
      case '#logs':
        return <LogsPage />
      case '#about':
        return <AboutPage />
      default:
        return <OverviewPage onNavigate={handleTabChange} />
    }
  }

  if (!isAuthenticated) {
    return <Auth onLogin={handleLogin} />
  }

  return (
    <div className={cn(
      'flex min-h-screen transition-colors duration-300 flex-col lg:flex-row',
      appearance === 'aurora' && 'bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.14),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(168,85,247,0.14),_transparent_34%),linear-gradient(180deg,_#f8fbff_0%,_#f6f7fb_100%)] dark:bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.14),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(147,51,234,0.16),_transparent_34%),linear-gradient(180deg,_#0b1220_0%,_#111827_100%)]',
      appearance === 'manager_green' && 'bg-[radial-gradient(circle_at_top_left,_rgba(15,118,110,0.12),_transparent_30%),linear-gradient(180deg,_#f4f7f6_0%,_#edf3f1_100%)] dark:bg-[radial-gradient(circle_at_top_left,_rgba(20,184,166,0.12),_transparent_30%),linear-gradient(180deg,_#071312_0%,_#0f1f1d_58%,_#111827_100%)]',
      appearance === 'night_sail' && 'bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.08),_transparent_26%),linear-gradient(180deg,_#eef4ff_0%,_#e8eef8_100%)] dark:bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.15),_transparent_26%),linear-gradient(180deg,_#020617_0%,_#0f172a_58%,_#111827_100%)]',
      appearance === 'mist' && 'bg-[linear-gradient(180deg,_#fafaf9_0%,_#f1f5f9_100%)] dark:bg-[linear-gradient(180deg,_#111827_0%,_#0f172a_100%)]'
    )}>
      <Sidebar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onLogout={handleLogout}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={handleToggleCollapse}
        windowWidth={windowWidth}
      />
      <main className={cn(
        "flex-1 flex flex-col transition-all duration-300",
        "overflow-y-auto",
        "min-h-screen",
        "relative",
        windowWidth < 768
          ? 'pb-[calc(64px+1rem+env(safe-area-inset-bottom))]'
          : windowWidth < 1024
            ? 'ml-20'
            : isSidebarCollapsed
              ? 'ml-20'
              : 'ml-64'
      )}>
        <div className="mx-auto flex w-full max-w-[1760px] flex-1 flex-col px-4 pt-4 sm:px-6 lg:px-8 xl:px-10">
          <PageHeader
            title={meta.title}
            tabs={meta.tabs || []}
            activeTab={mainTab === '#containers' ? subTab : undefined}
            onTabChange={mainTab === '#containers' ? (next) => setActiveTab(`#containers/${next}`) : undefined}
            onRefresh={handleGlobalRefresh}
            isRefreshing={isGlobalRefreshing}
            dockerStatus={dockerStatus}
          />
          <div className="w-full">
            <Suspense fallback={<PageLoading />}>
              {renderContent()}
            </Suspense>
          </div>
        </div>
      </main>
      <MobileBottomNav
        activeTab={activeTab}
        onTabChange={handleTabChange}
        windowWidth={windowWidth}
      />
    </div>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </QueryClientProvider>
  )
}

export default App
