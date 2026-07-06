// 内置常用镜像 logo 配置，移动端使用 public/logos 静态路径，避免跨 Next root 引入 PC 资源模块。
const MediaSaberLogo = '/m/logos/media-saber.png'
const MoviepilotLogo = '/m/logos/moviepilot.png'
const DockerCopilotLogo = '/m/logos/docker-copilot.png'
const MTPhotos = '/m/logos/mt-photos.png'
const ITToolsLogo = '/m/logos/it-tools.webp'
const SubStoreLogo = '/m/logos/sub-store.webp'
const JellyfinLogo = '/m/logos/jellyfin.png'
const RedisLogo = '/m/logos/redis.png'
const PostgresLogo = '/m/logos/postgres.png'
const SunPanelLogo = '/m/logos/sun-panel.png'
const QinglongLogo = '/m/logos/qinglong.svg'
const TransmissionLogo = '/m/logos/transmission.png'
const QBittorrentLogo = '/m/logos/qbittorrent.webp'
const FnDeskLogo = '/m/logos/fndesk.png'
const FNTVLogo = '/m/logos/fntv.png'
const CookiecloudLogo = '/m/logos/cookiecloud.png'
const CodeServerLogo = '/m/logos/code-server.png'
const IYUULogo = '/m/logos/iyuu.png'
const LuckyLogo = '/m/logos/lucky.png'
const EmbyserverLogo = '/m/logos/embyserver.png'
const AudiobookshelfLogo = '/m/logos/audiobookshelf.png'
const MySQLLogo = '/m/logos/mysql.png'
const OneApiLogo = '/m/logos/one-api.png'
const QDLogo = '/m/logos/qd.png'
const OneHubogo = '/m/logos/one-hub.png'
const ByteMuseLogo = '/m/logos/byte-muse.jpg'
const NextChatLogo = '/m/logos/next-chat.png'
const MdcNgLogo = '/m/logos/mdc-ng.png'
const RichDogLogo = '/m/logos/rich-dog.svg'
const CpaLogo = '/m/logos/cpa.jpg'
const OllamaLogo = '/m/logos/ollama.png'
const MomoLogo = '/m/logos/momo.png'
const PansouWebLogo = '/m/logos/pansou.jpg'
const ImmortalLogo = '/m/logos/immortal.png'
const AsynqmonLogo = '/m/logos/asynqmon.png'
const OctopusLogo = '/m/logos/octopus.svg'
const LobeChatLogo = '/m/logos/lobechat.png'
const FlareSolverrLogo = '/m/logos/flaresolverr.png'
const Ztx888OpenWebuiLogo = '/m/logos/openwebui.png'
const HermesAgentLogo = '/m/logos/hermes-agent.png'

// 内置常用镜像logo配置
// 格式: { "镜像名称": "logo 文件路径" }
// 支持镜像名称匹配，如 "nginx" 会匹配 "nginx:latest", "nginx:alpine" 等

// 导入图片资源

