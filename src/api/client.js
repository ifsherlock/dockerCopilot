import axios from 'axios'

// 动态获取 API 基础地址
// 优先级：环境变量 > window.__API_BASE_URL > localStorage > 当前主机 > 默认值
function getAPIBaseURL() {
  // 1. 最高优先级：环境变量（构建时注入）
  if (import.meta.env.VITE_API_BASE_URL) {
    console.log('Using build-time API URL:', import.meta.env.VITE_API_BASE_URL)
    return import.meta.env.VITE_API_BASE_URL
  }

  // 2. 检查全局变量（注入的配置）
  if (typeof window !== 'undefined' && window.__API_BASE_URL) {
    console.log('Using injected API URL:', window.__API_BASE_URL)
    return window.__API_BASE_URL
  }

  // 3. 检查 localStorage（用户保存的地址）
  const savedURL = localStorage.getItem('api_base_url')
  if (savedURL) {
    console.log('Using localStorage API URL:', savedURL)
    return savedURL
  }

  // 4. 使用当前主机
  if (typeof window !== 'undefined' && window.location.host) {
    const currentHostURL = `${window.location.protocol}//${window.location.host}`
    console.log('Using current host API URL:', currentHostURL)
    return currentHostURL
  }

  // 5. 最后的默认值
  const fallbackURL = 'http://localhost'
  console.log('Using fallback API URL:', fallbackURL)
  return fallbackURL
}

const API_BASE_URL = getAPIBaseURL()

// 创建axios实例
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// 请求拦截器 - 添加认证token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('docker_copilot_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器 - 处理认证过期
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // 只在有token的情况下移除它
      if (localStorage.getItem('docker_copilot_token')) {
        localStorage.removeItem('docker_copilot_token')
        // 触发自定义事件通知应用认证状态变化
        window.dispatchEvent(new CustomEvent('authChange', { detail: { authenticated: false } }))
      }
    }
    return Promise.reject(error)
  }
)

// 认证相关API
export const authAPI = {
  login: (secretKey) => {
    const formData = new FormData()
    formData.append('secretKey', secretKey)
    return apiClient.post('/api/auth', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
}

// 版本相关API
export const versionAPI = {
  getVersion: (type) => {
    // 如果type参数为空，则不添加查询参数
    if (!type) {
      return apiClient.get('/api/version')
    }
    return apiClient.get(`/api/version?type=${type}`)
  },
  updateProgram: (force = false) => apiClient.put(force ? '/api/program?force=1' : '/api/program'),
}

// 容器相关API
export const containerAPI = {
  getContainers: () => apiClient.get('/api/containers'),
  checkUpdates: () => apiClient.post('/api/containers/check-update'),
  startContainer: (id) => apiClient.post(`/api/container/${id}/start`),
  stopContainer: (id) => apiClient.post(`/api/container/${id}/stop`),
  restartContainer: (id) => apiClient.post(`/api/container/${id}/restart`),
  deleteContainer: (id) => apiClient.delete(`/api/container/${id}`),
  renameContainer: (id, newName) => {
    return apiClient.post(`/api/container/${id}/rename?newName=${encodeURIComponent(newName)}`)
  },
  updateContainer: (id, containerName, imageNameAndTag, delOldContainer) => {
    const formData = new FormData()
    formData.append('containerName', containerName)
    formData.append('imageNameAndTag', imageNameAndTag)
    formData.append('delOldContainer', delOldContainer ? 'true' : 'false')
    return apiClient.post(`/api/container/${id}/update`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
  backupContainer: () => apiClient.get('/api/container/backup'),
  listBackups: () => apiClient.get('/api/container/listBackups'),
  restoreContainer: (filename) => {
    return apiClient.post(`/api/container/backups/${filename}/restore`)
  },
  deleteBackup: (filename) => apiClient.delete(`/api/container/backups?filename=${encodeURIComponent(filename)}`),
  backupToCompose: () => apiClient.get('/api/container/backup2compose'),
}

// 镜像相关API
export const imageAPI = {
  getImages: () => apiClient.get('/api/images'),
  getIcons: () => apiClient.get('/api/icons'),
  deleteImage: (id, force = false) => apiClient.delete(`/api/image/${id}?force=${force}`),
  pullImage: (imageName, source, displayName) => apiClient.post('/api/image/pull', {
    imageName,
    source,
    displayName,
  }),
  getLogs: () => apiClient.get('/api/logs'),
  getAcceleratorLatency: () => apiClient.get('/api/image/accelerators/latency'),
  uploadIcon: (file, imageName, containerName) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('imageName', imageName)
    if (containerName) {
      formData.append('containerName', containerName)
    }
    return apiClient.post('/api/icons', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
}

// 进度查询API
export const progressAPI = {
  getProgress: (taskid) => apiClient.get(`/api/progress/${taskid}`),
}

// 程序更新任务查询（与通用进度接口保持语义区分）
export const programAPI = {
  getUpdateProgress: (taskid) => apiClient.get(`/api/progress/${taskid}`),
}

// Telegram Bot 配置 API
export const botAPI = {
  getConfig: () => apiClient.get('/api/bot/config'),
  saveConfig: (config) => apiClient.post('/api/bot/config', {
    ...config,
    proxyPort: config.proxyPort ? Number(config.proxyPort) : 0,
  }),
  getUpdateBlacklist: () => apiClient.get('/api/bot/update-blacklist'),
  saveUpdateBlacklist: (items) => apiClient.post('/api/bot/update-blacklist', { items }),
}

// GitHub API - 用于检查前端更新
export const githubAPI = {
  /**
   * 获取 GitHub 仓库的最新 Release
   * @param {string} owner - 仓库所有者
   * @param {string} repo - 仓库名称
   * @returns {Promise} 返回最新 Release 信息
   */
  getLatestRelease: async (owner, repo) => {
    try {
      const response = await axios.get(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, {
        timeout: 5000,
      })
      return response.data
    } catch (error) {
      console.warn('获取 GitHub 最新版本失败:', error.message)
      throw error
    }
  },

  /**
   * 获取 GitHub 仓库的所有 Releases
   * @param {string} owner - 仓库所有者
   * @param {string} repo - 仓库名称
   * @param {number} perPage - 每页返回数量
   * @returns {Promise} 返回 Release 列表
   */
  getReleases: async (owner, repo, perPage = 5) => {
    try {
      const response = await axios.get(`https://api.github.com/repos/${owner}/${repo}/releases`, {
        params: { per_page: perPage },
        timeout: 5000,
      })
      return response.data
    } catch (error) {
      console.warn('获取 GitHub Releases 列表失败:', error.message)
      throw error
    }
  },

  /**
   * 获取 GitHub 仓库信息
   * @param {string} owner - 仓库所有者
   * @param {string} repo - 仓库名称
   * @returns {Promise} 返回仓库信息
   */
  getRepoInfo: async (owner, repo) => {
    try {
      const response = await axios.get(`https://api.github.com/repos/${owner}/${repo}`, {
        timeout: 5000,
      })
      return response.data
    } catch (error) {
      console.warn('获取 GitHub 仓库信息失败:', error.message)
      throw error
    }
  },
}

export default apiClient
