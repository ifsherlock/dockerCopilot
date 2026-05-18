import React, { useState, useEffect } from 'react'
import { Search, Copy, Eye, Star, Check, X } from 'lucide-react'
import { cn } from '../utils/cn.js'
import { builtInImageLogos, getSupportedImageNames } from '../config/imageLogos.js'
import { useQuery } from '@tanstack/react-query'
import { imageAPI } from '../api/client.js'

export function Icons() {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [copiedIcon, setCopiedIcon] = useState(null)
  const [selectedIcon, setSelectedIcon] = useState(null)
  const [favorites, setFavorites] = useState([])

  // 获取自定义图标
  const { data: customIcons = {} } = useQuery({
    queryKey: ['customIcons'],
    queryFn: async () => {
      const response = await imageAPI.getIcons()
      if (response.data.code === 200 || response.data.code === 0) {
        return response.data.data || {}
      }
      return {}
    },
    // 每次进入页面都刷新，保证是最新的
    refetchOnMount: true,
  })

  // 从localStorage加载收藏
  useEffect(() => {
    const savedFavorites = localStorage.getItem('docker_copilot_icon_favorites')
    if (savedFavorites) {
      try {
        setFavorites(JSON.parse(savedFavorites))
      } catch (e) {
        console.error('解析收藏数据失败:', e)
      }
    }
  }, [])

  // 保存收藏到localStorage
  const saveFavorites = (newFavorites) => {
    setFavorites(newFavorites)
    localStorage.setItem('docker_copilot_icon_favorites', JSON.stringify(newFavorites))
  }

  // 切换收藏状态
  const toggleFavorite = (iconName) => {
    const newFavorites = favorites.includes(iconName)
      ? favorites.filter(name => name !== iconName)
      : [...favorites, iconName]
    saveFavorites(newFavorites)
  }

  // 复制图标URL到剪贴板
  const copyToClipboard = async (url, iconName) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopiedIcon(iconName)
      setTimeout(() => setCopiedIcon(null), 2000)
    } catch (err) {
      console.error('复制失败:', err)
    }
  }

  // 通用图标过滤函数
  const filterIconsList = (sourceIcons) => {
    let icons = Object.entries(sourceIcons || {})

    // 按分类过滤
    if (selectedCategory !== 'all') {
      icons = icons.filter(([name, url]) => {
        switch (selectedCategory) {
          case 'favorites':
            return favorites.includes(name)
          default:
            return true
        }
      })
    }

    // 按搜索词过滤
    if (searchTerm) {
      icons = icons.filter(([name]) =>
        name.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    return icons
  }

  const filteredBuiltInIcons = (selectedCategory === 'custom')
    ? []
    : filterIconsList(builtInImageLogos)

  const filteredCustomIcons = (selectedCategory === 'builtin')
    ? []
    : filterIconsList(customIcons)

  const categories = ['all', 'custom', 'builtin']

  return (
    <div className="max-w-7xl mx-auto">
      {/* 页面头部 */}
      <div className="px-4 sm:px-6 py-4">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">图标库</h2>
        <p className="text-gray-600 dark:text-gray-400">浏览和管理Docker镜像图标</p>
      </div>

      {/* 搜索和过滤 */}
      <div className="px-4 sm:px-6 py-4 space-y-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        {/* 搜索框 */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="搜索图标名称..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>

        {/* 分类过滤和统计 */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            {categories.map(category => (
              <option key={category} value={category}>
                {category === 'all' ? '全部分类' :
                  category === 'custom' ? '本地图标' :
                    category === 'builtin' ? '内置图标' : category}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              共 {filteredBuiltInIcons.length + filteredCustomIcons.length} 个
            </span>
            {favorites.length > 0 && (
              <button
                onClick={() => setSelectedCategory('favorites')}
                className={cn(
                  "px-3 py-2 text-sm rounded-lg transition-colors flex items-center gap-1.5",
                  selectedCategory === 'favorites'
                    ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                )}
              >
                <Star className="h-4 w-4" />
                {favorites.length}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 图标网格 */}
      <div className="px-4 sm:px-6 py-4 space-y-8">

        {/* 本地图标库部分 */}
        {filteredCustomIcons.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 px-1 flex items-center gap-2">
              <span className="w-1 h-5 bg-primary-500 rounded-full"></span>
              本地图标库
              <span className="text-sm font-normal text-gray-500 ml-2">({filteredCustomIcons.length})</span>
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {filteredCustomIcons.map(([name, url]) => (
                <div
                  key={name}
                  className="group cursor-pointer"
                  onClick={() => setSelectedIcon({ name, url })}
                >
                  <div className="card p-4 rounded-2xl hover:shadow-lg transition-all h-full flex flex-col items-center justify-center bg-blue-50/50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-800">
                    <div className="relative w-full mb-3">
                      <img
                        src={url}
                        alt={name}
                        className="w-12 h-12 mx-auto object-contain rounded-lg"
                        onError={(e) => {
                          e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiByeD0iOCIgZmlsbD0iI0YzRjRGNiIvPgo8cGF0aCBkPSJNMzIgMTZMNDEgMzBIMzFWMzVIMzFWMzBIMjNMMzIgMTZaIiBmaWxsPSIjOUNBM0FGIi8+Cjwvc3ZnPgo='
                        }}
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleFavorite(name)
                        }}
                        className="absolute -top-1 -right-1 p-1.5 rounded-full bg-white dark:bg-gray-800 shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Star
                          className={cn(
                            "h-4 w-4",
                            favorites.includes(name)
                              ? "text-yellow-500 fill-current"
                              : "text-gray-300 hover:text-yellow-500"
                          )}
                        />
                      </button>
                    </div>

                    <div className="text-center w-full">
                      <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate" title={name}>
                        {name}
                      </p>
                    </div>

                    <div className="flex items-center justify-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 w-full opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          copyToClipboard(url, name)
                        }}
                        className="p-1 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 rounded transition-colors"
                        title="复制链接"
                      >
                        {copiedIcon === name ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          window.open(url, '_blank')
                        }}
                        className="p-1 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 rounded transition-colors"
                        title="查看原图"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 内置图标库部分 */}
        {filteredBuiltInIcons.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 px-1 flex items-center gap-2">
              <span className="w-1 h-5 bg-gray-500 rounded-full"></span>
              内置图标库
              <span className="text-sm font-normal text-gray-500 ml-2">({filteredBuiltInIcons.length})</span>
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {filteredBuiltInIcons.map(([name, url]) => (
                <div
                  key={name}
                  className="group cursor-pointer"
                  onClick={() => setSelectedIcon({ name, url })}
                >
                  <div className="card p-4 rounded-2xl hover:shadow-lg transition-all h-full flex flex-col items-center justify-center">
                    <div className="relative w-full mb-3">
                      <img
                        src={url}
                        alt={name}
                        className="w-12 h-12 mx-auto object-contain rounded-lg"
                        onError={(e) => {
                          e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiByeD0iOCIgZmlsbD0iI0YzRjRGNiIvPgo8cGF0aCBkPSJNMzIgMTZMNDEgMzBIMzNWMzhIMzFWMzBIMjNMMzIgMTZaIiBmaWxsPSIjOUNBM0FGIi8+Cjwvc3ZnPgo='
                        }}
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleFavorite(name)
                        }}
                        className="absolute -top-1 -right-1 p-1.5 rounded-full bg-white dark:bg-gray-800 shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Star
                          className={cn(
                            "h-4 w-4",
                            favorites.includes(name)
                              ? "text-yellow-500 fill-current"
                              : "text-gray-300 hover:text-yellow-500"
                          )}
                        />
                      </button>
                    </div>

                    <div className="text-center w-full">
                      <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate" title={name}>
                        {name}
                      </p>
                    </div>

                    <div className="flex items-center justify-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 w-full opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          copyToClipboard(url, name)
                        }}
                        className="p-1 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 rounded transition-colors"
                        title="复制链接"
                      >
                        {copiedIcon === name ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          window.open(url, '_blank')
                        }}
                        className="p-1 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 rounded transition-colors"
                        title="查看原图"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 无结果提示 */}
        {filteredCustomIcons.length === 0 && filteredBuiltInIcons.length === 0 && (
          <div className="text-center py-12">
            <div className="h-16 w-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              没有找到图标
            </h3>
            <p className="text-gray-500 dark:text-gray-400">
              尝试调整搜索词或分类
            </p>
          </div>
        )}
      </div>
      {/* 图标详情弹窗 */}
      {selectedIcon && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                  图标详情
                </h3>
                <button
                  onClick={() => setSelectedIcon(null)}
                  className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="flex justify-center">
                  <img
                    src={selectedIcon.url}
                    alt={selectedIcon.name}
                    className="w-32 h-32 object-contain rounded-lg border border-gray-200 dark:border-gray-700"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    图标名称
                  </label>
                  <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg text-gray-900 dark:text-white font-medium">
                    {selectedIcon.name}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    图标链接
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={selectedIcon.url}
                      readOnly
                      className="flex-1 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg text-gray-900 dark:text-white font-mono text-sm border border-gray-200 dark:border-gray-600"
                    />
                    <button
                      onClick={() => copyToClipboard(selectedIcon.url, selectedIcon.name)}
                      className="px-4 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors flex items-center gap-2 flex-shrink-0"
                    >
                      {copiedIcon === selectedIcon.name ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      {copiedIcon === selectedIcon.name ? '已复制' : '复制'}
                    </button>
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => window.open(selectedIcon.url, '_blank')}
                    className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    在新窗口打开
                  </button>
                  <button
                    onClick={() => {
                      toggleFavorite(selectedIcon.name)
                      setSelectedIcon(null)
                    }}
                    className={cn(
                      "flex-1 px-4 py-2 rounded-lg transition-colors",
                      favorites.includes(selectedIcon.name)
                        ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 hover:bg-yellow-200 dark:hover:bg-yellow-800"
                        : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                    )}
                  >
                    {favorites.includes(selectedIcon.name) ? '取消收藏' : '添加收藏'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
