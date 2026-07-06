"use client"

import { CheckCircle2, Eye, EyeOff, LoaderCircle } from "lucide-react"

import type { ConfigFormState } from "../hooks/useMobileDashboardData"

type ConfigViewProps = {
  showBotToken: boolean
  setShowBotToken: (value: boolean | ((prev: boolean) => boolean)) => void
  configForm: ConfigFormState
  setConfigForm: (value: ConfigFormState | ((prev: ConfigFormState) => ConfigFormState)) => void
  handleSaveConfig: () => void
  configSaving: boolean
  blacklistDraft: string
  setBlacklistDraft: (value: string) => void
  handleAddBlacklistItem: () => void
  blacklistSuggestions: string[]
  updateBlacklist: string[]
  setUpdateBlacklist: (value: string[] | ((prev: string[]) => string[])) => void
  handleSaveBlacklist: (items: string[]) => void
}

export function ConfigView(props: ConfigViewProps) {
  const {
    showBotToken,
    setShowBotToken,
    configForm,
    setConfigForm,
    handleSaveConfig,
    configSaving,
    blacklistDraft,
    setBlacklistDraft,
    handleAddBlacklistItem,
    blacklistSuggestions,
    updateBlacklist,
    setUpdateBlacklist,
    handleSaveBlacklist,
  } = props

  return (
    <div className="space-y-4">
            <div className="rounded-2xl bg-white dark:bg-slate-900 p-5 shadow-sm ring-1 ring-slate-100 dark:ring-slate-700">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-4">基础配置</h2>
              <div className="space-y-4">
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                  <div className="mb-3">
                    <div className="text-sm font-medium text-slate-700 dark:text-slate-300">Telegram 通知</div>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">TG Bot Token</label>
                      <div className="relative">
                        <input
                          type={showBotToken ? "text" : "password"}
                          value={configForm.botToken}
                          onChange={(e) => setConfigForm((p) => ({ ...p, botToken: e.target.value }))}
                          placeholder="Telegram Bot Token"
                          className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 pr-11 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900"
                        />
                        <button
                          type="button"
                          onClick={() => setShowBotToken((prev) => !prev)}
                          title={showBotToken ? "隐藏 Token" : "显示 Token"}
                          aria-label={showBotToken ? "隐藏 Token" : "显示 Token"}
                          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-200"
                        >
                          {showBotToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Chat IDs</label>
                      <input
                        type="text"
                        value={configForm.chatIds}
                        onChange={(e) => setConfigForm((p) => ({ ...p, chatIds: e.target.value }))}
                        placeholder="多个 ID 用逗号分隔"
                        className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900"
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">主机 LAN IP</label>
                  <input
                    type="text"
                    value={configForm.hostLanIP}
                    onChange={(e) => setConfigForm((p) => ({ ...p, hostLanIP: e.target.value }))}
                    placeholder="192.168.x.x"
                    className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900"
                  />
                </div>
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                  <label className="flex items-center gap-3 text-sm font-medium text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={configForm.enableUpdateCheck}
                      onChange={(e) =>
                        setConfigForm((p) => ({
                          ...p,
                          enableUpdateCheck: e.target.checked,
                          updateCheckCron:
                            !p.updateCheckCron || ["off", "false", "0", "no"].includes(p.updateCheckCron.trim().toLowerCase())
                              ? "0 18 * * *"
                              : p.updateCheckCron,
                        }))
                      }
                      className="h-4 w-4 rounded border-slate-300 text-blue-500 focus:ring-blue-400"
                    />
                    自动检查更新
                  </label>
                  {configForm.enableUpdateCheck && (
                    <input
                      type="text"
                      value={configForm.updateCheckCron}
                      onChange={(e) => setConfigForm((p) => ({ ...p, updateCheckCron: e.target.value }))}
                      placeholder="0 18 * * *"
                      className="mt-3 block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900"
                    />
                  )}
                </div>
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                  <label className="flex items-center gap-3 text-sm font-medium text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={configForm.autoCleanImages}
                      onChange={(e) => setConfigForm((p) => ({ ...p, autoCleanImages: e.target.checked }))}
                      className="h-4 w-4 rounded border-slate-300 text-blue-500 focus:ring-blue-400"
                    />
                    自动清理镜像
                  </label>
                  {configForm.autoCleanImages && (
                    <input
                      type="text"
                      value={configForm.cleanImagesCron}
                      onChange={(e) => setConfigForm((p) => ({ ...p, cleanImagesCron: e.target.value }))}
                      placeholder="3 2 * * *"
                      className="mt-3 block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900"
                    />
                  )}
                </div>
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                  <label className="flex items-center gap-3 text-sm font-medium text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={configForm.autoUpdateContainers}
                      onChange={(e) => setConfigForm((p) => ({ ...p, autoUpdateContainers: e.target.checked }))}
                      className="h-4 w-4 rounded border-slate-300 text-blue-500 focus:ring-blue-400"
                    />
                    自动更新容器
                  </label>
                  {configForm.autoUpdateContainers && (
                    <input
                      type="text"
                      value={configForm.updateContainersCron}
                      onChange={(e) => setConfigForm((p) => ({ ...p, updateContainersCron: e.target.value }))}
                      placeholder="0 */6 * * *"
                      className="mt-3 block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900"
                    />
                  )}
                </div>
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                  <label className="flex items-center gap-3 text-sm font-medium text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={configForm.autoBackupJson}
                      onChange={(e) => setConfigForm((p) => ({ ...p, autoBackupJson: e.target.checked }))}
                      className="h-4 w-4 rounded border-slate-300 text-blue-500 focus:ring-blue-400"
                    />
                    自动备份 JSON
                  </label>
                  {configForm.autoBackupJson && (
                    <input
                      type="text"
                      value={configForm.backupJsonCron}
                      onChange={(e) => setConfigForm((p) => ({ ...p, backupJsonCron: e.target.value }))}
                      placeholder="0 1 * * *"
                      className="mt-3 block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900"
                    />
                  )}
                </div>
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                  <label className="flex items-center gap-3 text-sm font-medium text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={configForm.autoBackupCompose}
                      onChange={(e) => setConfigForm((p) => ({ ...p, autoBackupCompose: e.target.checked }))}
                      className="h-4 w-4 rounded border-slate-300 text-blue-500 focus:ring-blue-400"
                    />
                    自动备份 Compose
                  </label>
                  {configForm.autoBackupCompose && (
                    <input
                      type="text"
                      value={configForm.backupComposeCron}
                      onChange={(e) => setConfigForm((p) => ({ ...p, backupComposeCron: e.target.value }))}
                      placeholder="30 1 * * *"
                      className="mt-3 block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900"
                    />
                  )}
                </div>
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-slate-700 dark:text-slate-300">网络代理配置</div>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">支持 Telegram Bot 使用 SOCKS5 或 HTTP 代理。</p>
                    </div>
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={configForm.proxyType !== "none"}
                        onChange={(e) =>
                          setConfigForm((p) => ({
                            ...p,
                            proxyType: e.target.checked ? (p.proxyType === "none" ? "socks5" : p.proxyType) : "none",
                          }))
                        }
                        className="h-4 w-4 rounded border-slate-300 text-blue-500 focus:ring-blue-400"
                      />
                      {configForm.proxyType === "none" ? "无代理" : "代理开启"}
                    </label>
                  </div>
                  {configForm.proxyType !== "none" && (
                    <div className="mt-3 space-y-3">
                      <div className="flex flex-wrap gap-3">
                        {[
                          { value: "socks5", label: "SOCKS5" },
                          { value: "http", label: "HTTP" },
                        ].map((opt) => (
                          <label
                            key={opt.value}
                            className="inline-flex items-center gap-2 rounded-full border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300"
                          >
                            <input
                              type="radio"
                              name="proxy_type"
                              checked={configForm.proxyType === opt.value}
                              onChange={() => setConfigForm((p) => ({ ...p, proxyType: opt.value }))}
                              className="h-4 w-4 border-slate-300 text-blue-500 focus:ring-blue-400"
                            />
                            <span>{opt.label}</span>
                          </label>
                        ))}
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">代理地址</label>
                          <input
                            type="text"
                            value={configForm.proxyHost}
                            onChange={(e) => setConfigForm((p) => ({ ...p, proxyHost: e.target.value }))}
                            placeholder="127.0.0.1"
                            className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">代理端口</label>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={configForm.proxyPort}
                            onChange={(e) => setConfigForm((p) => ({ ...p, proxyPort: e.target.value.replace(/[^\d]/g, "") }))}
                            placeholder="7890"
                            className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">代理用户名</label>
                          <input
                            type="text"
                            value={configForm.proxyUsername}
                            onChange={(e) => setConfigForm((p) => ({ ...p, proxyUsername: e.target.value }))}
                            placeholder="可选"
                            className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">代理密码</label>
                          <input
                            type="password"
                            value={configForm.proxyPassword}
                            onChange={(e) => setConfigForm((p) => ({ ...p, proxyPassword: e.target.value }))}
                            placeholder="可选"
                            className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleSaveConfig}
                  disabled={configSaving}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-600 disabled:opacity-50"
                >
                  {configSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {configSaving ? "保存中..." : "保存配置"}
                </button>
              </div>
            </div>

            {/* 黑名单 */}
            <div className="rounded-2xl bg-white dark:bg-slate-900 p-5 shadow-sm ring-1 ring-slate-100 dark:ring-slate-700">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-3">更新黑名单</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                添加镜像名以忽略其更新提醒。每行一个。
              </p>
              <div className="mb-3 space-y-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">从全部镜像添加</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    list="blacklist-image-options"
                    value={blacklistDraft}
                    onChange={(e) => setBlacklistDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        handleAddBlacklistItem()
                      }
                    }}
                    placeholder="输入或选择镜像名"
                    className="block flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900"
                  />
                  <datalist id="blacklist-image-options">
                    {blacklistSuggestions.map((item) => (
                      <option key={item} value={item} />
                    ))}
                  </datalist>
                  <button
                    type="button"
                    onClick={handleAddBlacklistItem}
                    className="shrink-0 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-100 dark:border-blue-900/50 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30"
                  >
                    添加
                  </button>
                </div>
              </div>
              <textarea
                value={updateBlacklist.join("\n")}
                onChange={(e) => setUpdateBlacklist(e.target.value.split("\n").filter(Boolean))}
                rows={6}
                className="block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900"
                placeholder="nginx&#10;redis"
              />
              <button
                type="button"
                onClick={() => handleSaveBlacklist(updateBlacklist)}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-600"
              >
                <CheckCircle2 className="h-4 w-4" />
                保存黑名单
              </button>
            </div>
          </div>
  )
}
