import React, { useState } from 'react'
import { Github, Heart, HelpCircle, Sparkles, X } from 'lucide-react'
import wechatImg from '../assets/wechat.jpg'
import alipayImg from '../assets/alipay.jpg'
import logoImg from '../assets/DockerCopilot-logo.png'

export function About() {
  const [showDonate, setShowDonate] = useState(false)

  return (
    <div className="max-w-[1800px] mx-auto">
      <div className="px-2 sm:px-6 py-4 pt-4 sm:pt-4 space-y-6">
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
            <a href="https://github.com/ifsherlock/dockerCopilot/issues" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors">
              <HelpCircle className="h-4 w-4" /><span>反馈建议</span>
            </a>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card p-6 flex flex-col h-full">
            <div className="flex items-center gap-2 mb-4"><Heart className="h-5 w-5 text-red-500" /><h3 className="text-lg font-bold text-gray-900 dark:text-white">致谢 / Thanks</h3></div>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed flex-1">感谢原作者 <b>onlyLTY</b> 开源 Docker Copilot；本项目核心源码由 onlyLTY 编写。也感谢所有使用者的建议、反馈和鼓励，让这个工具持续变得更好。</p>
            <button onClick={() => setShowDonate(true)} className="mt-5 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors font-medium">
              <Heart className="h-4 w-4" /> 支持原作者
            </button>
          </div>
          <div className="card p-6 flex flex-col h-full">
            <div className="flex items-center gap-2 mb-4"><Sparkles className="h-5 w-5 text-purple-500" /><h3 className="text-lg font-bold text-gray-900 dark:text-white">改版声明</h3></div>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed mb-3">当前改版在原项目基础上加入了 AI 辅助开发与功能扩展，重点增强多实例、更新流程、Bot 交互和 fnOS 打包体验。</p>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">请在理解风险的前提下使用：容器管理、程序自更新和自动化操作可能影响正在运行的服务；使用者应自行备份配置并承担由环境差异、误操作或第三方服务变化带来的风险。</p>
          </div>
        </div>

        <div className="card p-6 sm:p-8 border-2 border-primary-100 dark:border-primary-900/30">
          <div className="text-center">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">反馈与参与</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-5 max-w-2xl mx-auto">遇到 Bug、兼容问题或有功能建议，欢迎通过 GitHub Issues 反馈。请尽量附带版本、运行方式和复现步骤。</p>
            <a href="https://github.com/ifsherlock/dockerCopilot/issues" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors font-medium">
              <HelpCircle className="h-4 w-4" /> 前往 Issues
            </a>
          </div>
        </div>

        {showDonate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowDonate(false)}></div>
            <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 p-6">
              <button onClick={() => setShowDonate(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"><X className="h-5 w-5" /></button>
              <div className="text-center mb-5">
                <Heart className="h-8 w-8 text-red-500 mx-auto mb-2" />
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
