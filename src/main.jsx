import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import logoImg from './assets/DockerCopilot-logo.png'

// 设置浏览器 favicon
const setFavicon = () => {
  // 移除现有的 favicon
  const existingFavicon = document.querySelector("link[rel*='icon']")
  if (existingFavicon) {
    existingFavicon.remove()
  }

  // 创建新的 favicon link
  const link = document.createElement('link')
  link.type = 'image/png'
  link.rel = 'icon'
  link.href = logoImg

  // 添加到 head
  document.head.appendChild(link)
}

// 清理旧 Service Worker 与缓存，避免旧版缓存住 /manager 和旧 assets
const cleanupLegacyServiceWorkers = () => {
  if (!('serviceWorker' in navigator)) {
    return
  }

  window.addEventListener('load', async () => {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((registration) => registration.unregister()))
      console.log('Legacy service workers cleared:', registrations.length)
    } catch (error) {
      console.log('Failed to clear service workers:', error)
    }

    if ('caches' in window) {
      try {
        const cacheKeys = await window.caches.keys()
        await Promise.all(cacheKeys.map((key) => window.caches.delete(key)))
        console.log('Legacy caches cleared:', cacheKeys)
      } catch (error) {
        console.log('Failed to clear caches:', error)
      }
    }
  })
}

// 在应用启动时设置 favicon
setFavicon()
cleanupLegacyServiceWorkers()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
