// 内置常用镜像logo配置
// 格式: { "镜像名称": "logo 文件路径" }
// 支持镜像名称匹配，如 "nginx" 会匹配 "nginx:latest", "nginx:alpine" 等

// 导入图片资源
import MediaSaberLogo from '../assets/logos/media-saber.png';
import MoviepilotLogo from '../assets/logos/moviepilot.png';
import DockerCopilotLogo from '../assets/logos/docker-copilot.png';
import MTPhotos from '../assets/logos/mt-photos.png';
import ITToolsLogo from '../assets/logos/it-tools.webp';
import SubStoreLogo from '../assets/logos/sub-store.webp';
import JellyfinLogo from '../assets/logos/jellyfin.png';
import RedisLogo from '../assets/logos/redis.png';
import PostgresLogo from '../assets/logos/postgres.png';
import SunPanelLogo from '../assets/logos/sun-panel.png';
import QinglongLogo from '../assets/logos/qinglong.svg';
import TransmissionLogo from '../assets/logos/transmission.png';
import QBittorrentLogo from '../assets/logos/qbittorrent.webp';
import FnDeskLogo from '../assets/logos/fndesk.png';
import FNTVLogo from '../assets/logos/fntv.png';
import CookiecloudLogo from '../assets/logos/cookiecloud.png';
import CodeServerLogo from '../assets/logos/code-server.png';
import IYUULogo from '../assets/logos/iyuu.png';
import LuckyLogo from '../assets/logos/lucky.png';
import EmbyserverLogo from '../assets/logos/embyserver.png';
import AudiobookshelfLogo from '../assets/logos/audiobookshelf.png';
import MySQLLogo from '../assets/logos/mysql.png';
import OneApiLogo from '../assets/logos/one-api.png';
import QDLogo from '../assets/logos/qd.png';
import OneHubogo from '../assets/logos/one-hub.png';
import ByteMuseLogo from '../assets/logos/byte-muse.jpg';
import NextChatLogo from '../assets/logos/next-chat.png';
import MdcNgLogo from '../assets/logos/mdc-ng.png';
import RichDogLogo from '../assets/logos/rich-dog.svg';
import CpaLogo from '../assets/logos/cpa.jpg';
import OllamaLogo from '../assets/logos/ollama.png';
import MomoLogo from '../assets/logos/momo.png';
import PansouWebLogo from '../assets/logos/pansou.jpg';
import ImmortalLogo from '../assets/logos/immortal.png';
import AsynqmonLogo from '../assets/logos/asynqmon.png';
import OctopusLogo from '../assets/logos/octopus.svg';
import LobeChatLogo from '../assets/logos/lobechat.png';
import FlareSolverrLogo from '../assets/logos/flaresolverr.png';
import Ztx888OpenWebuiLogo from '../assets/logos/openwebui.png';
import HermesAgentLogo from '../assets/logos/hermes-agent.png';

export const builtInImageLogos = {
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
const getLogoCandidates = (imageName, aliases = []) => {
  const values = [imageName, ...aliases].map(value => String(value || '').trim()).filter(Boolean);
  const candidates = [];
  const add = (value) => {
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

const findLogoInMap = (candidates, logos = {}) => {
  const compact = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const entries = Object.entries(logos || {}).filter(([key, url]) => key && url);
  for (const name of candidates) {
    const lower = name.toLowerCase();
    const compactName = compact(lower);
    const direct = entries.find(([key]) => {
      const base = String(key).split('@')[0].split(':')[0].toLowerCase();
      const simple = base.split('/').pop();
      return base === lower || simple === lower || compact(base) === compactName || compact(simple) === compactName;
    });
    if (direct) return direct[1];
  }
  return null;
};

export const getCustomImageLogo = (imageName, customLogos = {}, aliases = []) => {
  const candidates = getLogoCandidates(imageName, aliases);
  return findLogoInMap(candidates, customLogos);
};

export const getBuiltInImageLogo = (imageName, aliases = []) => {
  const candidates = getLogoCandidates(imageName, aliases);
  return findLogoInMap(candidates, builtInImageLogos);
};

export const getImageLogo = (imageName, customLogos = {}, aliases = []) => {
  return getCustomImageLogo(imageName, customLogos, aliases) || getBuiltInImageLogo(imageName, aliases);
};

// 获取所有支持的镜像名称列表
export const getSupportedImageNames = () => {
  return Object.keys(builtInImageLogos);
};

// 检查镜像是否有内置logo
export const hasBuiltInLogo = (imageName, aliases = []) => {
  const candidates = getLogoCandidates(imageName, aliases);
  return Boolean(findLogoInMap(candidates, builtInImageLogos));
};
