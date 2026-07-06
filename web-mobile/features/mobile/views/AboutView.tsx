"use client"

import { Github, HelpCircle, Sparkles } from "lucide-react"

import { UpdateView, type UpdateViewProps } from "./UpdateView"

type AboutViewProps = UpdateViewProps & {
  currentOrigin: string
}

export function AboutView(props: AboutViewProps) {
  const {
    currentOrigin,
    version,
    backendVersion,
    remoteVersion,
    hasBackendUpdate,
    isUpdatingProgram,
    showForceUpdate,
    updateMessage,
    updateProgress,
    updateTaskId,
    isReconnectChecking,
    postUpdateNeedsRefresh,
    pendingProgramFile,
    setPendingProgramFile,
    handleCheckProgramUpdates,
    handleRemoteProgramUpdate,
    handleUploadProgramUpdate,
    handleRefreshAfterProgramUpdate,
  } = props

  return (
    <div className="space-y-4">
            <div className="rounded-2xl bg-white dark:bg-slate-900 p-5 text-center shadow-sm ring-1 ring-slate-100 dark:ring-slate-700">
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-900/20">
                <img
                  src={`${currentOrigin}/m/logo.png`}
                  alt="Docker Copilot"
                  className="h-14 w-14 rounded-xl object-contain"
                />
              </div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Docker Copilot</h2>
              {version && (
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  版本 {version.version} · {version.build_date}
                </p>
              )}
              <p className="mt-3 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                一个简洁、优雅且强大的 Docker 容器管理工具，旨在为您提供流畅的容器运维体验。
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <a
                  href="https://github.com/onlyLTY/dockerCopilot"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                >
                  <Github className="h-4 w-4" />
                  <span>GitHub</span>
                </a>
                <a
                  href="https://github.com/onlyLTY/dockerCopilot/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <HelpCircle className="h-4 w-4" />
                  <span>反馈建议</span>
                </a>
              </div>
            </div>

            <UpdateView
              version={version}
              backendVersion={backendVersion}
              remoteVersion={remoteVersion}
              hasBackendUpdate={hasBackendUpdate}
              isUpdatingProgram={isUpdatingProgram}
              showForceUpdate={showForceUpdate}
              updateMessage={updateMessage}
              updateProgress={updateProgress}
              updateTaskId={updateTaskId}
              isReconnectChecking={isReconnectChecking}
              postUpdateNeedsRefresh={postUpdateNeedsRefresh}
              pendingProgramFile={pendingProgramFile}
              setPendingProgramFile={setPendingProgramFile}
              handleCheckProgramUpdates={handleCheckProgramUpdates}
              handleRemoteProgramUpdate={handleRemoteProgramUpdate}
              handleUploadProgramUpdate={handleUploadProgramUpdate}
              handleRefreshAfterProgramUpdate={handleRefreshAfterProgramUpdate}
            />

            <div className="rounded-2xl bg-white dark:bg-slate-900 p-5 shadow-sm ring-1 ring-slate-100 dark:ring-slate-700">
              <div className="mb-3 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-500" />
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">改版声明</h3>
              </div>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                本项目使用AI进行二次开发，增加了视图模式，tgbot交互等功能，请在理解风险的前提下使用：容器管理、程序自更新和自动化操作可能影响正在运行的服务；使用者应自行备份配置并承担由环境差异、误操作或第三方服务变化带来的风险。
              </p>
            </div>

            <div className="rounded-2xl bg-white dark:bg-slate-900 p-5 shadow-sm ring-1 ring-slate-100 dark:ring-slate-700">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">致谢 / Thanks</h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                感谢原作者 onlyLTY 开源 Docker Copilot；本项目核心源码由 onlyLTY 编写，也感谢所有使用者的建议、反馈和鼓励，让这个工具持续变得更好。
              </p>
            </div>
          </div>
  )
}
