"""配置管理模块"""
import os
import json
from typing import List, Dict, Optional
from dataclasses import dataclass, field

# 尝试加载 .env 文件
try:
    from dotenv import load_dotenv
    load_dotenv()  # 加载 .env 文件
except ImportError:
    pass  # 如果没有安装 python-dotenv，继续使用环境变量




@dataclass
class ProxyConfig:
    """Telegram Bot proxy config"""
    type: str = "none"  # none | socks5 | http
    host: str = ""
    port: int = 0
    username: str = ""
    password: str = ""

    def url(self) -> str:
        if self.type == "none" or not self.host or not self.port:
            return ""
        scheme = "socks5" if self.type == "socks5" else "http"
        auth = ""
        if self.username:
            auth = self.username
            if self.password:
                auth += f":{self.password}"
            auth += "@"
        return f"{scheme}://{auth}{self.host}:{self.port}"


@dataclass
class DockerCopilotInstance:
    """单个Docker Copilot实例配置"""
    name: str          # 实例名称（用于标识）
    api_url: str       # API地址
    secret_key: str    # 访问密钥
    timeout: int = 30  # 超时时间


@dataclass
class DockerCopilotConfig:
    """Docker Copilot配置（支持多实例）"""
    instances: List[DockerCopilotInstance]
    default_instance: str = ""  # 默认实例名称


@dataclass
class TelegramConfig:
    """Telegram Bot配置"""
    bot_token: str
    chat_ids: List[str]
    polling_interval: int = 1
    update_check_cron: str = "*/10 * * * *"  # 容器更新检测cron表达式（默认每10分钟，5位：分 时 日 月 星期）
    notify_on_update: bool = True      # 是否发送更新通知
    update_blacklist: List[str] = field(default_factory=list)  # 更新黑名单（这些容器不发送更新通知，也不会被自动更新，不区分实例）
    auto_clean_images: bool = False    # 是否启用自动清理镜像（启用后自动发送清理通知）
    clean_images_cron: str = "0 2 * * *"  # 镜像清理cron表达式（默认每天凌晨2点，5位：分 时 日 月 星期）
    auto_update_containers: bool = False  # 是否启用容器自动更新（启用后自动发送更新通知）
    update_containers_cron: str = "0 3 * * 0"  # 容器自动更新cron表达式（默认每周日凌晨3点，5位：分 时 日 月 星期）
    proxy: ProxyConfig = field(default_factory=ProxyConfig)


@dataclass
class Config:
    """应用配置"""
    dockercopilot: DockerCopilotConfig
    telegram: TelegramConfig


