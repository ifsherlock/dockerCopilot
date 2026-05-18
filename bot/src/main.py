"""主入口程序"""
import logging
import sys
from .config import load_config
from .api import DockerCopilotClient
from .bot import TelegramBot


class TelebotPollingFilter(logging.Filter):
    """过滤 Telegram Bot long polling 的正常超时日志"""

    def filter(self, record):
        # 过滤掉 long polling 的超时和连接断开日志（这些是正常现象）
        message = record.getMessage()
        if any(keyword in message for keyword in [
            'ServerDisconnectedError',
            'Request timeout. Request: method=get url=getUpdates',
            'ClientConnectorError',
            'Connection timeout to host'
        ]):
            return False
        return True


# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)

# 降低第三方库的日志级别，减少冗余输出
logging.getLogger('telebot').setLevel(logging.WARNING)  # pyTelegramBotAPI
logging.getLogger('urllib3').setLevel(logging.WARNING)  # requests 库
logging.getLogger('asyncio').setLevel(logging.WARNING)  # asyncio

# 为 TeleBot 添加自定义过滤器，过滤 long polling 的正常超时日志
telebot_logger = logging.getLogger('TeleBot')
telebot_logger.addFilter(TelebotPollingFilter())

# 设置自定义模块的日志级别（过滤掉过于详细的日志）
logging.getLogger('src.api.dockercopilot_client').setLevel(logging.WARNING)  # 过滤容器解析详情
logging.getLogger('src.bot.telegram_bot').setLevel(logging.INFO)  # 保留Bot关键操作日志
logging.getLogger('src.bot.config_runtime').setLevel(logging.INFO)  # 配置管理日志
logging.getLogger('src.bot.instance_manager').setLevel(logging.WARNING)

logger = logging.getLogger(__name__)


def main():
    """主函数（支持多Docker Copilot实例）"""
    try:
        # 加载配置
        logger.info("正在加载配置...")
        config = load_config()

        # 验证配置
        if not config.dockercopilot.instances:
            logger.error("Docker Copilot实例未配置")
            sys.exit(1)

        if not config.telegram.bot_token:
            logger.error("Telegram Bot Token 未配置")
            sys.exit(1)

        if not config.telegram.chat_ids:
            logger.warning("Telegram Chat IDs 未配置，Bot将响应所有消息")

        # 初始化所有Docker Copilot API客户端
        docker_clients = {}
        for instance in config.dockercopilot.instances:
            logger.info(f"正在连接 Docker Copilot [{instance.name}]: {instance.api_url}")

            try:
                client = DockerCopilotClient(
                    api_url=instance.api_url,
                    secret_key=instance.secret_key,
                    timeout=instance.timeout
                )

                # 测试连接
                containers = client.get_containers()
                logger.info(f"✅ [{instance.name}] 连接成功，当前有 {len(containers)} 个容器")

                docker_clients[instance.name] = client

            except Exception as e:
                logger.error(f"❌ [{instance.name}] 连接失败: {e}")
                # 继续尝试连接其他实例

        if not docker_clients:
            logger.error("所有Docker Copilot实例连接失败")
            sys.exit(1)

        logger.info(f"成功连接 {len(docker_clients)}/{len(config.dockercopilot.instances)} 个实例")

        # 初始化Telegram Bot（传入多个客户端）
        if config.telegram.proxy.url():
            import os
            proxy_url = config.telegram.proxy.url()
            os.environ['HTTP_PROXY'] = proxy_url
            os.environ['HTTPS_PROXY'] = proxy_url
            os.environ['ALL_PROXY'] = proxy_url
            logger.info(f"🌐 Telegram Bot 已启用 {config.telegram.proxy.type.upper()} 代理: {config.telegram.proxy.host}:{config.telegram.proxy.port}")

        logger.info("正在初始化 Telegram Bot...")
        bot = TelegramBot(
            token=config.telegram.bot_token,
            docker_clients=docker_clients,
            default_instance=config.dockercopilot.default_instance,
            update_check_cron=config.telegram.update_check_cron,
            notify_on_update=config.telegram.notify_on_update,
            notify_chat_ids=config.telegram.chat_ids,
            update_blacklist=config.telegram.update_blacklist,
            auto_clean_images=config.telegram.auto_clean_images,
            clean_images_cron=config.telegram.clean_images_cron,
            auto_update_containers=config.telegram.auto_update_containers,
            update_containers_cron=config.telegram.update_containers_cron
        )

        # 发送启动成功通知
        logger.info("✅ 所有服务启动成功")
        bot.send_startup_notification(
            instance_count=len(docker_clients),
            instance_names=list(docker_clients.keys()),
            chat_ids=config.telegram.chat_ids
        )

        # 启动轮询
        bot.start_polling()

    except KeyboardInterrupt:
        logger.info("收到停止信号，正在退出...")
    except Exception as e:
        logger.error(f"程序启动失败: {e}", exc_info=True)
        sys.exit(1)


if __name__ == '__main__':
    main()
