import React from 'react'
import { Github, Mail, Heart, MessageSquare } from 'lucide-react'
import wechatImg from '../assets/wechat.jpg'
import alipayImg from '../assets/alipay.jpg'
import logoImg from '../assets/DockerCopilot-logo.png'

export function About() {
  return (
    <div className="max-w-7xl mx-auto">

      <div className="px-2 sm:px-6 py-4 pt-4 sm:pt-4 space-y-6">
        {/* 项目展示卡片 */}
        <div className="card p-8 flex flex-col items-center text-center relative overflow-hidden">
          <div className="relative mb-4">
            <div className="absolute inset-0 bg-primary-400/20 blur-xl rounded-full"></div>
            <img
              src={logoImg}
              alt="Docker Copilot"
              className="relative w-20 h-20 rounded-2xl shadow-lg"
            />
          </div>

          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Docker Copilot</h1>
          <p className="text-gray-600 dark:text-gray-400 max-w-lg mx-auto mb-6">
            一个简洁、优雅且强大的 Docker 容器管理工具，旨在为您提供流畅的容器运维体验。
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <a
              href="https://github.com/onlyLTY/dockercopilot"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors shadow-sm"
            >
              <Github className="h-4 w-4" />
              <span>GitHub</span>
            </a>
            <a
              href="mailto:onlylty@lty.wiki"
              className="flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
            >
              <Mail className="h-4 w-4" />
              <span>联系作者</span>
            </a>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 致谢 */}
          <div className="card p-6 flex flex-col h-full">
            <div className="flex items-center gap-2 mb-4">
              <Heart className="h-5 w-5 text-red-500" />
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">致谢 / Thanks</h3>
            </div>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed flex-1">
              非常感谢大家自项目开始以来的使用、建议、鼓励和支持。特别感谢绿联对本项目的支持。没有大家的反馈，Docker Copilot 不会是今天的样子。它是属于我们共同的作品。
            </p>
          </div>

          {/* 反馈 */}
          <div className="card p-6 flex flex-col h-full">
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare className="h-5 w-5 text-green-500" />
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">反馈与建议</h3>
            </div>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed mb-4">
              在项目使用中遇到 Bug 或有新的功能想法？欢迎提交 Issue 或直接联系我。您的每一个反馈都至关重要。
            </p>
            <a
              href="https://github.com/onlyLTY/dockercopilot/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-primary-600 dark:text-primary-400 hover:underline font-medium"
            >
              前往 GitHub Issues &rarr;
            </a>
          </div>
        </div>

        {/* 赞赏 */}
        <div className="card relative overflow-hidden p-6 sm:p-8 border-2 border-primary-100 dark:border-primary-900/30">
          <div className="absolute inset-0 bg-gradient-to-br from-primary-50 to-blue-50 dark:from-primary-900/10 dark:to-blue-900/10 pointer-events-none"></div>

          <div className="relative z-10 text-center">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">最后的最后</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-2xl mx-auto">
              如果您觉得 Docker Copilot 对您有帮助，可以请我喝一瓶快乐水。您的支持是我持续维护和更新项目的最大动力！
            </p>

            <div className="flex flex-wrap justify-center gap-8">
              <div className="group flex flex-col items-center">
                <div className="w-40 h-40 bg-white p-2 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 transform transition-transform group-hover:scale-105 group-hover:rotate-1">
                  <img
                    src={wechatImg}
                    alt="微信赞赏码"
                    className="w-full h-full object-contain"
                  />
                </div>
                <span className="mt-3 text-sm font-medium text-gray-600 dark:text-gray-400 group-hover:text-primary-600 transition-colors">微信支付</span>
              </div>

              <div className="group flex flex-col items-center">
                <div className="w-40 h-40 bg-white p-2 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 transform transition-transform group-hover:scale-105 group-hover:-rotate-1">
                  <img
                    src={alipayImg}
                    alt="支付宝赞赏码"
                    className="w-full h-full object-contain"
                  />
                </div>
                <span className="mt-3 text-sm font-medium text-gray-600 dark:text-gray-400 group-hover:text-blue-600 transition-colors">支付宝</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
