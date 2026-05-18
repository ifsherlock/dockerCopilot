import React, { useEffect, useState } from 'react'
import {
  Bot as BotIcon,
  Save,
  RefreshCw,
  Shield,
  Bell,
  Clock,
  Ban,
  Globe,
  Eye,
  EyeOff
} from 'lucide-react'
import { cn } from '../utils/cn.js'
import { botAPI } from '../api/client.js'

export function Bot() {
  const [config, setConfig] = useState({
    botToken: '',
    chatIds: '',
    updateCheckCron: '0 18 * * *',
    notifyOnUpdate: true,
    updateBlacklist: '',
    autoCleanImages: false,
    cleanImagesCron: '3 2 * * *',
    autoUpdateContainers: false,
    updateContainersCron: '0 */6 * * *',
    proxyType: 'none', // none | socks5 | http
    proxyHost: '',
    proxyPort: '',
    proxyUsername: '',
    proxyPassword: '',
  })
  const [showToken, setShowToken] = useState(false)
  const [showProxyPassword, setShowProxyPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const loadConfig = async () => {
      try {
        setLoading(true)
        const res = await botAPI.getConfig()
        const data = res.data?.data || {}
        const telegram = data.telegram || {}
        const proxy = telegram.proxy || {}
        setConfig(prev => ({
          ...prev,
          botToken: telegram.bot_token || '',
          chatIds: Array.isArray(telegram.chat_ids) ? telegram.chat_ids.join(',') : '',
          updateCheckCron: telegram.update_check_cron || prev.updateCheckCron,
          notifyOnUpdate: telegram.notify_on_update ?? true,
          updateBlacklist: Array.isArray(telegram.update_blacklist) ? telegram.update_blacklist.join('\n') : '',
          autoCleanImages: telegram.auto_clean_images ?? false,
          cleanImagesCron: telegram.clean_images_cron || prev.cleanImagesCron,
          autoUpdateContainers: telegram.auto_update_containers ?? false,
          updateContainersCron: telegram.update_containers_cron || prev.updateContainersCron,
          proxyType: proxy.type || 'none',
          proxyHost: proxy.host || '',
          proxyPort: proxy.port ? String(proxy.port) : '',
          proxyUsername: proxy.username || '',
          proxyPassword: proxy.password || '',
        }))
      } catch (error) {
        setMessage(`读取配置失败：${error.response?.data?.msg || error.message}`)
      } finally {
        setLoading(false)
      }
    }
    loadConfig()
  }, [])

  const handleChange = (field, value) => {
    setConfig(prev => ({ ...prev, [field]: value }))
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      setMessage('')
      const res = await botAPI.saveConfig(config)
      if (res.data?.code >= 200 && res.data?.code < 300) {
        setMessage('配置已保存。Bot 会在容器重启后加载新配置。')
      } else {
        setMessage(`保存失败：${res.data?.msg || '未知错误'}`)
      }
    } catch (error) {
      setMessage(`保存失败：${error.response?.data?.msg || error.message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <BotIcon className="h-7 w-7 text-primary-600 dark:text-primary-400" />
            交互管理
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Telegram Bot 通知与交互配置
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
        >
          {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          <span>保存配置</span>
        </button>
      </div>

      {message && (
        <div className="p-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 text-sm text-blue-700 dark:text-blue-300">
          {message}
        </div>
      )}

      {loading && (
        <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-500 dark:text-gray-400">
          正在读取 Bot 配置...
        </div>
      )}

      {/* Bot Token 配置 */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
          <Shield className="h-5 w-5 text-blue-500" />
          Bot Token 配置
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Telegram Bot Token
            </label>
            <div className="relative">
              <input
                type={showToken ? 'text' : 'password'}
                value={config.botToken}
                onChange={(e) => handleChange('botToken', e.target.value)}
                placeholder="从 @BotFather 获取的 Token"
                className="w-full px-4 py-2 pr-10 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
              <button
                onClick={() => setShowToken(!showToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              通知 Chat ID（多个用逗号分隔）
            </label>
            <input
              type="text"
              value={config.chatIds}
              onChange={(e) => handleChange('chatIds', e.target.value)}
              placeholder="例如: 123456789,987654321"
              className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* 代理配置 */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
          <Globe className="h-5 w-5 text-purple-500" />
          网络代理配置
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          如果 Telegram API 无法直连，可配置 SOCKS5 或 HTTP 代理
        </p>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              代理类型
            </label>
            <div className="flex gap-3">
              {[
                { value: 'none', label: '无代理' },
                { value: 'socks5', label: 'SOCKS5' },
                { value: 'http', label: 'HTTP/HTTPS' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => handleChange('proxyType', opt.value)}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium transition-colors border",
                    config.proxyType === opt.value
                      ? "bg-primary-100 dark:bg-primary-900/30 border-primary-300 dark:border-primary-700 text-primary-700 dark:text-primary-300"
                      : "bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {config.proxyType !== 'none' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    代理地址
                  </label>
                  <input
                    type="text"
                    value={config.proxyHost}
                    onChange={(e) => handleChange('proxyHost', e.target.value)}
                    placeholder="例如: 127.0.0.1"
                    className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    端口
                  </label>
                  <input
                    type="text"
                    value={config.proxyPort}
                    onChange={(e) => handleChange('proxyPort', e.target.value)}
                    placeholder={config.proxyType === 'socks5' ? '1080' : '7890'}
                    className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    用户名（可选）
                  </label>
                  <input
                    type="text"
                    value={config.proxyUsername}
                    onChange={(e) => handleChange('proxyUsername', e.target.value)}
                    placeholder="留空则不认证"
                    className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    密码（可选）
                  </label>
                  <div className="relative">
                    <input
                      type={showProxyPassword ? 'text' : 'password'}
                      value={config.proxyPassword}
                      onChange={(e) => handleChange('proxyPassword', e.target.value)}
                      placeholder="留空则不认证"
                      className="w-full px-4 py-2 pr-10 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                    <button
                      onClick={() => setShowProxyPassword(!showProxyPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      {showProxyPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  💡 提示：{config.proxyType === 'socks5'
                    ? 'SOCKS5 代理支持 TCP 连接转发，适用于大多数代理软件（如 Clash、V2Ray）'
                    : 'HTTP 代理通过 CONNECT 方法建立隧道，适用于 Squid、Privoxy 等 HTTP 代理'}
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 更新检测配置 */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
          <Bell className="h-5 w-5 text-amber-500" />
          通知与更新检测
        </h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">发现更新时通知</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">检测到容器有新版本时发送 Telegram 通知</p>
            </div>
            <button
              onClick={() => handleChange('notifyOnUpdate', !config.notifyOnUpdate)}
              className={cn(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                config.notifyOnUpdate ? "bg-primary-600" : "bg-gray-300 dark:bg-gray-600"
              )}
            >
              <span className={cn(
                "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                config.notifyOnUpdate ? "translate-x-6" : "translate-x-1"
              )} />
            </button>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              <Clock className="h-4 w-4 inline mr-1" />
              更新检测 Cron 表达式
            </label>
            <input
              type="text"
              value={config.updateCheckCron}
              onChange={(e) => handleChange('updateCheckCron', e.target.value)}
              placeholder="0 18 * * *"
              className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono text-sm"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">5位 cron 格式，默认每天18:00检测</p>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">自动清理无用镜像</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">定时清理未使用和无 tag 的镜像</p>
            </div>
            <button
              onClick={() => handleChange('autoCleanImages', !config.autoCleanImages)}
              className={cn(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                config.autoCleanImages ? "bg-primary-600" : "bg-gray-300 dark:bg-gray-600"
              )}
            >
              <span className={cn(
                "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                config.autoCleanImages ? "translate-x-6" : "translate-x-1"
              )} />
            </button>
          </div>

          {config.autoCleanImages && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                清理 Cron 表达式
              </label>
              <input
                type="text"
                value={config.cleanImagesCron}
                onChange={(e) => handleChange('cleanImagesCron', e.target.value)}
                placeholder="3 2 * * *"
                className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono text-sm"
              />
            </div>
          )}

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">自动更新容器</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">定时自动更新可更新的容器（黑名单除外）</p>
            </div>
            <button
              onClick={() => handleChange('autoUpdateContainers', !config.autoUpdateContainers)}
              className={cn(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                config.autoUpdateContainers ? "bg-primary-600" : "bg-gray-300 dark:bg-gray-600"
              )}
            >
              <span className={cn(
                "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                config.autoUpdateContainers ? "translate-x-6" : "translate-x-1"
              )} />
            </button>
          </div>

          {config.autoUpdateContainers && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                自动更新 Cron 表达式
              </label>
              <input
                type="text"
                value={config.updateContainersCron}
                onChange={(e) => handleChange('updateContainersCron', e.target.value)}
                placeholder="0 */6 * * *"
                className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono text-sm"
              />
            </div>
          )}
        </div>
      </div>

      {/* 黑名单管理 */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
          <Ban className="h-5 w-5 text-red-500" />
          更新黑名单
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
          黑名单中的容器不会收到更新通知，也不会被自动更新
        </p>
        <div>
          <textarea
            value={config.updateBlacklist}
            onChange={(e) => handleChange('updateBlacklist', e.target.value)}
            placeholder="每行一个容器名，例如：&#10;postgresql&#10;redis&#10;mysql"
            rows={5}
            className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono text-sm resize-none"
          />
        </div>
      </div>
    </div>
  )
}