def load_config(config_path: str = None) -> Config:
    """加载配置

    配置文件查找优先级：
    1. config.json（自动创建，支持动态修改）
    2. 环境变量（最高优先级，覆盖文件配置）
    """
    data = {}
    config_source = "环境变量"

    # 尝试加载 config.json
    json_paths = [
        "/app/config/config.json",        # Docker 容器
        os.path.join(os.path.dirname(os.path.dirname(__file__)), "app", "config", "config.json"),
        "app/config/config.json",
        "config.json",                    # 兼容旧版
    ]

    for json_path in json_paths:
        if os.path.exists(json_path):
            try:
                with open(json_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                print(f"✅ 已加载配置文件: {json_path}")
                config_source = "config.json"
                break
            except Exception as e:
                print(f"⚠️ 读取配置文件失败: {e}")

    if not data:
        print(f"⚠️ 未找到配置文件，将使用环境变量或默认值")
        print(f"💡 首次启动时会自动创建 config.json")

    # 解析Docker Copilot实例配置
    instances = []
    dc_data = data.get('dockercopilot', {})

    # 支持两种配置方式：
    # 1. 环境变量模式（兼容旧版，单实例）
    # 2. JSON配置模式（支持多实例）

    if os.getenv('DOCKERCOPILOT_API_URLS'):
        # 新的环境变量模式：支持多实例
        # 格式：name1:url1:key1,name2:url2:key2
        instances_str = os.getenv('DOCKERCOPILOT_API_URLS', '')
        for inst_str in instances_str.split('|'):
            if inst_str:
                parts = inst_str.split('::', 2)  # 使用 :: 分隔
                if len(parts) == 3:
                    instances.append(DockerCopilotInstance(
                        name=parts[0],
                        api_url=parts[1],
                        secret_key=parts[2],
                        timeout=int(os.getenv('DOCKERCOPILOT_TIMEOUT', 30))
                    ))
    elif os.getenv('DOCKERCOPILOT_API_URL'):
        # 兼容旧的单实例环境变量
        instances.append(DockerCopilotInstance(
            name=os.getenv('DOCKERCOPILOT_NAME', 'default'),
            api_url=os.getenv('DOCKERCOPILOT_API_URL'),
            secret_key=os.getenv('DOCKERCOPILOT_SECRET_KEY', ''),
            timeout=int(os.getenv('DOCKERCOPILOT_TIMEOUT', 30))
        ))
    elif 'instances' in dc_data:
        # JSON配置模式：多实例
        for inst_data in dc_data.get('instances', []):
            instances.append(DockerCopilotInstance(
                name=inst_data.get('name', 'default'),
                api_url=inst_data.get('api_url', 'http://localhost:12712'),
                secret_key=inst_data.get('secret_key', ''),
                timeout=inst_data.get('timeout', 30)
            ))
    else:
        # 兼容旧的单实例配置
        instances.append(DockerCopilotInstance(
            name=dc_data.get('name', 'default'),
            api_url=dc_data.get('api_url', 'http://localhost:12712'),
            secret_key=dc_data.get('secret_key', ''),
            timeout=dc_data.get('timeout', 30)
        ))

    dockercopilot_config = DockerCopilotConfig(
        instances=instances,
        default_instance=dc_data.get('default_instance', instances[0].name if instances else 'default')
    )

    # 获取Telegram配置（优先级: 环境变量 > config.json）
    telegram_data = data.get('telegram', {})

    # 处理黑名单：只有当环境变量非空时才使用环境变量，否则使用config.json
    env_blacklist = os.getenv('TELEGRAM_UPDATE_BLACKLIST', '').strip()
    if env_blacklist:
        # 环境变量非空，使用环境变量
        update_blacklist = [name.strip() for name in env_blacklist.split(',') if name.strip()]
    else:
        # 环境变量为空或不存在，使用config.json
        update_blacklist = telegram_data.get('update_blacklist', [])

    # 处理cron表达式：优先使用config.json，除非环境变量明确设置
    # 这样用户通过界面修改的配置不会被环境变量覆盖
    def get_config_value(env_key: str, json_key: str, default_value):
        """获取配置值，优先使用config.json"""
        env_value = os.getenv(env_key, '').strip()
        if env_value:
            return env_value
        return telegram_data.get(json_key, default_value)

    proxy_data = telegram_data.get('proxy', {})
    proxy_config = ProxyConfig(
        type=os.getenv('TELEGRAM_PROXY_TYPE', proxy_data.get('type', 'none')).lower(),
        host=os.getenv('TELEGRAM_PROXY_HOST', proxy_data.get('host', '')),
        port=int(os.getenv('TELEGRAM_PROXY_PORT', proxy_data.get('port', 0)) or 0),
        username=os.getenv('TELEGRAM_PROXY_USERNAME', proxy_data.get('username', '')),
        password=os.getenv('TELEGRAM_PROXY_PASSWORD', proxy_data.get('password', '')),
    )

    telegram_config = TelegramConfig(
        bot_token=os.getenv('TELEGRAM_BOT_TOKEN', telegram_data.get('bot_token', '')),
        chat_ids=os.getenv('TELEGRAM_CHAT_IDS', '').split(',') if os.getenv('TELEGRAM_CHAT_IDS') else telegram_data.get('chat_ids', []),
        polling_interval=int(os.getenv('TELEGRAM_POLLING_INTERVAL', telegram_data.get('polling_interval', 1))),
        update_check_cron=get_config_value('TELEGRAM_UPDATE_CHECK_CRON', 'update_check_cron', '*/10 * * * *'),
        notify_on_update=os.getenv('TELEGRAM_NOTIFY_ON_UPDATE', str(telegram_data.get('notify_on_update', True))).lower() in ('true', '1', 'yes'),
        update_blacklist=update_blacklist,
        auto_clean_images=os.getenv('TELEGRAM_AUTO_CLEAN_IMAGES', str(telegram_data.get('auto_clean_images', False))).lower() in ('true', '1', 'yes'),
        clean_images_cron=get_config_value('TELEGRAM_CLEAN_IMAGES_CRON', 'clean_images_cron', '0 2 * * *'),
        auto_update_containers=os.getenv('TELEGRAM_AUTO_UPDATE_CONTAINERS', str(telegram_data.get('auto_update_containers', False))).lower() in ('true', '1', 'yes'),
        update_containers_cron=get_config_value('TELEGRAM_UPDATE_CONTAINERS_CRON', 'update_containers_cron', '0 3 * * 0'),
        proxy=proxy_config
    )

    return Config(
        dockercopilot=dockercopilot_config,
        telegram=telegram_config
    )
