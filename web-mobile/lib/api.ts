const SHARED_TOKEN_KEY = 'docker_copilot_token'
const LEGACY_MOBILE_TOKEN_KEY = 'docker_copilot_mobile_token'

export const MOBILE_TOKEN_KEY = SHARED_TOKEN_KEY

export interface ApiResponse<T> {
  code: number
  msg: string
  data: T
}

export interface LoginData {
  jwt: string
}

export interface ContainerPortBinding {
  privatePort: number
  publicPort: number
  type: string
  ip: string
}

export interface ContainerEndpointLink {
  networkMode: string
  running: boolean
  hostIP: string
  ports: ContainerPortBinding[]
  suggestedURL: string
  needsManual: boolean
  exposedPorts: string[]
  editablePort: string
  source: string
}

export interface ContainerInfo {
  id: string
  status: string
  name: string
  usingImage: string
  createImage: string
  createTime: string
  runningTime: string
  haveUpdate: boolean
  isSelf: boolean
  endpointLink: ContainerEndpointLink
}

export interface ImageRepoLinks {
  dockerHub: string
  github: string
}

export interface ImageInfo {
  id: string
  name: string
  tag: string
  size: string
  inUsed: boolean
  usageState: string
  createTime: string
  cleanupCandidate: boolean
  cleanupReason: string
  multiRef: boolean
  haveUpdate: boolean
  repoTags?: string[]
  repoDigests?: string[]
  repoLinks: ImageRepoLinks
}

export interface TelegramConfig {
  bot_token?: string
  chat_ids?: string[]
  update_check_cron?: string
  notify_on_update?: boolean
  interactive_enabled?: boolean
  update_blacklist?: string[]
  auto_clean_images?: boolean
  clean_images_cron?: string
  auto_update_containers?: boolean
  update_containers_cron?: string
  auto_backup_json?: boolean
  backup_json_cron?: string
  auto_backup_compose?: boolean
  backup_compose_cron?: string
  backup_max_files?: number
  image_accelerators?: string[]
  default_image_accelerator?: string
  theme_mode?: string
  theme_appearance?: string
  proxy?: {
    type?: string
    host?: string
    port?: number
    username?: string
    password?: string
  }
}

export interface DockerCopilotConfig {
  host_lan_ip?: string
  default_instance?: string
  multi_instance_enabled?: boolean
  instances?: Array<{
    name?: string
    api_url?: string
    secret_key?: string
    timeout?: number
  }>
}

export interface RuntimeConfig {
  version?: string
  telegram?: TelegramConfig
  dockercopilot?: DockerCopilotConfig
}

export interface OperationLog {
  time: string
  type: string
  title: string
  message: string
}

export interface ContainerLogsData {
  id: string
  tail: string
  logs: string
}

export interface VersionInfo {
  version: string
  build_date: string
}

export interface VersionDetailInfo {
  version?: string
  buildDate?: string
  build_date?: string
  remoteVersion?: string
}

export interface ProgramUpdateResponse {
  updated?: boolean
  currentVersion?: string
  remoteVersion?: string
  taskID?: string
  taskId?: string
}

export interface ProgressInfo {
  taskID: string
  percentage: number
  message: string
  name: string
  detailMsg: string
  isDone: boolean
  logs: string[]
}

export interface AcceleratorLatencyInfo {
  source: string
  latency: number
  status: string
  error?: string
}

export interface SaveConfigPayload {
  botToken?: string
  chatIds?: string
  updateCheckCron?: string
  notifyOnUpdate?: boolean
  interactiveEnabled?: boolean
  updateBlacklist?: string
  autoCleanImages?: boolean
  cleanImagesCron?: string
  autoUpdateContainers?: boolean
  updateContainersCron?: string
  proxyType?: string
  proxyHost?: string
  proxyPort?: number
  proxyUsername?: string
  proxyPassword?: string
  hostLanIP?: string
  defaultInstance?: string
  multiInstanceEnabled?: boolean
  instances?: string
  autoBackupJson?: boolean
  backupJsonCron?: string
  autoBackupCompose?: boolean
  backupComposeCron?: string
  backupMaxFiles?: number
  imageAccelerators?: string
  defaultImageAccelerator?: string
  themeMode?: string
  themeAppearance?: string
}

export class ApiError extends Error {
  status: number
  code?: number

