import React, { useState, useEffect } from 'react'
import { Auth } from './components/Auth.jsx'
import { Sidebar, MobileBottomNav } from './components/Header.jsx'
import { Containers } from './components/Containers.jsx'
import { Images } from './components/Images.jsx'
import { Backups } from './components/Backups.jsx'
import { Icons } from './components/Icons.jsx'
import { About } from './components/About.jsx'
import { Bot } from './components/Bot.jsx'
import { LogsPage } from './components/Logs.jsx'
import { ThemeProvider, useTheme } from './hooks/useTheme.jsx'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cn } from './utils/cn.js'

import { containerAPI, imageAPI } from './api/client.js'

// 创建一个全局的QueryClient实例
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

function AppContent() {
  const { appearance } = useTheme()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [activeTab, setActiveTab] = useState('#containers')
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024)
  const [userPreferredCollapsed, setUserPreferredCollapsed] = useState(false)

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
    setActiveTab(tab)
  }

  const handleToggleCollapse = () => {
    // 只有在桌面模式下才允许手动切换
    if (windowWidth >= 1024) {
      setUserPreferredCollapsed(!userPreferredCollapsed)
    }
  }

  const renderContent = () => {
    switch (activeTab) {
      case '#containers':
        return <Containers />
      case '#images':
        return <Images />
      case '#icons':
        return <Icons />
      case '#backups':
        return <Backups />
      case '#bot':
        return <Bot />
      case '#logs':
        return <LogsPage />
      case '#about':
        return <About />
      default:
        return <Containers />
    }
  }

  if (!isAuthenticated) {
    return <Auth onLogin={handleLogin} />
  }

  return (
    <div className={cn(
      'flex min-h-screen transition-colors duration-300 flex-col lg:flex-row',
      appearance === 'aurora' && 'bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.14),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(168,85,247,0.14),_transparent_34%),linear-gradient(180deg,_#f8fbff_0%,_#f6f7fb_100%)] dark:bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.14),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(147,51,234,0.16),_transparent_34%),linear-gradient(180deg,_#0b1220_0%,_#111827_100%)]',
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
        windowWidth < 768
          ? 'pb-[calc(64px+1rem+env(safe-area-inset-bottom))]'
          : windowWidth < 1024
            ? 'ml-20'
            : isSidebarCollapsed
              ? 'ml-20'
              : 'ml-64'
      )}>
        <div className={cn(
          "flex-1 pt-4 sm:pt-4",
          isSidebarCollapsed && windowWidth >= 1024
            ? (activeTab === '#logs' ? 'px-2 sm:px-3 lg:px-3' : 'px-4 sm:px-6 lg:px-8 xl:px-10')
            : 'p-2 sm:p-4 lg:p-4'
        )}>
          <div className={cn(
            isSidebarCollapsed && windowWidth >= 1024 && activeTab !== '#logs'
              ? 'w-full'
              : 'w-full'
          )}>
            {renderContent()}
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