export const builtInImageLogos: Record<string, string> = {
  "xylplm/media-saber": MediaSaberLogo,
  "xylplm/bm-simulate-xunlei-api-to-media-saber": MediaSaberLogo,
  "jxxghp/moviepilot-v2": MoviepilotLogo,
  "0nlylty/dockercopilot": DockerCopilotLogo,
  "ifsherlock/dockercopilot": DockerCopilotLogo,
  "jaysherlock/dockercopilot": DockerCopilotLogo,
  "dockercopilot": DockerCopilotLogo,
  "mtphotos/mt-photos": MTPhotos,
  "kqstone/mt-photos-insightface-unofficial": MTPhotos,
  "mtphotos/mt-photos-ai": MTPhotos,
  "corentinth/it-tools": ITToolsLogo,
  "xream/sub-store": SubStoreLogo,
  "nyanmisaka/jellyfin": JellyfinLogo,
  "redis": RedisLogo,
  "postgres": PostgresLogo,
  "hslr/sun-panel": SunPanelLogo,
  "whyour/qinglong": QinglongLogo,
  "linuxserver/transmission": TransmissionLogo,
  "linuxserver/qbittorrent": QBittorrentLogo,
  "imgzcq/fndesk": FnDeskLogo,
  "qiaokes/fntv-record-view": FNTVLogo,
  "easychen/cookiecloud": CookiecloudLogo,
  "codercom/code-server": CodeServerLogo,
  "iyuucn/iyuuplus": IYUULogo,
  "iyuucn/iyuuplus-dev-nodb": IYUULogo,
  "gdy666/lucky": LuckyLogo,
  "amilys/embyserver": EmbyserverLogo,
  "audiobookshelf": AudiobookshelfLogo,
  "mysql": MySQLLogo,
  "qdtoday/qd": QDLogo,
  "songquanpeng/one-api": OneApiLogo,
  "martialbe/one-api": OneHubogo,
  "envyafish/byte-muse":ByteMuseLogo,
  "yidadaa/chatgpt-next-web":NextChatLogo,
  "mdcng/mdc":MdcNgLogo,
  "zhaoyangguang/rebatedog":RichDogLogo,
  "eceasy/cli-proxy-api-plus": CpaLogo,
  "eceasy/cli-proxy-api": CpaLogo,
  "ollama/ollama": OllamaLogo,
  "momo20260105/momo": MomoLogo,
  "fish2018/pansou-web": PansouWebLogo,
  "envyafish/immortal": ImmortalLogo,
  "hibiken/asynqmon":AsynqmonLogo,
  "bestrui/octopus": OctopusLogo,
  "lobehub/lobe-chat": LobeChatLogo,
  "flaresolverr/flaresolverr": FlareSolverrLogo,
  "ztx888/openwebui": Ztx888OpenWebuiLogo,
  "nousresearch/hermes-agent": HermesAgentLogo
};

// 获取镜像的logo
// 优先级: 用户自定义精确匹配 > 内置精确匹配 > 默认图标
const getLogoCandidates = (imageName: string, aliases: string[] = []) => {
  const values = [imageName, ...aliases].map(value => String(value || '').trim()).filter(Boolean);
  const candidates: string[] = [];
  const add = (value: string) => {
    const clean = String(value || '').replace(/^\//, '').trim();
    if (!clean || /^sha256[:/]/i.test(clean)) return;
    const noDigest = clean.split('@')[0];
    const noTag = noDigest.split(':')[0];
    [clean, noDigest, noTag, noTag.split('/').pop()].forEach(item => {
      const normalized = String(item || '').trim();
      if (normalized && !candidates.includes(normalized)) candidates.push(normalized);
    });
  };
  values.forEach(add);
  return candidates;
};

const findLogoInMap = (candidates: string[], logos: Record<string, string> = {}) => {
  const compact = (value: string) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const entries = Object.entries(logos || {}).filter(([key, url]) => key && url);
  for (const name of candidates) {
    const lower = name.toLowerCase();
    const compactName = compact(lower);
    const direct = entries.find(([key]) => {
      const base = String(key).split('@')[0].split(':')[0].toLowerCase();
      const simple = base.split('/').pop() || '';
      return base === lower || simple === lower || compact(base) === compactName || compact(simple) === compactName;
    });
    if (direct) return direct[1];
  }
  return null;
};

export const getCustomImageLogo = (imageName: string, customLogos: Record<string, string> = {}, aliases: string[] = []) => {
  const candidates = getLogoCandidates(imageName, aliases);
  return findLogoInMap(candidates, customLogos);
};

export const getBuiltInImageLogo = (imageName: string, aliases: string[] = []) => {
  const candidates = getLogoCandidates(imageName, aliases);
  return findLogoInMap(candidates, builtInImageLogos);
};

export const getImageLogo = (imageName: string, customLogos: Record<string, string> = {}, aliases: string[] = []) => {
  return getCustomImageLogo(imageName, customLogos, aliases) || getBuiltInImageLogo(imageName, aliases);
};

// 获取所有支持的镜像名称列表
export const getSupportedImageNames = () => {
  return Object.keys(builtInImageLogos);
};

// 检查镜像是否有内置logo
export const hasBuiltInLogo = (imageName: string, aliases: string[] = []) => {
  const candidates = getLogoCandidates(imageName, aliases);
  return Boolean(findLogoInMap(candidates, builtInImageLogos));
};
