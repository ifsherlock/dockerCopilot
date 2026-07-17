import React, { useState } from 'react'
import { Github, BadgeInfo, HelpCircle, Sparkles, Upload, HardDrive, AlertTriangle, X, Link as LinkIcon } from 'lucide-react'
import { cn } from '../utils/cn.js'
import { useVersionCheck } from '../hooks/useVersionCheck.js'
import wechatImg from '../assets/wechat.jpg'
import alipayImg from '../assets/alipay.jpg'
import logoImg from '../assets/DockerCopilot-logo.png'

export function About() {
  const [showDonate, setShowDonate] = useState(false)
  const {
    isUpdating,
    updateMessage,
    updateProgress,
    isReconnectChecking,
    uploadProgramUpdate
  } = useVersionCheck()

  return (
    <div className="w-full">
      <div className="space-y-6">
        <div className="card p-8 flex flex-col items-center text-center relative overflow-hidden">
          <div className="relative mb-4">
            <div className="absolute inset-0 bg-primary-400/20 blur-xl rounded-full"></div>
            <img src={logoImg} alt="Docker Copilot" className="relative w-20 h-20 rounded-2xl shadow-lg" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Docker Copilot</h1>
          <p className="text-gray-600 dark:text-gray-400 max-w-lg mx-auto mb-6">
            一个简洁、优雅且强大的 Docker 容器管理工具，旨在为您提供流畅的容器运维体验。
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <a href="https://github.com/ifsherlock/dockerCopilot" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors shadow-sm">
              <Github className="h-4 w-4" /><span>GitHub</span>
            </a>
            <a href="https://github.com/ifsherlock/dockerCopilot/issues" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2 bg-white text-gray-900 border-2 border-gray-900 rounded-lg hover:bg-gray-50 transition-colors shadow-sm">
              <HelpCircle className="h-4 w-4" /><span>反馈建议</span>
            </a>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card p-6 flex flex-col h-full">
            <div className="flex items-center gap-2 mb-4"><span className="text-lg leading-none">💰</span><h3 className="text-lg font-bold text-gray-900 dark:text-white">致谢 / Thanks</h3></div>
            <div className="text-gray-600 dark:text-gray-400 leading-relaxed flex-1 space-y-3">
              <p>
                感谢原作者{' '}
                <a href="https://github.com/onlyLTY" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300">
                  onlyLTY <LinkIcon className="h-3.5 w-3.5" />
                </a>{' '}
                开源{' '}
                <a href="https://github.com/onlyLTY/dockerCopilot" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300">
                  Docker Copilot <LinkIcon className="h-3.5 w-3.5" />
                </a>
                ；本项目核心源码由 onlyLTY 编写。
              </p>
              <p>也感谢所有使用者的建议、反馈和鼓励，让这个工具持续变得更好。</p>
            </div>
            <button onClick={() => setShowDonate(true)} className="mt-5 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors font-medium">
              <span className="text-base leading-none">💰</span> 支持原作者
            </button>
          </div>
          <div className="card p-6 flex flex-col h-full">
            <div className="flex items-center gap-2 mb-4"><Sparkles className="h-5 w-5 text-purple-500" /><h3 className="text-lg font-bold text-gray-900 dark:text-white">改版声明</h3></div>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">本项目使用AI进行二次开发，增加了视图模式，tgbot交互等功能，请在理解风险的前提下使用：容器管理、程序自更新和自动化操作可能影响正在运行的服务；使用者应自行备份配置并承担由环境差异、误操作或第三方服务变化带来的风险。</p>
          </div>
        </div>

        <div className="card p-6 sm:p-8 border-2 border-primary-100 dark:border-primary-900/30">
          <div className="flex items-start gap-3 mb-5">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300 shrink-0">
              <BadgeInfo className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">上传二进制文件更新</h2>
              <p className="text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">上传匹配架构的 Linux 更新包即可。</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-2">
            <div className="rounded-2xl border border-dashed border-primary-300 dark:border-primary-700 bg-primary-50/50 dark:bg-primary-900/10 p-4 sm:p-5">
              <div className="flex items-start gap-3 text-xs sm:text-sm text-primary-900 dark:text-primary-100 mb-4">
                <HardDrive className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <div className="font-semibold">支持文件</div>
                  <div className="mt-1 text-primary-800/80 dark:text-primary-200/80">支持二进制或 tar.gz，系统会校验架构。</div>
                </div>
              </div>

              <label className={cn(
                "inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all",
                isUpdating
                  ? 'bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-slate-700 cursor-not-allowed'
                  : 'bg-white dark:bg-slate-900 text-primary-700 dark:text-primary-300 border-primary-300 dark:border-primary-700 hover:bg-primary-50 dark:hover:bg-primary-900/20 cursor-pointer'
              )}
              onDragOver={(e) => { e.preventDefault(); if (!isUpdating) e.currentTarget.classList.add('ring-2', 'ring-primary-400') }}
              onDragLeave={(e) => { e.currentTarget.classList.remove('ring-2', 'ring-primary-400') }}
              onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('ring-2', 'ring-primary-400'); if (isUpdating) return; const file = e.dataTransfer.files?.[0]; if (file) uploadProgramUpdate(file) }}>
                <Upload className="h-4 w-4" />
                拖拽或选择文件更新
                <input
                  type="file"
                  className="hidden"
                  disabled={isUpdating}
                  accept=".gz,.tgz,.tar.gz,application/gzip,application/x-gzip,application/octet-stream"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (file) uploadProgramUpdate(file)
                  }}
                />
              </label>
            </div>

            <div className="rounded-2xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/70 dark:bg-amber-900/10 p-4 sm:p-5">
              <div className="flex items-start gap-3 text-xs sm:text-sm text-amber-900 dark:text-amber-100">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>更新会短暂重启服务，请确认架构匹配并提前备份配置。</div>
              </div>
            </div>
          </div>

          {(updateMessage || isUpdating) && (
            <div className="mt-5 rounded-2xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/60 p-4">
              {updateMessage && (
                <div className="text-sm text-gray-700 dark:text-gray-200 mb-3">{updateMessage}</div>
              )}
              {isUpdating && (
                <>
                  <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1.5">
                    <span>{isReconnectChecking ? '服务恢复检测中' : '上传更新进度'}</span>
                    <span>{Math.max(0, Math.min(100, Number(updateProgress) || 0))}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden">
                    <div
                      className="h-full bg-primary-500 transition-all duration-500"
                      style={{ width: `${Math.max(0, Math.min(100, Number(updateProgress) || 0))}%` }}
                    />
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {showDonate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowDonate(false)}></div>
            <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 p-6">
              <button onClick={() => setShowDonate(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"><X className="h-5 w-5" /></button>
              <div className="text-center mb-5">
                <div className="mx-auto mb-2 text-3xl leading-none">💰</div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">支持原作者 onlyLTY</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">如果原项目帮到了你，可以请原作者喝一瓶快乐水。</p>
              </div>
              <div className="flex flex-wrap justify-center gap-8">
                <div className="group flex flex-col items-center"><div className="w-40 h-40 bg-white p-2 rounded-xl shadow-lg border border-gray-100"><img src={wechatImg} alt="微信赞赏码" className="w-full h-full object-contain" /></div><span className="mt-3 text-sm font-medium text-gray-600 dark:text-gray-400">微信支付</span></div>
                <div className="group flex flex-col items-center"><div className="w-40 h-40 bg-white p-2 rounded-xl shadow-lg border border-gray-100"><img src={alipayImg} alt="支付宝赞赏码" className="w-full h-full object-contain" /></div><span className="mt-3 text-sm font-medium text-gray-600 dark:text-gray-400">支付宝</span></div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
