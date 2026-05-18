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
// 优先级: 内置logo > 用户自定义 > 默认图标
export const getImageLogo = (imageName, customLogos = {}) => {
  // 先检查内置logo（优先级最高）
  const baseImageName = imageName.split(':')[0]; // 去掉tag部分

  // 优先匹配完整镜像名（包含 registry/namespace）
  if (builtInImageLogos[baseImageName]) {
    return builtInImageLogos[baseImageName];
  }

  // 尝试匹配最后一段镜像名（去掉 registry/namespace）
  const simpleName = baseImageName.split('/').pop();
  if (builtInImageLogos[simpleName]) {
    return builtInImageLogos[simpleName];
  }

  // 如果仍未匹配，使用关键字（子串）匹配
  for (const [key, url] of Object.entries(builtInImageLogos)) {
    if (!key) continue;
    try {
      if (baseImageName.includes(key) || simpleName.includes(key)) {
        return url;
      }
    } catch (e) {
      // 防御性代码：忽略任何异常并继续
    }
  }

  // 再检查用户自定义的logo
  if (customLogos[imageName]) {
    return customLogos[imageName];
  }
  if (customLogos[baseImageName]) {
    return customLogos[baseImageName];
  }
  if (customLogos[simpleName]) {
    return customLogos[simpleName];
  }

  // 尝试自定义图标的模糊匹配
  for (const [key, url] of Object.entries(customLogos)) {
    if (!key) continue;
    try {
      // 检查key是否是imageName的前缀（处理tag不同的情况）
      if (baseImageName === key || baseImageName.startsWith(key + ':') || baseImageName.startsWith(key + '/')) {
        return url;
      }
      // 反向检查：如果自定义图标配置的是 nginx:latest，但当前是 nginx
      if (key.split(':')[0] === baseImageName) {
        return url;
      }
    } catch (e) {
      // 忽略异常
    }
  }

  // 没有找到logo，返回null
  return null;
};

// 获取所有支持的镜像名称列表
export const getSupportedImageNames = () => {
  return Object.keys(builtInImageLogos);
};

// 检查镜像是否有内置logo
export const hasBuiltInLogo = (imageName) => {
  const baseImageName = imageName.split(':')[0];
  if (builtInImageLogos[baseImageName]) return true;
  const simpleName = baseImageName.split('/').pop();
  if (builtInImageLogos[simpleName]) return true;

  // 关键字（子串）匹配
  for (const key of Object.keys(builtInImageLogos)) {
    if (!key) continue;
    try {
      if (baseImageName.includes(key) || simpleName.includes(key)) return true;
    } catch (e) {
      // 忽略并继续
    }
  }
  return false;
};
