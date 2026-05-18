import React, { useState } from 'react'
import { Key, LogIn, Eye, EyeOff } from 'lucide-react'
import { authAPI } from '../api/client.js'
import { cn } from '../utils/cn.js'
import logoImg from '../assets/DockerCopilot-logo.png'

export function Auth({ onLogin }) {
  const [secretKey, setSecretKey] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    const formData = new FormData(e.target)
    const key = formData.get('secretKey').trim()

    if (!key) {
      setError('请输入密钥')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const response = await authAPI.login(key)
      if (response.data.code === 200) {
        localStorage.setItem('docker_copilot_token', response.data.data.jwt)
        onLogin()
      } else {
        setError(response.data.msg || '认证失败')
      }
    } catch (err) {
      setError(err.response?.data?.msg || '网络错误，请检查后端服务')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-blue-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="max-w-md w-full space-y-6">
        {/* 头部 */}
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <img
              src={logoImg}
              alt="Docker Copilot"
              className="h-32 w-32 rounded-2xl object-cover"
            />
          </div>
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Docker Copilot</h2>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            请输入密钥进行认证
          </p>
        </div>

        {/* 表单 */}
        <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="secretKey" className="sr-only">
              密钥
            </label>
            <div className="relative">
              <input
                id="secretKey"
                name="secretKey"
                type={showPassword ? 'text' : 'password'}
                required
                className="input pl-10 pr-10"
                placeholder="请输入您的密钥"
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
              />
              <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <button
                type="button"
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-3">
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className={cn(
              'btn-primary w-full py-3 text-base font-medium',
              isLoading && 'opacity-50 cursor-not-allowed'
            )}
          >
            {isLoading ? (
              <div className="flex items-center space-x-2">
                <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>认证中...</span>
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <LogIn className="h-5 w-5" />
                <span>登录</span>
              </div>
            )}
          </button>
        </form>


      </div>
    </div>
  )
}
