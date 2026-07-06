"use client"

import { CheckCircle2, Copy, Eye, EyeOff, LoaderCircle } from "lucide-react"

import type { ConfigFormState } from "../hooks/useMobileDashboardData"

type ConfigViewProps = {
  showBotToken: boolean
  setShowBotToken: (value: boolean | ((prev: boolean) => boolean)) => void
  showQQBotSecret: boolean
  setShowQQBotSecret: (value: boolean | ((prev: boolean) => boolean)) => void
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

type ToggleRowProps = {
  title: string
  checked: boolean
  onChange: (checked: boolean) => void
}

function cardClass(extra = "") {
  return `rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100 dark:bg-slate-900 dark:ring-slate-700 ${extra}`.trim()
}

function inputClass(extra = "") {
  return `block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-blue-900 ${extra}`.trim()
}

function sectionTitle(title: string) {
  return <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{title}</h2>
}

function ToggleRow({ title, checked, onChange }: ToggleRowProps) {
  return (
    <label className="flex min-h-10 items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300">
      <span>{title}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-blue-500 focus:ring-blue-400"
      />
    </label>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">{label}</span>
      {children}
    </label>
  )
}

export function ConfigView(props: ConfigViewProps) {
  const {
    showBotToken,
    setShowBotToken,
    showQQBotSecret,
    setShowQQBotSecret,
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

  const recentQQBotIdentities = Array.isArray(configForm.qqbotRecentIdentities)
    ? configForm.qqbotRecentIdentities.filter((item) => item?.openid)
    : []

  const copyText = async (value: string) => {
    if (!value || typeof navigator === "undefined") return
    await navigator.clipboard?.writeText(value)
  }

  const appendQQBotIdentity = (openid: string, kind?: string) => {
    const value = String(openid || "").trim()
    if (!value) return
    const field = kind === "group" ? "qqbotAllowedGroupOpenids" : "qqbotAllowedUserOpenids"
    setConfigForm((prev) => {
      const items = String(prev[field] || "")
        .split(/[\n,]+/)
        .map((item) => item.trim())
        .filter(Boolean)
      if (!items.includes(value)) items.push(value)
      return { ...prev, [field]: items.join("\n") }
    })
  }

  return (
    <div className="space-y-4">
      <div className={cardClass()}>
        <div className="mb-4 flex items-center justify-between gap-3">
          {sectionTitle("配置")}
          <button
            type="button"
            onClick={handleSaveConfig}
            disabled={configSaving}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-600 disabled:opacity-50"
          >
            {configSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {configSaving ? "保存中" : "保存"}
          </button>
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">Telegram Bot</div>
              <ToggleRow
                title={configForm.interactiveEnabled ? "开启" : "关闭"}
                checked={configForm.interactiveEnabled}
                onChange={(checked) => setConfigForm((prev) => ({ ...prev, interactiveEnabled: checked }))}
              />
            </div>
            <div className="grid grid-cols-1 gap-3">
              <Field label="Bot Token">
                <div className="relative">
                  <input
                    type={showBotToken ? "text" : "password"}
                    value={configForm.botToken}
                    onChange={(event) => setConfigForm((prev) => ({ ...prev, botToken: event.target.value }))}
                    placeholder="Telegram Bot Token"
                    className={inputClass("pr-10")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowBotToken((prev) => !prev)}
                    title={showBotToken ? "隐藏 Token" : "显示 Token"}
                    aria-label={showBotToken ? "隐藏 Token" : "显示 Token"}
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showBotToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </Field>
              <Field label="Chat IDs">
                <input
                  type="text"
                  value={configForm.chatIds}
                  onChange={(event) => setConfigForm((prev) => ({ ...prev, chatIds: event.target.value }))}
                  placeholder="多个 ID 用逗号分隔"
                  className={inputClass()}
                />
              </Field>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <ToggleRow
                  title="新版交互消息"
                  checked={configForm.richInteractionsEnabled}
                  onChange={(checked) => setConfigForm((prev) => ({ ...prev, richInteractionsEnabled: checked }))}
                />
                <Field label="消息格式">
                  <select
                    value={configForm.parseMode}
                    onChange={(event) => setConfigForm((prev) => ({ ...prev, parseMode: event.target.value }))}
                    className={inputClass()}
                  >
                    <option value="HTML">HTML</option>
                    <option value="MarkdownV2">MarkdownV2</option>
                  </select>
                </Field>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <div className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">更新检测与通知</div>
            <div className="space-y-2">
              <ToggleRow
                title="自动检查更新"
                checked={configForm.enableUpdateCheck}
                onChange={(checked) =>
                  setConfigForm((prev) => ({
                    ...prev,
                    enableUpdateCheck: checked,
                    updateCheckCron:
                      checked && (!prev.updateCheckCron || ["off", "false", "0", "no"].includes(prev.updateCheckCron.trim().toLowerCase()))
                        ? "0 18 * * *"
                        : prev.updateCheckCron,
                  }))
                }
              />
              <ToggleRow
                title="检测到更新后通知"
                checked={configForm.notifyOnUpdate}
                onChange={(checked) => setConfigForm((prev) => ({ ...prev, notifyOnUpdate: checked }))}
              />
              {configForm.enableUpdateCheck && (
                <Field label="更新检测 Cron">
                  <input
                    type="text"
                    value={configForm.updateCheckCron}
                    onChange={(event) => setConfigForm((prev) => ({ ...prev, updateCheckCron: event.target.value }))}
                    placeholder="0 18 * * *"
                    className={inputClass()}
                  />
                </Field>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <div className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">自动任务</div>
            <div className="grid grid-cols-1 gap-2">
              <ToggleRow
                title="自动清理镜像"
                checked={configForm.autoCleanImages}
                onChange={(checked) => setConfigForm((prev) => ({ ...prev, autoCleanImages: checked }))}
              />
              {configForm.autoCleanImages && (
                <Field label="清理 Cron">
                  <input
                    type="text"
                    value={configForm.cleanImagesCron}
                    onChange={(event) => setConfigForm((prev) => ({ ...prev, cleanImagesCron: event.target.value }))}
                    placeholder="3 2 * * *"
                    className={inputClass()}
                  />
                </Field>
              )}
              <ToggleRow
                title="自动更新容器"
                checked={configForm.autoUpdateContainers}
                onChange={(checked) => setConfigForm((prev) => ({ ...prev, autoUpdateContainers: checked }))}
              />
              {configForm.autoUpdateContainers && (
                <Field label="更新 Cron">
                  <input
                    type="text"
                    value={configForm.updateContainersCron}
                    onChange={(event) => setConfigForm((prev) => ({ ...prev, updateContainersCron: event.target.value }))}
                    placeholder="0 */6 * * *"
                    className={inputClass()}
                  />
                </Field>
              )}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <ToggleRow
                  title="备份 JSON"
                  checked={configForm.autoBackupJson}
                  onChange={(checked) => setConfigForm((prev) => ({ ...prev, autoBackupJson: checked }))}
                />
                <ToggleRow
                  title="备份 Compose"
                  checked={configForm.autoBackupCompose}
                  onChange={(checked) => setConfigForm((prev) => ({ ...prev, autoBackupCompose: checked }))}
                />
              </div>
              {(configForm.autoBackupJson || configForm.autoBackupCompose) && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {configForm.autoBackupJson && (
                    <Field label="JSON Cron">
                      <input
                        type="text"
                        value={configForm.backupJsonCron}
                        onChange={(event) => setConfigForm((prev) => ({ ...prev, backupJsonCron: event.target.value }))}
                        placeholder="0 1 * * *"
                        className={inputClass()}
                      />
                    </Field>
                  )}
                  {configForm.autoBackupCompose && (
                    <Field label="Compose Cron">
                      <input
                        type="text"
                        value={configForm.backupComposeCron}
                        onChange={(event) => setConfigForm((prev) => ({ ...prev, backupComposeCron: event.target.value }))}
                        placeholder="30 1 * * *"
                        className={inputClass()}
                      />
                    </Field>
                  )}
                  <Field label="保留份数">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={configForm.backupMaxFiles}
                      onChange={(event) => setConfigForm((prev) => ({ ...prev, backupMaxFiles: event.target.value.replace(/[^\d]/g, "") }))}
                      placeholder="20"
                      className={inputClass()}
                    />
                  </Field>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <div className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">网络与宿主机</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="主机 LAN IP">
                <input
                  type="text"
                  value={configForm.hostLanIP}
                  onChange={(event) => setConfigForm((prev) => ({ ...prev, hostLanIP: event.target.value }))}
                  placeholder="192.168.x.x"
                  className={inputClass()}
                />
              </Field>
              <Field label="代理类型">
                <select
                  value={configForm.proxyType}
                  onChange={(event) => setConfigForm((prev) => ({ ...prev, proxyType: event.target.value }))}
                  className={inputClass()}
                >
                  <option value="none">不使用代理</option>
                  <option value="socks5">SOCKS5</option>
                  <option value="http">HTTP</option>
                </select>
              </Field>
            </div>
            {configForm.proxyType !== "none" && (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="代理地址">
                  <input
                    type="text"
                    value={configForm.proxyHost}
                    onChange={(event) => setConfigForm((prev) => ({ ...prev, proxyHost: event.target.value }))}
                    placeholder="127.0.0.1"
                    className={inputClass()}
                  />
                </Field>
                <Field label="代理端口">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={configForm.proxyPort}
                    onChange={(event) => setConfigForm((prev) => ({ ...prev, proxyPort: event.target.value.replace(/[^\d]/g, "") }))}
                    placeholder="7890"
                    className={inputClass()}
                  />
                </Field>
                <Field label="代理用户名">
                  <input
                    type="text"
                    value={configForm.proxyUsername}
                    onChange={(event) => setConfigForm((prev) => ({ ...prev, proxyUsername: event.target.value }))}
                    placeholder="可选"
                    className={inputClass()}
                  />
                </Field>
                <Field label="代理密码">
                  <input
                    type="password"
                    value={configForm.proxyPassword}
                    onChange={(event) => setConfigForm((prev) => ({ ...prev, proxyPassword: event.target.value }))}
                    placeholder="可选"
                    className={inputClass()}
                  />
                </Field>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">QQ 官方 Bot</div>
              <ToggleRow
                title={configForm.qqbotEnabled ? "开启" : "关闭"}
                checked={configForm.qqbotEnabled}
                onChange={(checked) => setConfigForm((prev) => ({ ...prev, qqbotEnabled: checked }))}
              />
            </div>
            <div className="grid grid-cols-1 gap-3">
              <Field label="App ID">
                <input
                  type="text"
                  value={configForm.qqbotAppId}
                  onChange={(event) => setConfigForm((prev) => ({ ...prev, qqbotAppId: event.target.value }))}
                  placeholder="QQ Bot App ID"
                  className={inputClass()}
                />
              </Field>
              <Field label="App Secret">
                <div className="relative">
                  <input
                    type={showQQBotSecret ? "text" : "password"}
                    value={configForm.qqbotAppSecret}
                    onChange={(event) => setConfigForm((prev) => ({ ...prev, qqbotAppSecret: event.target.value }))}
                    placeholder="QQ Bot App Secret"
                    className={inputClass("pr-10")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowQQBotSecret((prev) => !prev)}
                    title={showQQBotSecret ? "隐藏 Secret" : "显示 Secret"}
                    aria-label={showQQBotSecret ? "隐藏 Secret" : "显示 Secret"}
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showQQBotSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </Field>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <ToggleRow
                  title="Markdown 消息"
                  checked={configForm.qqbotMarkdownEnabled}
                  onChange={(checked) => setConfigForm((prev) => ({ ...prev, qqbotMarkdownEnabled: checked }))}
                />
                <ToggleRow
                  title="互动按钮"
                  checked={configForm.qqbotButtonsEnabled}
                  onChange={(checked) => setConfigForm((prev) => ({ ...prev, qqbotButtonsEnabled: checked }))}
                />
              </div>
              <Field label="用户 OpenID 白名单">
                <textarea
                  rows={3}
                  value={configForm.qqbotAllowedUserOpenids}
                  onChange={(event) => setConfigForm((prev) => ({ ...prev, qqbotAllowedUserOpenids: event.target.value }))}
                  placeholder="每行一个用户 OpenID"
                  className={inputClass("resize-y")}
                />
              </Field>
              <Field label="群 OpenID 白名单">
                <textarea
                  rows={3}
                  value={configForm.qqbotAllowedGroupOpenids}
                  onChange={(event) => setConfigForm((prev) => ({ ...prev, qqbotAllowedGroupOpenids: event.target.value }))}
                  placeholder="每行一个群 OpenID"
                  className={inputClass("resize-y")}
                />
              </Field>
              {recentQQBotIdentities.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-400">最近入站身份</div>
                  {recentQQBotIdentities.slice(0, 5).map((identity, index) => (
                    <div
                      key={`${identity.kind || "user"}-${identity.openid}-${index}`}
                      className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs dark:border-slate-700"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-slate-700 dark:text-slate-300">
                          {identity.kind === "group" ? "群" : "用户"} {identity.label || ""}
                        </div>
                        <div className="truncate font-mono text-slate-500 dark:text-slate-400">{identity.openid}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => appendQQBotIdentity(identity.openid || "", identity.kind)}
                        className="rounded-lg border border-blue-200 px-2 py-1 font-medium text-blue-600 dark:border-blue-900/50 dark:text-blue-400"
                      >
                        加入
                      </button>
                      <button
                        type="button"
                        onClick={() => copyText(identity.openid || "")}
                        title="复制 OpenID"
                        aria-label="复制 OpenID"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className={cardClass()}>
        <h2 className="mb-3 text-base font-bold text-slate-900 dark:text-slate-100">更新黑名单</h2>
        <div className="mb-3 flex items-center gap-2">
          <input
            type="text"
            list="blacklist-image-options"
            value={blacklistDraft}
            onChange={(event) => setBlacklistDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                handleAddBlacklistItem()
              }
            }}
            placeholder="输入或选择镜像名"
            className={inputClass("flex-1")}
          />
          <datalist id="blacklist-image-options">
            {blacklistSuggestions.map((item) => (
              <option key={item} value={item} />
            ))}
          </datalist>
          <button
            type="button"
            onClick={handleAddBlacklistItem}
            className="min-h-10 shrink-0 rounded-xl border border-blue-200 bg-blue-50 px-3 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-100 dark:border-blue-900/50 dark:bg-blue-900/20 dark:text-blue-400"
          >
            添加
          </button>
        </div>
        <textarea
          value={updateBlacklist.join("\n")}
          onChange={(event) => setUpdateBlacklist(event.target.value.split("\n").filter(Boolean))}
          rows={6}
          className={inputClass("resize-y")}
          placeholder="nginx&#10;redis"
        />
        <button
          type="button"
          onClick={() => handleSaveBlacklist(updateBlacklist)}
          className="mt-3 flex w-full min-h-10 items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-600"
        >
          <CheckCircle2 className="h-4 w-4" />
          保存黑名单
        </button>
      </div>
    </div>
  )
}