  constructor(message: string, status = 500, code?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export function getStoredToken(): string {
  if (typeof window === 'undefined') {
    return ''
  }

  const sharedToken = window.localStorage.getItem(MOBILE_TOKEN_KEY) || ''
  if (sharedToken) {
    return sharedToken
  }

  const legacyToken = window.localStorage.getItem(LEGACY_MOBILE_TOKEN_KEY) || ''
  if (legacyToken) {
    window.localStorage.setItem(MOBILE_TOKEN_KEY, legacyToken)
    window.localStorage.removeItem(LEGACY_MOBILE_TOKEN_KEY)
    return legacyToken
  }

  return ''
}

export function setStoredToken(token: string) {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(MOBILE_TOKEN_KEY, token)
  window.localStorage.removeItem(LEGACY_MOBILE_TOKEN_KEY)
}

export function clearStoredToken() {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.removeItem(MOBILE_TOKEN_KEY)
  window.localStorage.removeItem(LEGACY_MOBILE_TOKEN_KEY)
}

function getApiBaseUrl() {
  if (typeof window !== 'undefined') {
    const saved = window.localStorage.getItem('api_base_url')
    if (saved) {
      return saved
    }
    return window.location.origin
  }

  return process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:12712'
}

async function readApiResponse<T>(response: Response): Promise<ApiResponse<T>> {
  let payload: ApiResponse<T>

  try {
    payload = (await response.json()) as ApiResponse<T>
  } catch {
    throw new ApiError(`接口返回了无法解析的响应（HTTP ${response.status}）`, response.status)
  }

  if (!response.ok || payload.code >= 400) {
    const message = payload.msg || `请求失败（HTTP ${response.status}）`

    if (response.status === 401 || payload.code === 401) {
      clearStoredToken()
    }

    throw new ApiError(message, response.status || payload.code || 500, payload.code)
  }

  return payload
}

async function apiRequest<T>(path: string, init: RequestInit = {}, requiresAuth = true): Promise<T> {
  const headers = new Headers(init.headers || {})
  const token = getStoredToken()

  if (requiresAuth && token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const body = init.body
  if (!(body instanceof FormData) && body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers,
  })

  const payload = await readApiResponse<T>(response)
  return payload.data
}

export const mobileApi = {
  login(secretKey: string) {
    const formData = new FormData()
    formData.append('secretKey', secretKey)
    return apiRequest<LoginData>('/api/auth', {
      method: 'POST',
      body: formData,
    }, false)
  },

  getContainers() {
    return apiRequest<ContainerInfo[]>('/api/containers')
  },

  startContainer(id: string) {
    return apiRequest<unknown>(`/api/container/${id}/start`, {
      method: 'POST',
    })
  },

  stopContainer(id: string) {
    return apiRequest<unknown>(`/api/container/${id}/stop`, {
      method: 'POST',
    })
  },

  restartContainer(id: string) {
    return apiRequest<unknown>(`/api/container/${id}/restart`, {
      method: 'POST',
    })
  },

  updateContainer(id: string, containerName: string, imageNameAndTag: string) {
    const formData = new FormData()
    formData.append('containerName', containerName)
    formData.append('imageNameAndTag', imageNameAndTag)
    return apiRequest<unknown>(`/api/container/${id}/update`, {
      method: 'POST',
      body: formData,
    })
  },

  getContainerLogs(id: string, tail = '200') {
    return apiRequest<ContainerLogsData>(`/api/container/${id}/logs?tail=${encodeURIComponent(tail)}`)
  },

  getImages() {
    return apiRequest<ImageInfo[]>('/api/images')
  },

  getBackups() {
    return apiRequest<string[]>('/api/container/listBackups')
  },

  deleteImage(id: string, force = false) {
    return apiRequest<unknown>(`/api/image/${id}?force=${force}`, {
      method: 'DELETE',
    })
  },

  retagImage(id: string, payload: { name: string; tag: string; oldName?: string; oldTag?: string }) {
    return apiRequest<unknown>(`/api/image/${id}/retag`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  },

  pullImage(imageName: string, source: string, displayName: string) {
    return apiRequest<{ taskID: string }>('/api/image/pull', {
      method: 'POST',
      body: JSON.stringify({ imageName, source, displayName }),
    })
  },

  getUpdateBlacklist() {
    return apiRequest<string[]>('/api/bot/update-blacklist')
  },

  saveUpdateBlacklist(items: string[]) {
    return apiRequest<unknown>('/api/bot/update-blacklist', {
      method: 'POST',
      body: JSON.stringify({ items }),
    })
  },

  getIcons() {
    return apiRequest<Record<string, string>>('/api/icons')
  },

  getConfig() {
    return apiRequest<RuntimeConfig>('/api/bot/config')
  },

  saveConfig(payload: SaveConfigPayload) {
    return apiRequest<RuntimeConfig>('/api/bot/config', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  getOperationLogs() {
    return apiRequest<OperationLog[]>('/api/logs')
  },

  getProgress(taskId: string) {
    return apiRequest<ProgressInfo>(`/api/progress/${taskId}`, {}, false)
  },

  getAcceleratorLatency() {
    return apiRequest<AcceleratorLatencyInfo[]>('/api/image/accelerators/latency')
  },

  getVersion(type = '') {
    const suffix = type ? `?type=${encodeURIComponent(type)}` : ''
    return apiRequest<VersionInfo>(`/api/version${suffix}`)
  },

  getVersionDetail(type = '') {
    const suffix = type ? `?type=${encodeURIComponent(type)}` : ''
    return apiRequest<VersionDetailInfo>(`/api/version${suffix}`)
  },

  updateProgram(force = false) {
    return apiRequest<ProgramUpdateResponse>(force ? '/api/program?force=1' : '/api/program', {
      method: 'PUT',
    })
  },

  uploadProgram(file: File) {
    const formData = new FormData()
    formData.append('file', file)
    return apiRequest<ProgramUpdateResponse>('/api/program/upload', {
      method: 'POST',
      body: formData,
    })
  },
}
