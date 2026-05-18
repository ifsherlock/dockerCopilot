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

// 注册 Service Worker
const registerServiceWorker = () => {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then(registration => {
          console.log('Service Worker registered:', registration)
        })
        .catch(error => {
          console.log('Service Worker registration failed:', error)
        })
    })
  }
}

// 在应用启动时设置 favicon
setFavicon()

// 注册 Service Worker
registerServiceWorker()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
