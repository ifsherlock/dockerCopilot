"""Telegram Bot主逻辑(使用 pyTelegramBotAPI 异步版本)"""
import asyncio
import hashlib
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime
from functools import wraps
from types import SimpleNamespace
from croniter import croniter
from telebot.async_telebot import AsyncTeleBot
from telebot.types import InlineKeyboardMarkup, InlineKeyboardButton, CallbackQuery, Message

from src.api.dockercopilot_client import DockerCopilotClient
from src.bot.instance_manager import InstanceManager

logger = logging.getLogger(__name__)


class TelegramBot:
    """Telegram Bot(使用异步pyTelegramBotAPI库)"""

    def __init__(self, token: str, docker_clients: Dict[str, DockerCopilotClient],
                 default_instance: Optional[str] = None,
                 update_check_cron: str = "*/10 * * * *",
                 notify_on_update: bool = True,
                 notify_chat_ids: Optional[List[str]] = None,
                 update_blacklist: Optional[List[str]] = None,
                 auto_clean_images: bool = False,
                 clean_images_cron: str = "0 2 * * *",
                 auto_update_containers: bool = False,
                 update_containers_cron: str = "0 3 * * 0",
                 interactive_enabled: bool = True,
                 startup_discard_backlog: bool = True,
                 startup_cooldown_seconds: int = 5,
                 dedupe_window_seconds: int = 3):
        """初始化Bot"""
        self.bot = AsyncTeleBot(token)
        self.docker_clients = docker_clients

        # 初始化实例管理器
        self.instance_manager = InstanceManager(self.docker_clients, default_instance)

        # 用户状态管理(用于重命名等需要输入的操作)
        self.user_states: Dict[str, Dict[str, Any]] = {}

        # 更新检测配置
        self.update_check_cron = update_check_cron
        self.notify_on_update = notify_on_update
        self.notify_chat_ids = notify_chat_ids or []
        self.update_blacklist = update_blacklist or []  # 统一的更新黑名单(用于更新通知和自动更新)

        # 镜像清理配置(启用后自动发送清理通知)
        self.auto_clean_images = auto_clean_images
        self.clean_images_cron = clean_images_cron

        # 容器自动更新配置(启用后自动发送更新通知)
        self.auto_update_containers = auto_update_containers
        self.update_containers_cron = update_containers_cron

        # 后台任务
        self.update_check_task = None
        self.clean_images_task = None
        self.auto_update_task = None

        # 交互与防重放控制
        self.interactive_enabled = bool(interactive_enabled)
        self.startup_discard_backlog = bool(startup_discard_backlog)
        self.startup_cooldown_seconds = max(0, int(startup_cooldown_seconds))
        self.dedupe_window_seconds = max(0, int(dedupe_window_seconds))
        self.started_at = datetime.now()
        self.recent_command_fingerprints: Dict[str, datetime] = {}

        # 初始化运行时配置管理器
        from .config_runtime import RuntimeConfigManager
        self.runtime_config = RuntimeConfigManager()

        # 首次运行时,如果config.json是新创建的,用当前配置初始化它
        self._sync_runtime_config_on_first_run()

        # 注册所有处理器
        self._register_handlers()

        # 设置Bot命令菜单
        asyncio.run(self._setup_bot_commands())

        logger.info(f"✅ Telegram Bot 初始化完成(管理 {len(docker_clients)} 个Docker Copilot实例)")

    async def _setup_bot_commands(self):
        """设置Bot命令菜单"""
        from telebot.types import BotCommand

        commands = [
            BotCommand('start', '开始使用Bot'),
            BotCommand('help', '查看帮助信息'),
            BotCommand('containers', '查看容器列表'),
            BotCommand('updates', '查看可更新容器'),
            BotCommand('images', '查看镜像列表'),
            BotCommand('clean_images', '清理无用镜像'),
            BotCommand('backup', '创建容器备份'),
            BotCommand('backups', '查看备份列表'),
            BotCommand('status', '查看系统状态'),
            BotCommand('instances', '切换实例'),
            BotCommand('manage_instances', '管理实例配置'),
            BotCommand('settings', 'Bot配置管理'),
            BotCommand('version', '查看版本信息'),
            BotCommand('update_program', '更新程序'),
        ]

        try:
            await self.bot.set_my_commands(commands)
            logger.info("✅ Bot命令菜单设置成功")
        except Exception as e:
            logger.warning(f"⚠️ 设置Bot命令菜单失败: {e}")

    def _command_fp(self, chat_id: str, text: str) -> str:
        raw = f"{chat_id}:{(text or '').strip().lower()}"
        return hashlib.sha1(raw.encode('utf-8')).hexdigest()

    def _is_in_startup_cooldown(self) -> bool:
        return (datetime.now() - self.started_at).total_seconds() < self.startup_cooldown_seconds

    def _is_duplicate_command(self, chat_id: str, text: str) -> bool:
        if self.dedupe_window_seconds <= 0:
            return False
        fp = self._command_fp(chat_id, text)
        now = datetime.now()
        last = self.recent_command_fingerprints.get(fp)
        self.recent_command_fingerprints[fp] = now
        if not last:
            return False
        return (now - last).total_seconds() <= self.dedupe_window_seconds

    def _is_interactive_command(self, text: str) -> bool:
        cmd = (text or '').strip().split(' ')[0].lower()
        # /start、/help、/version 保持可用，便于查看状态和重新开启指引；
        # 容器/镜像/备份/设置/程序更新等会访问或修改实例的命令受交互开关控制。
        return cmd in {
            '/containers', '/updates', '/images', '/clean_images', '/backup', '/backups',
            '/instances', '/manage_instances', '/manage', '/settings', '/reload',
            '/update_program', '/status'
        }

    def _is_interactive_callback(self, callback_data: str) -> bool:
        action = (callback_data or '').split(':', 1)[0]
        safe_actions = {'noop', 'cancel', 'back_main'}
        return action not in safe_actions

    async def _guard_message(self, message: Message) -> bool:
        chat_id = str(message.chat.id)
        text = message.text or ''
        if self._is_in_startup_cooldown():
            await self.bot.send_message(chat_id, "⏳ Bot 刚启动，正在恢复中，请稍后重试")
            return False
        if self._is_duplicate_command(chat_id, text):
            await self.bot.send_message(chat_id, "⚠️ 检测到短时间重复命令，已忽略")
            return False
        if (not self.interactive_enabled) and self._is_interactive_command(text):
            await self.bot.send_message(chat_id, "⛔ 交互功能已关闭，请在配置页开启后再试")
            return False
        return True

    def _guarded(self, func):
        @wraps(func)
        async def wrapper(message: Message, *args, **kwargs):
            if not await self._guard_message(message):
                return
            return await func(message, *args, **kwargs)
        return wrapper

    async def _discard_backlog_once(self):
        if not self.startup_discard_backlog:
            return
        try:
            updates = await self.bot.get_updates(timeout=1, limit=100)
            if not updates:
                return
            last_id = max([u.update_id for u in updates if hasattr(u, 'update_id')], default=None)
            if last_id is not None:
                await self.bot.get_updates(offset=last_id + 1, timeout=1, limit=1)
                logger.info(f"✅ 已丢弃启动前 backlog,offset -> {last_id + 1}")
        except Exception as e:
            logger.warning(f"⚠️ 丢弃 backlog 失败(忽略继续): {e}")

    def _register_handlers(self):
        """注册所有消息和回调处理器"""

        # 命令处理器
        @self.bot.message_handler(commands=['start'])
        async def handle_start(message: Message):
            await self.handle_start_command(message)

        @self.bot.message_handler(commands=['help'])
        async def handle_help(message: Message):
            await self.handle_help_command(message)

        @self.bot.message_handler(commands=['containers'])
        @self._guarded
        async def handle_containers(message: Message):
            chat_id = str(message.chat.id)
            # 如果有多个实例,先让用户选择
            if len(self.docker_clients) > 1:
                await self.send_instance_selector(chat_id, 'containers')
            else:
                await self.send_containers_list(chat_id)

        @self.bot.message_handler(commands=['updates'])
        @self._guarded
        async def handle_updates(message: Message):
            chat_id = str(message.chat.id)
            # 如果有多个实例,先让用户选择
            if len(self.docker_clients) > 1:
                await self.send_instance_selector(chat_id, 'updates')
            else:
                await self.send_updates_list(chat_id)

        @self.bot.message_handler(commands=['status'])
        @self._guarded
        async def handle_status(message: Message):
            chat_id = str(message.chat.id)
            # 如果有多个实例,先让用户选择
            if len(self.docker_clients) > 1:
                await self.send_instance_selector(chat_id, 'status')
            else:
                await self.send_status(chat_id)

        @self.bot.message_handler(commands=['images'])
        @self._guarded
        async def handle_images(message: Message):
            chat_id = str(message.chat.id)
            # 如果有多个实例,先让用户选择
            if len(self.docker_clients) > 1:
                await self.send_instance_selector(chat_id, 'images')
            else:
                await self.send_images_list(chat_id)

        @self.bot.message_handler(commands=['clean_images'])
        @self._guarded
        async def handle_clean_images(message: Message):
            chat_id = str(message.chat.id)
            # 如果有多个实例,先让用户选择
            if len(self.docker_clients) > 1:
                await self.send_instance_selector(chat_id, 'clean_images')
            else:
                await self.clean_unused_images(chat_id)

        @self.bot.message_handler(commands=['backup'])
        @self._guarded
        async def handle_backup(message: Message):
            chat_id = str(message.chat.id)
            # 如果有多个实例,先让用户选择
            if len(self.docker_clients) > 1:
                await self.send_instance_selector(chat_id, 'backup')
            else:
                await self.create_backup(chat_id)

        @self.bot.message_handler(commands=['backups'])
        @self._guarded
        async def handle_backups(message: Message):
            chat_id = str(message.chat.id)
            # 如果有多个实例,先让用户选择
            if len(self.docker_clients) > 1:
                await self.send_instance_selector(chat_id, 'backups')
            else:
                await self.send_backups_list(chat_id)

        @self.bot.message_handler(commands=['instances'])
        @self._guarded
        async def handle_instances(message: Message):
            await self.send_instances_list(str(message.chat.id))

        @self.bot.message_handler(commands=['manage_instances', 'manage'])
        @self._guarded
        async def handle_manage(message: Message):
            await self.send_manage_instances(str(message.chat.id))

        @self.bot.message_handler(commands=['reload'])
        @self._guarded
        async def handle_reload(message: Message):
            await self.reload_instances(str(message.chat.id))

        @self.bot.message_handler(commands=['cancel'])
        async def handle_cancel(message: Message):
            await self.bot.send_message(
                str(message.chat.id),
                "✅ 已取消"
            )

        @self.bot.message_handler(commands=['settings'])
        @self._guarded
        async def handle_settings(message: Message):
            await self.send_settings_menu(str(message.chat.id))

        @self.bot.message_handler(commands=['version'])
        async def handle_version(message: Message):
            await self.send_version_info(str(message.chat.id))

        @self.bot.message_handler(commands=['update_program'])
        @self._guarded
        async def handle_update_program(message: Message):
            await self.update_program(str(message.chat.id))

        # 回调查询处理器
        @self.bot.callback_query_handler(func=lambda call: True)
        async def handle_callback(call: CallbackQuery):
            await self._handle_callback_query(call)

        # 普通文本消息处理器(用于配置流程和重命名等输入)
        @self.bot.message_handler(func=lambda message: True)
        async def handle_text(message: Message):
            chat_id = str(message.chat.id)
            text = message.text or ''

            if not await self._guard_message(message):
                return

            # 检查用户是否处于等待输入状态
            if chat_id in self.user_states:
                state = self.user_states[chat_id]

                # 重命名流程
                if state.get('action') == 'rename_container':
                    await self.do_rename_container(chat_id, state.get('container_id'), text)
                    # 清除状态
                    del self.user_states[chat_id]
                    return

                # 编辑cron表达式流程
                elif state.get('action') == 'edit_cron':
                    await self.process_cron_input(message)
                    return

                # 编辑黑名单流程
                elif state.get('action') == 'edit_blacklist':
                    await self.process_blacklist_input(message)
                    return

            # 未知消息
            await self.bot.send_message(
                chat_id,
                "❓ 未知命令，请使用 /help 查看可用命令"
            )

    async def handle_start_command(self, message: Message):
        """处理 /start 命令"""
        chat_id = str(message.chat.id)
        await self.bot.send_message(
            chat_id,
            self._get_welcome_message(chat_id),
            parse_mode='HTML'
        )

    async def handle_help_command(self, message: Message):
        """处理 /help 命令"""
        await self.bot.send_message(
            str(message.chat.id),
            self._get_help_message(),
            parse_mode='HTML'
        )

    def get_docker_client(self, chat_id: str) -> DockerCopilotClient:
        """获取当前用户的Docker客户端"""
        return self.instance_manager.get_client(chat_id)

    def get_current_instance_name(self, chat_id: str) -> str:
        """获取当前实例名称"""
        return self.instance_manager.get_current_instance(chat_id)

    async def send_containers_list(self, chat_id: str, message_id: Optional[int] = None, page: int = 0):
        """发送容器列表(支持分页,每行3个)"""
        try:
            logger.info(f"📋 开始发送容器列表: chat_id={chat_id}, message_id={message_id}, page={page}")
            docker_client = self.get_docker_client(chat_id)
            containers = docker_client.get_containers()
            logger.info(f"📋 获取到 {len(containers)} 个容器")

            if not containers:
                await self.bot.send_message(chat_id, "📭 当前没有容器")
                return

            # 分页设置
            items_per_page = 9  # 每页9个容器(3行x3列)
            total_pages = (len(containers) + items_per_page - 1) // items_per_page

            # 确保页码有效
            page = max(0, min(page, total_pages - 1))

            # 计算当前页的容器范围
            start = page * items_per_page
            end = min(start + items_per_page, len(containers))
            page_containers = containers[start:end]

            # 统计需要更新的容器数量
            update_count = sum(1 for c in containers if c.has_update)

            # 构建消息
            message = f"📦 <b>容器列表</b>\n\n总计: {len(containers)} 个容器 | 第 {page + 1}/{total_pages} 页"
            if update_count > 0:
                message += f"\n🔄 可更新: {update_count} 个"
            message += "\n\n"

            # 构建键盘(每行3个按钮)
            markup = InlineKeyboardMarkup()
            row = []

            for i, container in enumerate(page_containers):
                # 调试日志
                logger.info(f"容器 {i}: id={container.id}, name={container.name}, state={container.state}")

                # 状态图标
                status_icon = "🟢" if container.state == "running" else "⚪"
                update_icon = "🔄" if container.has_update else ""

                # 截断名称
                name = container.name if len(container.name) <= 10 else container.name[:10] + "..."

                # 使用短ID(前12位)
                short_id = container.id[:12]

                button_text = f"{status_icon} {update_icon} {name}".strip()
                logger.info(f"按钮文本: {button_text}, callback_data: select:{short_id}")

                button = InlineKeyboardButton(
                    text=button_text,
                    callback_data=f"select:{short_id}"
                )
                row.append(button)

                # 每3个按钮换行
                if (i + 1) % 3 == 0 or i == len(page_containers) - 1:
                    markup.add(*row)
                    row = []

            # 添加分页按钮
            if total_pages > 1:
                page_row = []

                if page > 0:
                    page_row.append(InlineKeyboardButton('⬅️ 上一页', callback_data=f'page:{page - 1}'))

                page_row.append(InlineKeyboardButton(f'📄 {page + 1}/{total_pages}', callback_data='noop'))

                if page < total_pages - 1:
                    page_row.append(InlineKeyboardButton('➡️ 下一页', callback_data=f'page:{page + 1}'))

                markup.add(*page_row)

            # 添加"一键更新所有"按钮(如果有可更新的容器)
            if update_count > 0:
                markup.add(InlineKeyboardButton(
                    f'⚡ 一键更新所有 ({update_count}个)',
                    callback_data='update_all_containers'
                ))

            # 添加返回和取消按钮
            bottom_row = []
            # 如果有多个实例,显示返回实例选择按钮
            if len(self.docker_clients) > 1:
                bottom_row.append(InlineKeyboardButton('◀️ 返回', callback_data='back_to_instances'))
            bottom_row.append(InlineKeyboardButton('❌ 取消', callback_data='cancel'))
            markup.add(*bottom_row)

            if message_id:
                await self.bot.edit_message_text(
                    message,
                    chat_id,
                    message_id,
                    reply_markup=markup,
                    parse_mode='HTML'
                )
            else:
                await self.bot.send_message(chat_id, message, reply_markup=markup, parse_mode='HTML')

        except Exception as e:
            logger.error(f"发送容器列表失败: {e}")
            await self.bot.send_message(chat_id, f"❌ 获取容器列表失败: {e}")

    async def send_container_detail(self, chat_id: str, message_id: int, container_id: str):
        """发送容器详情"""
        try:
            docker_client = self.get_docker_client(chat_id)
            container_info = docker_client.get_container_info(container_id)

            if not container_info:
                await self.bot.send_message(chat_id, f"❌ 未找到容器 ID: {container_id}")
                return

            # 解析镜像信息
            image_parts = container_info['image'].split(':')
            image_name = image_parts[0] if len(image_parts) > 0 else container_info['image']
            image_tag = image_parts[1] if len(image_parts) > 1 else 'latest'

            # 状态
            status = "运行中 🟢" if container_info['state'] == "running" else "已停止 ⚪"

            # 构建消息
            message = f"🐳 <b>容器详情</b>\n\n"
            message += f"📛 名称: <code>{container_info['name']}</code>\n"
            message += f"🆔 ID: <code>{container_id}</code>\n"
            message += f"📊 状态: {status}\n"
            message += f"🖼 镜像: <code>{image_name}</code>\n"
            message += f"🏷 标签: <code>{image_tag}</code>\n"

            if container_info['has_update']:
                message += f"\n🔄 <b>有新版本可用!</b>"

            # 构建操作按钮
            markup = InlineKeyboardMarkup()

            if container_info['state'] == "running":
                markup.add(
                    InlineKeyboardButton('⏹ 停止', callback_data=f'stop:{container_id}'),
                    InlineKeyboardButton('🔄 重启', callback_data=f'restart:{container_id}')
                )
            else:
                markup.add(InlineKeyboardButton('▶️ 启动', callback_data=f'start:{container_id}'))

            # 更新按钮(始终显示,如果有更新则高亮显示)
            update_button_text = '⬆️ 更新镜像' if not container_info['has_update'] else '🔥 更新镜像(有新版本)'
            markup.add(InlineKeyboardButton(update_button_text, callback_data=f'quick_update:{container_id}'))

            # 重命名按钮
            markup.add(InlineKeyboardButton('✏️ 重命名', callback_data=f'rename:{container_id}'))

            # 返回按钮
            markup.add(InlineKeyboardButton('◀️ 返回', callback_data='back:0'))

            await self.bot.edit_message_text(
                message,
                chat_id,
                message_id,
                reply_markup=markup,
                parse_mode='HTML'
            )

        except Exception as e:
            logger.error(f"发送容器详情失败: {e}")
            await self.bot.send_message(chat_id, f"❌ 获取容器详情失败: {e}")

    async def _handle_callback_query(self, call: CallbackQuery):
        """处理回调查询"""
        chat_id = str(call.message.chat.id)
        message_id = call.message.message_id
        callback_data = call.data or ''

        logger.info(f"收到回调: {callback_data} from {chat_id}")

        if self._is_in_startup_cooldown():
            await self.bot.answer_callback_query(call.id, "⏳ Bot 刚启动，请稍后重试", show_alert=True)
            return
        if (not self.interactive_enabled) and self._is_interactive_callback(callback_data):
            await self.bot.answer_callback_query(call.id, "⛔ 交互功能已关闭", show_alert=True)
            return

        # 解析回调数据
        parts = callback_data.split(':', 1)
        action = parts[0]
        param = parts[1] if len(parts) > 1 else ""

        # 路由到相应的处理方法
        if action == "select":
            await self.send_container_detail(chat_id, message_id, param)
        elif action in ["start", "stop", "restart", "update"]:
            await self.handle_container_action(chat_id, message_id, param, action)
        elif action == "back":
            await self.send_containers_list(chat_id, message_id, 0)
        elif action == "page":
            page = int(param) if param else 0
            await self.send_containers_list(chat_id, message_id, page)
        elif action == "back_main":
            # 返回主菜单(删除当前消息)
            await self.bot.delete_message(chat_id, message_id)
        elif action == "cancel":
            await self.bot.delete_message(chat_id, message_id)
        elif action == "switch_instance":
            await self.switch_instance(chat_id, message_id, param)
        elif action == "image":
            await self.send_image_detail(chat_id, message_id, self._resolve_image_callback_key(chat_id, param))
        elif action == "img_page":
            page = int(param) if param else 0
            await self.send_images_list(chat_id, message_id, page)
        elif action == "del_image":
            await self.delete_image_action(chat_id, message_id, self._resolve_image_callback_key(chat_id, param))
        elif action == "confirm_del_image":
            await self.confirm_delete_image(chat_id, message_id, self._resolve_image_callback_key(chat_id, param))
        elif action == "do_del_image":
            del_parts = param.split(':', 1)
            image_key = del_parts[0] if del_parts else ''
            force = len(del_parts) > 1 and del_parts[1].lower() == 'true'
            await self.delete_image_action(chat_id, message_id, self._resolve_image_callback_key(chat_id, image_key), force=force)
        elif action == "back_images":
            page = int(param) if param else 0
            await self.send_images_list(chat_id, message_id, page)
        elif action.startswith("select_inst_"):
            # 处理实例选择: select_inst_containers:nas
            target_action = action.replace("select_inst_", "")
            instance_name = param

            # 切换到选中的实例
            self.instance_manager.set_instance(chat_id, instance_name)

            # 删除选择消息
            await self.bot.delete_message(chat_id, message_id)

            # 执行相应的操作
            if target_action == "containers":
                await self.send_containers_list(chat_id)
            elif target_action == "images":
                await self.send_images_list(chat_id)
            elif target_action == "status":
                await self.send_status(chat_id)
            elif target_action == "version":
                await self.send_version_info(chat_id, skip_selector=True)
            elif target_action == "update_program":
                await self.update_program(chat_id, skip_selector=True)
            elif target_action == "clean_images":
                await self.clean_unused_images(chat_id)
            elif target_action == "updates":
                await self.send_updates_list(chat_id)
            elif target_action == "backup":
                await self.create_backup(chat_id)
            elif target_action == "backups":
                await self.send_backups_list(chat_id)
        elif action == "confirm_clean_images":
            await self.do_clean_unused_images(chat_id, message_id)
        elif action == "confirm_backup":
            await self.do_create_backup(chat_id, message_id)
        elif action == "confirm_backup_compose":
            await self.do_backup_to_compose(chat_id, message_id)
        elif action == "backup_page":
            page = int(param) if param else 0
            await self.send_backups_list(chat_id, message_id, page)
        elif action == "backup_detail":
            await self.send_backup_detail(chat_id, message_id, param)
        elif action == "back_backups":
            page = int(param) if param else 0
            await self.send_backups_list(chat_id, message_id, page)
        elif action == "confirm_delete_backup":
            # 显示删除备份确认对话框
            await self.confirm_delete_backup(chat_id, message_id, param)
        elif action == "do_delete_backup":
            # 执行删除备份操作
            await self.do_delete_backup(chat_id, message_id, param)
        elif action == "update_page":
            page = int(param) if param else 0
            await self.send_updates_list(chat_id, message_id, page)
        elif action == "quick_update":
            # 快速更新容器(先确认,再执行)
            await self.confirm_quick_update_container(chat_id, message_id, param)
        elif action == "do_quick_update":
            # 执行单容器更新
            await self.quick_update_container(chat_id, message_id, param)
        elif action == "update_all_containers":
            # 一键更新所有容器(显示确认对话框)
            await self.confirm_update_all_containers(chat_id, message_id)
        elif action == "do_update_all_containers":
            # 执行批量更新
            await self.do_update_all_containers(chat_id, message_id)
        elif action == "update_all_instances":
            # 一键更新所有实例的所有容器(从通知消息)
            await self.confirm_update_all_instances(chat_id, message_id)
        elif action == "do_update_all_instances":
            # 执行所有实例的批量更新
            await self.do_update_all_instances(chat_id, message_id)
        elif action == "rename":
            # 开始重命名流程
            await self.start_rename_container(chat_id, message_id, param)
        elif action == "cancel_rename":
            # 取消重命名
            await self.cancel_rename(chat_id, message_id)
        elif action == "back_to_instances":
            # 返回实例选择
            await self.send_instance_selector(chat_id, 'containers')
        elif action == "manage_inst_detail":
            # 查看实例详情
            try:
                logger.info(f"开始获取实例详情: instance={param}, chat_id={chat_id}, message_id={message_id}")
                await self.send_instance_detail(chat_id, message_id, param)
                # 成功更新,显示反馈
                logger.info("获取详情成功,发送反馈")
                await self.bot.answer_callback_query(call.id, "🔄 已重新测试", show_alert=False)
            except Exception as e:
                logger.info(f"获取详情异常: {type(e).__name__}: {e}")
                error_str = str(e).lower()
                logger.debug(f"错误字符串(小写): {error_str}")
                if "message is not modified" in error_str or "message not modified" in error_str or "not modified" in error_str:
                    # 内容没有变化
                    logger.info("内容未变化,发送'状态未变化'反馈")
                    await self.bot.answer_callback_query(call.id, "✅ 状态未变化", show_alert=False)
                else:
                    # 其他错误
                    logger.error(f"获取详情失败: {e}", exc_info=True)
                    await self.bot.answer_callback_query(call.id, f"❌ 获取失败", show_alert=True)
                    raise
        elif action == "manage_inst_refresh":
            # 刷新实例状态
            try:
                logger.info(f"开始刷新实例管理界面: chat_id={chat_id}, message_id={message_id}")
                await self.send_manage_instances(chat_id, message_id)
                # 成功更新,显示反馈
                logger.info("刷新成功,发送反馈")
                await self.bot.answer_callback_query(call.id, "🔄 已刷新", show_alert=False)
            except Exception as e:
                logger.info(f"刷新异常: {type(e).__name__}: {e}")
                error_str = str(e).lower()
                logger.debug(f"错误字符串(小写): {error_str}")
                if "message is not modified" in error_str or "message not modified" in error_str or "not modified" in error_str:
                    # 内容没有变化
                    logger.info("内容未变化,发送'状态未变化'反馈")
                    await self.bot.answer_callback_query(call.id, "✅ 状态未变化", show_alert=False)
                else:
                    # 其他错误
                    logger.error(f"刷新失败: {e}", exc_info=True)
                    await self.bot.answer_callback_query(call.id, f"❌ 刷新失败", show_alert=True)
                    raise
        elif action == "manage_inst_back":
            # 返回实例管理主页
            try:
                await self.send_manage_instances(chat_id, message_id)
                # 成功返回
                await self.bot.answer_callback_query(call.id)
            except Exception as e:
                error_str = str(e).lower()
                if "message is not modified" in error_str or "message not modified" in error_str or "not modified" in error_str:
                    # 内容没有变化,静默处理
                    await self.bot.answer_callback_query(call.id)
                else:
                    # 其他错误
                    await self.bot.answer_callback_query(call.id, f"❌ 操作失败", show_alert=True)
                    raise
        elif action == "manage_switch_to":
            # 从实例详情切换到该实例
            if self.instance_manager.set_instance(chat_id, param):
                await self.bot.send_message(
                    chat_id,
                    f"✅ 已切换到实例: <b>{param}</b>",
                    parse_mode='HTML'
                )
                # 返回实例管理主页
                try:
                    await self.send_manage_instances(chat_id, message_id)
                    await self.bot.answer_callback_query(call.id)
                except Exception as e:
                    error_str = str(e).lower()
                    if "message is not modified" in error_str or "message not modified" in error_str or "not modified" in error_str:
                        # 切换后消息内容相同,静默处理
                        await self.bot.answer_callback_query(call.id)
                    else:
                        await self.bot.answer_callback_query(call.id, f"❌ 操作失败", show_alert=True)
                        raise
            else:
                await self.bot.send_message(chat_id, "❌ 切换失败")
                await self.bot.answer_callback_query(call.id, "❌ 切换失败", show_alert=True)
        # 配置管理相关
        elif action == "settings_menu":
            # 显示配置菜单
            await self.send_settings_menu(chat_id, message_id)
        elif action == "settings_edit_cron":
            # 编辑cron表达式
            await self.start_edit_cron(chat_id, message_id, param)
        elif action == "settings_toggle":
            # 切换开关
            await self.toggle_setting(chat_id, message_id, param)
        elif action == "settings_edit_blacklist":
            # 编辑黑名单
            await self.start_edit_blacklist(chat_id, message_id)
        elif action == "settings_reload":
            # 重新加载配置
            await self.reload_settings(chat_id, message_id)
        elif action == "noop":
            pass  # 不执行任何操作

        # 确保回调被应答(如果之前的处理没有应答)
        # 注意:如果已经应答过,这个调用会被忽略或失败,但不会影响功能
        try:
            await self.bot.answer_callback_query(call.id)
        except Exception as e:
            # 如果应答失败(可能已经应答过),忽略错误
            logger.debug(f"回调应答失败(可能已应答): {e}")

    async def handle_container_action(self, chat_id: str, message_id: int, container_id: str, action: str):
        """处理容器操作(启动/停止/重启/更新)"""
        try:
            docker_client = self.get_docker_client(chat_id)
            instance_name = self.get_current_instance_name(chat_id)

            action_name = {
                "start": "启动",
                "stop": "停止",
                "restart": "重启",
                "update": "更新"
            }.get(action, action)

            # 获取容器信息用于显示
            container_info = docker_client.get_container_info(container_id)
            if not container_info:
                await self.bot.send_message(chat_id, f"❌ 未找到容器信息")
                return

            container_name = container_info['name']

            result = None
            if action == "start":
                result = docker_client.start_container(container_id)
            elif action == "stop":
                result = docker_client.stop_container(container_id)
            elif action == "restart":
                result = docker_client.restart_container(container_id)
            elif action == "update":
                result = docker_client.update_container(
                    container_id,
                    container_info['image'],
                    container_name
                )

            if result and result.get('code') == 200:
                # 删除详情消息
                try:
                    await self.bot.delete_message(chat_id, message_id)
                except Exception:
                    pass

                # 发送成功消息(不自动返回详情页)
                success_msg = f"✅ <b>{action_name}成功</b>\n\n"
                success_msg += f"🖥 实例: <b>{instance_name}</b>\n"
                success_msg += f"📦 容器: <b>{container_name}</b>\n"
                success_msg += f"🆔 ID: <code>{container_id}</code>\n\n"

                if action == "update":
                    success_msg += f"🎉 容器已{action_name}完成!\n\n"
                    success_msg += f"💡 使用 /containers 查看容器状态"
                else:
                    success_msg += f"🎉 容器已{action_name}!"

                await self.bot.send_message(chat_id, success_msg, parse_mode='HTML')
            else:
                error_msg = result.get('msg', '未知错误') if result else '操作失败'

                # 删除详情消息
                try:
                    await self.bot.delete_message(chat_id, message_id)
                except Exception:
                    pass

                # 发送错误消息
                fail_msg = f"❌ <b>{action_name}失败</b>\n\n"
                fail_msg += f"📦 容器: <b>{container_name}</b>\n"
                fail_msg += f"❗ 错误: {error_msg}"

                await self.bot.send_message(chat_id, fail_msg, parse_mode='HTML')

        except Exception as e:
            logger.error(f"容器操作失败: {e}")
            await self.bot.send_message(chat_id, f"❌ 操作失败: {e}")

    async def start_rename_container(self, chat_id: str, message_id: int, container_id: str):
        """开始重命名容器流程"""
        try:
            docker_client = self.get_docker_client(chat_id)
            container_info = docker_client.get_container_info(container_id)

            if not container_info:
                await self.bot.send_message(chat_id, f"❌ 未找到容器 ID: {container_id}")
                return

            current_name = container_info['name']

            # 设置用户状态
            self.user_states[chat_id] = {
                'action': 'rename_container',
                'container_id': container_id,
                'old_name': current_name
            }

            # 发送提示消息
            prompt_message = f"✏️ <b>重命名容器</b>\n\n"
            prompt_message += f"📛 当前名称: <code>{current_name}</code>\n"
            prompt_message += f"🆔 容器ID: <code>{container_id}</code>\n\n"
            prompt_message += f"💡 请发送新的容器名称\n"
            prompt_message += f"或点击取消按钮退出"

            # 构建取消按钮
            markup = InlineKeyboardMarkup()
            markup.add(InlineKeyboardButton('❌ 取消', callback_data='cancel_rename'))

            # 编辑原消息或发送新消息
            try:
                await self.bot.edit_message_text(
                    prompt_message,
                    chat_id,
                    message_id,
                    reply_markup=markup,
                    parse_mode='HTML'
                )
            except Exception:
                # 如果编辑失败,发送新消息
                await self.bot.send_message(
                    chat_id,
                    prompt_message,
                    reply_markup=markup,
                    parse_mode='HTML'
                )

        except Exception as e:
            logger.error(f"开始重命名流程失败: {e}")
            await self.bot.send_message(chat_id, f"❌ 操作失败: {e}")

    async def do_rename_container(self, chat_id: str, container_id: str, new_name: str):
        """执行重命名容器操作"""
        try:
            docker_client = self.get_docker_client(chat_id)
            instance_name = self.get_current_instance_name(chat_id)

            # 获取容器当前信息
            container_info = docker_client.get_container_info(container_id)
            if not container_info:
                await self.bot.send_message(chat_id, "❌ 容器不存在")
                return

            old_name = container_info['name']

            # 验证新名称
            new_name = new_name.strip()
            if not new_name:
                await self.bot.send_message(chat_id, "❌ 容器名称不能为空")
                return

            if new_name == old_name:
                await self.bot.send_message(chat_id, "💡 新名称与当前名称相同,无需修改")
                return

            # 发送处理中消息
            progress_msg = await self.bot.send_message(
                chat_id,
                f"✏️ <b>正在重命名容器</b>\n\n"
                f"🖥 实例: <b>{instance_name}</b>\n"
                f"📛 旧名称: <code>{old_name}</code>\n"
                f"📝 新名称: <code>{new_name}</code>\n\n"
                f"⏳ 处理中...",
                parse_mode='HTML'
            )

            # 调用重命名API
            result = docker_client.rename_container(container_id, new_name)

            if result.get('code') == 200:
                await self.bot.edit_message_text(
                    f"✅ <b>重命名成功</b>\n\n"
                    f"🖥 实例: <b>{instance_name}</b>\n"
                    f"📛 旧名称: <code>{old_name}</code>\n"
                    f"📝 新名称: <code>{new_name}</code>\n"
                    f"🆔 容器ID: <code>{container_id}</code>\n\n"
                    f"🎉 容器已成功重命名!",
                    chat_id,
                    progress_msg.message_id,
                    parse_mode='HTML'
                )
            else:
                error_msg = result.get('msg', '未知错误')
                await self.bot.edit_message_text(
                    f"❌ <b>重命名失败</b>\n\n"
                    f"📛 容器: <code>{old_name}</code>\n"
                    f"📝 新名称: <code>{new_name}</code>\n\n"
                    f"❗ 错误: {error_msg}",
                    chat_id,
                    progress_msg.message_id,
                    parse_mode='HTML'
                )

        except Exception as e:
            logger.error(f"重命名容器失败: {e}")
            await self.bot.send_message(chat_id, f"❌ 重命名容器失败: {e}")

    async def cancel_rename(self, chat_id: str, message_id: int):
        """取消重命名操作"""
        try:
            # 清除用户状态
            if chat_id in self.user_states:
                del self.user_states[chat_id]

            # 删除提示消息
            await self.bot.delete_message(chat_id, message_id)

            # 发送取消消息
            await self.bot.send_message(chat_id, "✅ 已取消重命名操作")

        except Exception as e:
            logger.error(f"取消重命名失败: {e}")

    async def send_status(self, chat_id: str):
        """发送系统状态"""
        try:
            docker_client = self.get_docker_client(chat_id)
            containers = docker_client.get_containers()
            running = sum(1 for c in containers if c.state == "running")
            stopped = len(containers) - running

            message = f"📊 <b>系统状态</b>\n\n"
            message += f"🐳 Docker容器:\n"
            message += f"  • 运行中: {running}\n"
            message += f"  • 已停止: {stopped}\n"
            message += f"  • 总计: {len(containers)}\n"

            await self.bot.send_message(chat_id, message, parse_mode='HTML')

        except Exception as e:
            logger.error(f"获取系统状态失败: {e}")
            await self.bot.send_message(chat_id, f"❌ 获取系统状态失败: {e}")

    async def confirm_quick_update_container(self, chat_id: str, message_id: int, container_ref: str):
        """确认单容器更新"""
        try:
            docker_client = self.get_docker_client(chat_id)
            container_id = self._resolve_container_callback_key(chat_id, container_ref)
            container_info = docker_client.get_container_info(container_id)

            if not container_info:
                await self.bot.send_message(chat_id, f"❌ 未找到容器 ID: {container_id or container_ref}")
                return

            container_name = container_info['name']
            image_name = container_info['image']
            full_container_id = container_info['id']
            is_blacklisted = self._is_update_blacklisted(SimpleNamespace(**container_info))

            message = f"⚠️ <b>确认更新容器</b> <b>{container_name}</b>？\n"
            message += f"🖼 镜像: <code>{image_name}</code>"

            if is_blacklisted:
                message += "\n\n⚠️ <b>该容器命中更新黑名单</b>"
            elif image_name.startswith('sha256:'):
                message += "\n\n⚠️ <b>当前镜像 TAG 不可用，可能无法自动更新</b>"

            markup = InlineKeyboardMarkup()
            confirm_key = self._container_callback_key(chat_id, full_container_id)
            markup.add(
                InlineKeyboardButton('✅ 确认更新', callback_data=f'do_quick_update:{confirm_key}'),
                InlineKeyboardButton('❌ 取消', callback_data='cancel')
            )
            markup.add(InlineKeyboardButton('◀️ 返回列表', callback_data='update_page:0'))

            await self.bot.edit_message_text(
                message,
                chat_id,
                message_id,
                reply_markup=markup,
                parse_mode='HTML'
            )
        except Exception as e:
            logger.error(f"显示容器更新确认框失败: {e}")
            await self.bot.send_message(chat_id, f"❌ 显示确认弹窗失败: {e}")

    async def quick_update_container(self, chat_id: str, message_id: int, container_id: str):
        """快速更新容器(带进度追踪)"""
        try:
            docker_client = self.get_docker_client(chat_id)
            instance_name = self.get_current_instance_name(chat_id)
            container_id = self._resolve_container_callback_key(chat_id, container_id)

            # 获取容器信息
            container_info = docker_client.get_container_info(container_id)

            if not container_info:
                await self.bot.send_message(chat_id, f"❌ 未找到容器 ID: {container_id}")
                return

            container_name = container_info['name']
            image_name = container_info['image']

            # 检查镜像tag是否有效
            if not image_name or image_name.startswith("sha256:"):
                await self.bot.send_message(
                    chat_id,
                    f"❌ <b>{container_name}</b> 镜像TAG不正确\n\n"
                    f"当前镜像: <code>{image_name}</code>\n\n"
                    f"该镜像无法自动更新,请修改TAG",
                    parse_mode='HTML'
                )
                return

            # 尝试删除原消息(可能是列表或详情消息)
            try:
                await self.bot.delete_message(chat_id, message_id)
            except Exception as e:
                logger.warning(f"删除原消息失败(可能已被删除): {e}")

            progress_msg = await self.bot.send_message(
                chat_id,
                f"🔄 <b>正在更新容器</b>\n\n"
                f"🖥 实例: <b>{instance_name}</b>\n"
                f"📦 容器: <b>{container_name}</b>\n"
                f"🖼 镜像: <code>{image_name}</code>\n\n"
                f"⏳ 正在创建更新任务...",
                parse_mode='HTML'
            )

            # 调用更新API
            result = docker_client.update_container(
                container_id,
                image_name,
                container_name
            )

            if result.get('code') != 200:
                error_msg = result.get('msg', '未知错误')
                await self.bot.edit_message_text(
                    f"❌ <b>更新失败</b>\n\n"
                    f"📦 容器: <b>{container_name}</b>\n"
                    f"❗ 错误: {error_msg}",
                    chat_id,
                    progress_msg.message_id,
                    parse_mode='HTML'
                )
                return

            # 获取任务ID
            task_id = result.get('data', {}).get('taskID')

            if not task_id:
                await self.bot.edit_message_text(
                    f"✅ <b>更新任务已创建</b>\n\n"
                    f"📦 容器: <b>{container_name}</b>\n\n"
                    f"更新正在后台进行...",
                    chat_id,
                    progress_msg.message_id,
                    parse_mode='HTML'
                )
                return

            # 追踪更新进度(参考 ql.py 的实现)
            max_checks = 30  # 最多检查30次
            check_interval = 5  # 每5秒检查一次

            await self.bot.edit_message_text(
                f"🔄 <b>正在更新容器</b>\n\n"
                f"🖥 实例: <b>{instance_name}</b>\n"
                f"📦 容器: <b>{container_name}</b>\n"
                f"🖼 镜像: <code>{image_name}</code>\n\n"
                f"📊 任务ID: <code>{task_id}</code>\n"
                f"⏳ 正在追踪进度...\n\n"
                f"💡 等待任务启动(3秒)...",
                chat_id,
                progress_msg.message_id,
                parse_mode='HTML'
            )

            # 等待3秒让更新任务启动
            await asyncio.sleep(3)

            for check_count in range(1, max_checks + 1):
                await asyncio.sleep(check_interval)

                try:
                    # 查询进度
                    progress_result = docker_client.get_update_progress(task_id)

                    if progress_result.get('code') == 200:
                        progress_msg_text = progress_result.get('msg', '更新中...')

                        # 更新进度消息
                        status_text = f"🔄 <b>正在更新容器</b>\n\n"
                        status_text += f"🖥 实例: <b>{instance_name}</b>\n"
                        status_text += f"📦 容器: <b>{container_name}</b>\n"
                        status_text += f"🖼 镜像: <code>{image_name}</code>\n\n"
                        status_text += f"📊 任务ID: <code>{task_id}</code>\n"
                        status_text += f"📈 进度: <b>{progress_msg_text}</b>\n"
                        status_text += f"🔍 检查次数: {check_count}/{max_checks}"

                        try:
                            await self.bot.edit_message_text(
                                status_text,
                                chat_id,
                                progress_msg.message_id,
                                parse_mode='HTML'
                            )
                        except Exception as edit_err:
                            logger.warning(f"编辑进度消息失败: {edit_err}")

                        # 检查是否完成
                        if progress_msg_text == "更新成功":
                            try:
                                await self.bot.edit_message_text(
                                    f"✅ <b>更新成功</b>\n\n"
                                    f"🖥 实例: <b>{instance_name}</b>\n"
                                    f"📦 容器: <b>{container_name}</b>\n"
                                    f"🖼 镜像: <code>{image_name}</code>\n\n"
                                    f"🎉 容器已更新到最新版本!\n"
                                    f"⏱ 总用时: {(check_count * check_interval) + 3}秒",
                                    chat_id,
                                    progress_msg.message_id,
                                    parse_mode='HTML'
                                )
                            except Exception as final_err:
                                logger.error(f"发送成功消息失败: {final_err}")
                                # 如果编辑失败,发送新消息
                                await self.bot.send_message(
                                    chat_id,
                                    f"✅ <b>更新成功</b>\n\n"
                                    f"📦 容器: <b>{container_name}</b>\n"
                                    f"🎉 容器已更新到最新版本!",
                                    parse_mode='HTML'
                                )
                            return
                        elif "失败" in progress_msg_text or "错误" in progress_msg_text:
                            try:
                                await self.bot.edit_message_text(
                                    f"❌ <b>更新失败</b>\n\n"
                                    f"🖥 实例: <b>{instance_name}</b>\n"
                                    f"📦 容器: <b>{container_name}</b>\n"
                                    f"🖼 镜像: <code>{image_name}</code>\n\n"
                                    f"❗ 状态: {progress_msg_text}",
                                    chat_id,
                                    progress_msg.message_id,
                                    parse_mode='HTML'
                                )
                            except Exception as fail_err:
                                logger.error(f"发送失败消息失败: {fail_err}")
                                # 如果编辑失败,发送新消息
                                await self.bot.send_message(
                                    chat_id,
                                    f"❌ <b>更新失败</b>\n\n"
                                    f"📦 容器: <b>{container_name}</b>\n"
                                    f"❗ 状态: {progress_msg_text}",
                                    parse_mode='HTML'
                                )
                            return
                    else:
                        # API返回非200,记录日志但继续追踪
                        logger.warning(f"查询进度返回非200: code={progress_result.get('code')}, msg={progress_result.get('msg')}")

                except Exception as e:
                    logger.warning(f"查询进度异常 (第{check_count}次): {e}")

            # 超时
            try:
                await self.bot.edit_message_text(
                    f"⚠️ <b>更新进度追踪超时</b>\n\n"
                    f"🖥 实例: <b>{instance_name}</b>\n"
                    f"📦 容器: <b>{container_name}</b>\n"
                    f"🖼 镜像: <code>{image_name}</code>\n\n"
                    f"📊 任务ID: <code>{task_id}</code>\n\n"
                    f"⏰ 已追踪 {max_checks * check_interval}秒\n\n"
                    f"💡 更新任务可能仍在后台运行,请稍后使用 /containers 或 /updates 检查容器状态。",
                    chat_id,
                    progress_msg.message_id,
                    parse_mode='HTML'
                )
            except Exception as timeout_err:
                logger.error(f"发送超时消息失败: {timeout_err}")
                # 如果编辑失败,发送新消息
                await self.bot.send_message(
                    chat_id,
                    f"⚠️ <b>更新进度追踪超时</b>\n\n"
                    f"📦 容器: <b>{container_name}</b>\n\n"
                    f"更新任务可能仍在后台运行。",
                    parse_mode='HTML'
                )

        except Exception as e:
            logger.error(f"快速更新容器失败: {e}", exc_info=True)
            # 发送新消息而不是编辑(因为可能消息已被删除)
            try:
                await self.bot.send_message(
                    chat_id,
                    f"❌ <b>更新容器时出错</b>\n\n"
                    f"📦 容器: <b>{container_name if 'container_name' in locals() else 'unknown'}</b>\n\n"
                    f"❗ 错误信息: {str(e)}\n\n"
                    f"💡 请使用 /containers 检查容器状态",
                    parse_mode='HTML'
                )
            except Exception as send_err:
                logger.error(f"发送错误消息也失败了: {send_err}")

    async def confirm_update_all_containers(self, chat_id: str, message_id: int):
        """显示一键更新所有容器的确认对话框"""
        try:
            docker_client = self.get_docker_client(chat_id)
            instance_name = self.get_current_instance_name(chat_id)

            # 获取所有需要更新的容器
            containers = docker_client.get_containers()
            update_containers = [c for c in containers if c.has_update]

            if not update_containers:
                await self.bot.edit_message_text(
                    "✅ 没有需要更新的容器",
                    chat_id,
                    message_id,
                    parse_mode='HTML'
                )
                return

            # 构建确认消息
            message = f"⚡ <b>一键更新所有容器</b>\n\n"
            message += f"🖥 实例: <b>{instance_name}</b>\n"
            message += f"📦 待更新: <b>{len(update_containers)}</b> 个容器\n\n"

            # 列出前5个容器
            message += "<b>将更新以下容器:</b>\n"
            for idx, container in enumerate(update_containers[:5], 1):
                status_icon = "🟢" if container.state == "running" else "⚪"
                message += f"{idx}. {status_icon} <b>{container.name}</b>\n"
                message += f"   📦 {container.image}\n"

            if len(update_containers) > 5:
                message += f"   ... 还有 {len(update_containers) - 5} 个容器\n"

            message += f"\n⚠️ <b>注意事项:</b>\n"
            message += f"• 更新过程可能需要较长时间\n"
            message += f"• 容器会逐个依次更新\n"
            message += f"• 更新期间服务会短暂中断\n\n"
            message += f"确定要继续吗?"

            # 构建确认按钮
            markup = InlineKeyboardMarkup()
            markup.add(
                InlineKeyboardButton('✅ 确认更新', callback_data='do_update_all_containers'),
                InlineKeyboardButton('❌ 取消', callback_data='back:0')
            )

            await self.bot.edit_message_text(
                message,
                chat_id,
                message_id,
                reply_markup=markup,
                parse_mode='HTML'
            )

        except Exception as e:
            logger.error(f"显示批量更新确认对话框失败: {e}")
            await self.bot.send_message(chat_id, f"❌ 操作失败: {e}")

    async def do_update_all_containers(self, chat_id: str, message_id: int):
        """执行批量更新所有容器"""
        try:
            docker_client = self.get_docker_client(chat_id)
            instance_name = self.get_current_instance_name(chat_id)

            # 获取所有需要更新的容器
            containers = docker_client.get_containers()
            update_containers = [c for c in containers if c.has_update]

            if not update_containers:
                await self.bot.edit_message_text(
                    "✅ 没有需要更新的容器",
                    chat_id,
                    message_id,
                    parse_mode='HTML'
                )
                return

            # 删除确认消息
            await self.bot.delete_message(chat_id, message_id)

            # 发送开始消息
            status_msg = await self.bot.send_message(
                chat_id,
                f"⚡ <b>批量更新开始</b>\n\n"
                f"🖥 实例: <b>{instance_name}</b>\n"
                f"📦 总计: {len(update_containers)} 个容器\n\n"
                f"⏳ 正在准备更新...",
                parse_mode='HTML'
            )

            # 统计结果
            success_count = 0
            failed_count = 0
            failed_containers = []

            # 逐个更新容器
            for idx, container in enumerate(update_containers, 1):
                try:
                    # 更新进度消息
                    progress_text = f"⚡ <b>批量更新进行中</b>\n\n"
                    progress_text += f"🖥 实例: <b>{instance_name}</b>\n"
                    progress_text += f"📊 进度: {idx}/{len(update_containers)}\n"
                    progress_text += f"✅ 成功: {success_count}\n"
                    progress_text += f"❌ 失败: {failed_count}\n\n"
                    progress_text += f"🔄 正在更新: <b>{container.name}</b>\n"
                    progress_text += f"📦 镜像: <code>{container.image}</code>"

                    await self.bot.edit_message_text(
                        progress_text,
                        chat_id,
                        status_msg.message_id,
                        parse_mode='HTML'
                    )

                    # 执行更新
                    result = docker_client.update_container(
                        container.id,
                        container.image,
                        container.name
                    )

                    if result.get('code') == 200:
                        success_count += 1
                        logger.info(f"✅ 更新成功: {container.name}")
                    else:
                        failed_count += 1
                        error_msg = result.get('msg', '未知错误')
                        failed_containers.append(f"{container.name}: {error_msg}")
                        logger.error(f"❌ 更新失败: {container.name} - {error_msg}")

                    # 等待一下,避免API压力过大
                    await asyncio.sleep(2)

                except Exception as e:
                    failed_count += 1
                    failed_containers.append(f"{container.name}: {str(e)}")
                    logger.error(f"❌ 更新异常: {container.name} - {e}")

            # 发送最终结果
            final_message = f"⚡ <b>批量更新完成</b>\n\n"
            final_message += f"🖥 实例: <b>{instance_name}</b>\n\n"
            final_message += f"📊 总计: {len(update_containers)} 个容器\n"
            final_message += f"✅ 成功: {success_count} 个\n"
            final_message += f"❌ 失败: {failed_count} 个\n"

            if failed_containers:
                final_message += f"\n⚠️ <b>失败详情:</b>\n"
                for fail in failed_containers[:5]:
                    final_message += f"  • {fail}\n"
                if len(failed_containers) > 5:
                    final_message += f"  ... 还有 {len(failed_containers) - 5} 个失败项\n"

            if success_count > 0:
                final_message += f"\n💡 使用 /containers 查看容器状态"

            await self.bot.edit_message_text(
                final_message,
                chat_id,
                status_msg.message_id,
                parse_mode='HTML'
            )

        except Exception as e:
            logger.error(f"批量更新容器失败: {e}")
            await self.bot.send_message(chat_id, f"❌ 批量更新失败: {e}")

    async def confirm_update_all_instances(self, chat_id: str, message_id: int):
        """显示一键更新所有实例的所有容器的确认对话框"""
        try:
            # 收集所有实例的可更新容器
            all_updates = {}  # {instance_name: [containers]}
            total_count = 0

            for instance_name, client in self.docker_clients.items():
                try:
                    containers = client.get_containers()
                    # 筛选可更新且不在黑名单中的容器
                    updatable = [c for c in containers if c.has_update and not self._is_update_blacklisted(c)]
                    if updatable:
                        all_updates[instance_name] = updatable
                        total_count += len(updatable)
                except Exception as e:
                    logger.warning(f"获取实例 [{instance_name}] 容器失败: {e}")

            if not all_updates:
                await self.bot.edit_message_text(
                    "✅ 没有需要更新的容器",
                    chat_id,
                    message_id,
                    parse_mode='HTML'
                )
                return

            # 构建确认消息
            message = f"⚡ <b>一键更新所有实例</b>\n\n"
            message += f"📦 待更新: <b>{total_count}</b> 个容器\n"
            message += f"🖥 实例数: <b>{len(all_updates)}</b> 个\n\n"

            # 列出各实例的容器
            message += "<b>将更新以下容器:</b>\n\n"
            shown_count = 0
            max_show = 8  # 最多显示8个容器

            for instance_name, containers in all_updates.items():
                message += f"🖥 <b>{instance_name}</b> ({len(containers)}个)\n"
                for container in containers:
                    if shown_count >= max_show:
                        break
                    status_icon = "🟢" if container.state == "running" else "⚪"
                    message += f"  {status_icon} <b>{container.name}</b>\n"
                    shown_count += 1

                if shown_count >= max_show:
                    remaining = total_count - shown_count
                    if remaining > 0:
                        message += f"\n  ... 还有 {remaining} 个容器\n"
                    break
                message += "\n"

            message += f"⚠️ <b>注意事项:</b>\n"
            message += f"• 更新过程可能需要较长时间\n"
            message += f"• 容器会逐个依次更新\n"
            message += f"• 更新期间服务会短暂中断\n"
            message += f"• 黑名单容器将被跳过\n\n"
            message += f"确定要继续吗?"

            # 构建确认按钮
            markup = InlineKeyboardMarkup()
            markup.add(
                InlineKeyboardButton('✅ 确认更新', callback_data='do_update_all_instances'),
                InlineKeyboardButton('❌ 取消', callback_data='noop')
            )

            await self.bot.edit_message_text(
                message,
                chat_id,
                message_id,
                reply_markup=markup,
                parse_mode='HTML'
            )

        except Exception as e:
            logger.error(f"显示所有实例批量更新确认对话框失败: {e}")
            try:
                await self.bot.edit_message_text(
                    f"❌ 操作失败: {e}",
                    chat_id,
                    message_id
                )
            except:
                await self.bot.send_message(chat_id, f"❌ 操作失败: {e}")

    async def do_update_all_instances(self, chat_id: str, message_id: int):
        """执行所有实例的批量更新"""
        try:
            # 收集所有实例的可更新容器
            all_updates = {}  # {instance_name: [containers]}

            for instance_name, client in self.docker_clients.items():
                try:
                    containers = client.get_containers()
                    # 筛选可更新且不在黑名单中的容器
                    updatable = [c for c in containers if c.has_update and not self._is_update_blacklisted(c)]
                    if updatable:
                        all_updates[instance_name] = updatable
                except Exception as e:
                    logger.warning(f"获取实例 [{instance_name}] 容器失败: {e}")

            if not all_updates:
                await self.bot.edit_message_text(
                    "✅ 没有需要更新的容器",
                    chat_id,
                    message_id,
                    parse_mode='HTML'
                )
                return

            # 计算总数
            total_count = sum(len(containers) for containers in all_updates.values())

            # 删除确认消息
            try:
                await self.bot.delete_message(chat_id, message_id)
            except:
                pass

            # 发送开始消息
            status_msg = await self.bot.send_message(
                chat_id,
                f"⚡ <b>批量更新开始</b>\n\n"
                f"🖥 实例数: {len(all_updates)} 个\n"
                f"📦 总计: {total_count} 个容器\n\n"
                f"⏳ 正在准备更新...",
                parse_mode='HTML'
            )

            # 统计结果
            all_results = {}  # {instance_name: {'success': [], 'failed': []}}
            total_success = 0
            total_failed = 0
            processed = 0

            # 逐个实例处理
            for instance_name, containers in all_updates.items():
                logger.info(f"⚡ [{instance_name}] 开始更新 {len(containers)} 个容器...")

                success_list = []
                failed_list = []

                # 获取对应的客户端
                client = self.docker_clients[instance_name]

                # 逐个更新容器
                for container in containers:
                    processed += 1
                    try:
                        # 更新进度消息
                        progress_text = f"⚡ <b>批量更新进行中</b>\n\n"
                        progress_text += f"📊 总进度: {processed}/{total_count}\n"
                        progress_text += f"✅ 成功: {total_success}\n"
                        progress_text += f"❌ 失败: {total_failed}\n\n"
                        progress_text += f"🖥 当前实例: <b>{instance_name}</b>\n"
                        progress_text += f"🔄 正在更新: <b>{container.name}</b>\n"
                        progress_text += f"📦 镜像: <code>{container.image}</code>"

                        try:
                            await self.bot.edit_message_text(
                                progress_text,
                                chat_id,
                                status_msg.message_id,
                                parse_mode='HTML'
                            )
                        except:
                            pass  # 忽略消息未修改的错误

                        # 执行更新
                        result = client.update_container(
                            container.id,
                            container.image,
                            container.name
                        )

                        if result.get('code') == 200:
                            success_list.append(container.name)
                            total_success += 1
                            logger.info(f"✅ [{instance_name}] 更新成功: {container.name}")
                        else:
                            error_msg = result.get('msg', '未知错误')
                            failed_list.append(f"{container.name}: {error_msg}")
                            total_failed += 1
                            logger.error(f"❌ [{instance_name}] 更新失败: {container.name} - {error_msg}")

                        # 等待一下,避免API压力过大
                        await asyncio.sleep(2)

                    except Exception as e:
                        failed_list.append(f"{container.name}: {str(e)}")
                        total_failed += 1
                        logger.error(f"❌ [{instance_name}] 更新异常: {container.name} - {e}")

                # 保存该实例的结果
                all_results[instance_name] = {
                    'success': success_list,
                    'failed': failed_list
                }

            # 发送最终结果
            final_message = f"⚡ <b>批量更新完成</b>\n\n"
            final_message += f"🖥 实例数: {len(all_updates)} 个\n"
            final_message += f"📊 总计: {total_count} 个容器\n"
            final_message += f"✅ 成功: {total_success} 个\n"
            final_message += f"❌ 失败: {total_failed} 个\n\n"

            # 按实例显示结果
            final_message += "<b>更新详情:</b>\n\n"
            for instance_name, result in all_results.items():
                success_count = len(result['success'])
                failed_count = len(result['failed'])
                final_message += f"🖥 <b>{instance_name}</b>\n"
                final_message += f"  ✅ 成功: {success_count}  ❌ 失败: {failed_count}\n"

                # 显示失败的容器
                if result['failed']:
                    for fail in result['failed'][:3]:
                        final_message += f"    • {fail}\n"
                    if len(result['failed']) > 3:
                        final_message += f"    ... 还有 {len(result['failed']) - 3} 个失败项\n"
                final_message += "\n"

            if total_success > 0:
                final_message += "💡 使用 /containers 查看容器状态"

            await self.bot.edit_message_text(
                final_message,
                chat_id,
                status_msg.message_id,
                parse_mode='HTML'
            )

        except Exception as e:
            logger.error(f"批量更新所有实例失败: {e}")
            try:
                await self.bot.send_message(chat_id, f"❌ 批量更新失败: {e}")
            except:
                pass

    async def restart_update_check_task(self, new_cron: str) -> bool:
        """重启容器更新检测任务"""
        try:
            # 取消旧任务
            if self.update_check_task:
                self.update_check_task.cancel()
                try:
                    await self.update_check_task
                except asyncio.CancelledError:
                    pass
                logger.info("🛑 已停止旧的更新检测任务")

            # 更新配置
            self.update_check_cron = new_cron

            # 启动新任务
            if self.notify_on_update:
                self.update_check_task = asyncio.create_task(self._check_container_updates_loop())
                logger.info(f"✅ 更新检测任务已重启(cron: {new_cron})")
            else:
                logger.info("⏸️ 更新检测通知已禁用,任务未启动")

            return True
        except Exception as e:
            logger.error(f"❌ 重启更新检测任务失败: {e}")
            return False

    async def restart_clean_images_task(self, new_cron: str = None, enabled: bool = None) -> bool:
        """重启镜像清理任务"""
        try:
            # 取消旧任务
            if self.clean_images_task:
                self.clean_images_task.cancel()
                try:
                    await self.clean_images_task
                except asyncio.CancelledError:
                    pass
                logger.info("🛑 已停止旧的镜像清理任务")

            # 更新配置
            if new_cron is not None:
                self.clean_images_cron = new_cron
            if enabled is not None:
                self.auto_clean_images = enabled

            # 启动新任务
            if self.auto_clean_images:
                self.clean_images_task = asyncio.create_task(self._clean_images_loop())
                logger.info(f"✅ 镜像清理任务已重启(cron: {self.clean_images_cron})")
            else:
                logger.info("⏸️ 镜像清理任务已禁用")

            return True
        except Exception as e:
            logger.error(f"❌ 重启镜像清理任务失败: {e}")
            return False

    async def restart_auto_update_task(self, new_cron: str = None, enabled: bool = None) -> bool:
        """重启容器自动更新任务"""
        try:
            # 取消旧任务
            if self.auto_update_task:
                self.auto_update_task.cancel()
                try:
                    await self.auto_update_task
                except asyncio.CancelledError:
                    pass
                logger.info("🛑 已停止旧的自动更新任务")

            # 更新配置
            if new_cron is not None:
                self.update_containers_cron = new_cron
            if enabled is not None:
                self.auto_update_containers = enabled

            # 启动新任务
            if self.auto_update_containers:
                self.auto_update_task = asyncio.create_task(self._auto_update_containers_loop())
                logger.info(f"✅ 容器自动更新任务已重启(cron: {self.update_containers_cron})")
            else:
                logger.info("⏸️ 容器自动更新任务已禁用")

            return True
        except Exception as e:
            logger.error(f"❌ 重启容器自动更新任务失败: {e}")
            return False

    async def send_updates_list(self, chat_id: str, message_id: Optional[int] = None, page: int = 0):
        """发送可更新容器列表(支持分页)"""
        try:
            logger.info(f"🔄 开始发送可更新容器列表: chat_id={chat_id}, page={page}")
            docker_client = self.get_docker_client(chat_id)
            instance_name = self.get_current_instance_name(chat_id)

            # 获取所有容器
            all_containers = docker_client.get_containers()

            # 筛选出有更新的容器
            containers = [c for c in all_containers if c.has_update]

            logger.info(f"🔄 找到 {len(containers)} 个可更新的容器(总共 {len(all_containers)} 个)")

            if not containers:
                no_update_msg = f"✅ <b>没有可更新的容器</b>\n\n"
                no_update_msg += f"🖥 实例: <b>{instance_name}</b>\n\n"
                no_update_msg += f"所有容器都是最新版本!"

                if message_id:
                    await self.bot.edit_message_text(
                        no_update_msg,
                        chat_id,
                        message_id,
                        parse_mode='HTML'
                    )
                else:
                    await self.bot.send_message(chat_id, no_update_msg, parse_mode='HTML')
                return

            # 分页设置
            items_per_page = 8  # 每页8个容器
            total_pages = (len(containers) + items_per_page - 1) // items_per_page

            # 确保页码有效
            page = max(0, min(page, total_pages - 1))

            # 计算当前页的容器范围
            start = page * items_per_page
            end = min(start + items_per_page, len(containers))
            page_containers = containers[start:end]

            # 构建消息
            message = f"🔄 <b>可更新容器列表</b>\n\n"
            message += f"🖥 实例: <b>{instance_name}</b>\n\n"
            message += f"找到 <b>{len(containers)}</b> 个可更新的容器\n"
            message += f"第 {page + 1}/{total_pages} 页\n\n"

            # 显示容器详情列表
            for idx, container in enumerate(page_containers, start + 1):
                status_icon = "🟢" if container.state == "running" else "⚪"

                # 解析镜像信息
                image_parts = container.image.split(':')
                image_name = image_parts[0] if len(image_parts) > 0 else container.image
                image_tag = image_parts[1] if len(image_parts) > 1 else 'latest'

                # 截断过长的镜像名
                if len(image_name) > 30:
                    image_name = image_name[:27] + "..."

                message += f"{idx}. {status_icon} <b>{container.name}</b>\n"
                message += f"   📦 {image_name}:{image_tag}\n"
                message += f"   🆔 {container.id[:12]}\n\n"

            # 构建键盘
            markup = InlineKeyboardMarkup()

            # 每行2个容器按钮(直接更新,不跳转详情)
            row = []
            for i, container in enumerate(page_containers):
                container_key = self._container_callback_key(chat_id, container.id)
                name = container.name if len(container.name) <= 12 else container.name[:12] + "..."

                button = InlineKeyboardButton(
                    text=f"⬆️ {name}",
                    callback_data=f"quick_update:{container_key}"
                )
                row.append(button)

                # 每2个按钮换行
                if len(row) == 2 or i == len(page_containers) - 1:
                    markup.add(*row)
                    row = []

            # 添加分页按钮
            if total_pages > 1:
                page_row = []

                if page > 0:
                    page_row.append(InlineKeyboardButton('⬅️ 上一页', callback_data=f'update_page:{page - 1}'))

                page_row.append(InlineKeyboardButton(f'📄 {page + 1}/{total_pages}', callback_data='noop'))

                if page < total_pages - 1:
                    page_row.append(InlineKeyboardButton('➡️ 下一页', callback_data=f'update_page:{page + 1}'))

                markup.add(*page_row)

            # 添加"一键更新所有"按钮
            markup.add(InlineKeyboardButton(
                f'⚡ 一键更新所有 ({len(containers)}个)',
                callback_data='update_all_containers'
            ))

            # 添加操作按钮
            markup.add(
                InlineKeyboardButton('🔄 刷新', callback_data='select_inst_updates:' + instance_name),
                InlineKeyboardButton('❌ 取消', callback_data='cancel')
            )

            if message_id:
                await self.bot.edit_message_text(
                    message,
                    chat_id,
                    message_id,
                    reply_markup=markup,
                    parse_mode='HTML'
                )
            else:
                await self.bot.send_message(chat_id, message, reply_markup=markup, parse_mode='HTML')

        except Exception as e:
            logger.error(f"发送可更新容器列表失败: {e}")
            await self.bot.send_message(chat_id, f"❌ 获取可更新容器列表失败: {e}")


    def _image_callback_key(self, chat_id: str, image_id: str) -> str:
        image_id = str(image_id or '')
        if not image_id:
            return ''
        digest = hashlib.sha1(image_id.encode('utf-8')).hexdigest()[:16]
        if not hasattr(self, 'image_callback_cache'):
            self.image_callback_cache = {}
        self.image_callback_cache[f"{chat_id}:{digest}"] = image_id
        return digest

    def _resolve_image_callback_key(self, chat_id: str, key: str) -> str:
        key = str(key or '')
        if not key:
            return ''
        if key.startswith('sha256:') or len(key) > 24:
            return key
        return getattr(self, 'image_callback_cache', {}).get(f"{chat_id}:{key}", key)

    def _container_callback_key(self, chat_id: str, container_id: str) -> str:
        container_id = str(container_id or '')
        if not container_id:
            return ''
        digest = hashlib.sha1(container_id.encode('utf-8')).hexdigest()[:16]
        if not hasattr(self, 'container_callback_cache'):
            self.container_callback_cache = {}
        self.container_callback_cache[f"{chat_id}:{digest}"] = container_id
        return digest

    def _resolve_container_callback_key(self, chat_id: str, key: str) -> str:
        key = str(key or '')
        if not key:
            return ''
        if len(key) > 24:
            return key
        return getattr(self, 'container_callback_cache', {}).get(f"{chat_id}:{key}", key)

    async def send_images_list(self, chat_id: str, message_id: Optional[int] = None, page: int = 0):
        """发送镜像列表(支持分页)"""
        try:
            logger.info(f"📸 开始发送镜像列表: chat_id={chat_id}, page={page}")
            docker_client = self.get_docker_client(chat_id)
            images = docker_client.get_images()
            logger.info(f"📸 获取到 {len(images)} 个镜像")

            if not images:
                await self.bot.send_message(chat_id, "📭 当前没有镜像")
                return

            # 分页设置
            items_per_page = 8  # 每页8个镜像
            total_pages = (len(images) + items_per_page - 1) // items_per_page

            # 确保页码有效
            page = max(0, min(page, total_pages - 1))

            # 计算当前页的镜像范围
            start = page * items_per_page
            end = min(start + items_per_page, len(images))
            page_images = images[start:end]

            # 统计总大小(size已经是字符串格式,如"334 Mb")
            # 这里不再计算总大小,直接显示镜像数量
            total_count = len(images)

            # 构建消息
            message = f"🖼 <b>镜像列表</b>\n\n"
            message += f"总计: {total_count} 个镜像\n"
            message += f"第 {page + 1}/{total_pages} 页\n\n"

            # 构建键盘
            markup = InlineKeyboardMarkup()

            for img in page_images:
                # 获取镜像信息(使用实际的API字段)
                name = img.get('name', '<none>')
                tag = img.get('tag', 'None')
                size_str = img.get('size', '0 Mb')  # 已经是字符串格式
                in_used = img.get('inUsed', False)

                # 构建显示标签
                if tag == 'None' or not tag:
                    display_tag = name
                else:
                    display_tag = f"{name}:{tag}"

                # 截断过长的标签
                if len(display_tag) > 28:
                    display_tag = display_tag[:25] + "..."

                # 添加使用标记
                status_icon = "✅" if in_used else "🗑"
                button_text = f"{status_icon} {display_tag} ({size_str})"

                image_key = self._image_callback_key(chat_id, img.get('id', ''))
                markup.add(InlineKeyboardButton(
                    text=button_text,
                    callback_data=f"image:{image_key}"
                ))

            # 添加分页按钮
            if total_pages > 1:
                page_row = []

                if page > 0:
                    page_row.append(InlineKeyboardButton('⬅️ 上一页', callback_data=f'img_page:{page - 1}'))

                page_row.append(InlineKeyboardButton(f'📄 {page + 1}/{total_pages}', callback_data='noop'))

                if page < total_pages - 1:
                    page_row.append(InlineKeyboardButton('➡️ 下一页', callback_data=f'img_page:{page + 1}'))

                markup.add(*page_row)

            # 添加取消按钮
            markup.add(InlineKeyboardButton('❌ 取消', callback_data='cancel'))

            if message_id:
                await self.bot.edit_message_text(
                    message,
                    chat_id,
                    message_id,
                    reply_markup=markup,
                    parse_mode='HTML'
                )
            else:
                await self.bot.send_message(chat_id, message, reply_markup=markup, parse_mode='HTML')

        except Exception as e:
            logger.error(f"发送镜像列表失败: {e}")
            await self.bot.send_message(chat_id, f"❌ 获取镜像列表失败: {e}")

    async def send_image_detail(self, chat_id: str, message_id: int, image_id: str):
        """发送镜像详情"""
        try:
            docker_client = self.get_docker_client(chat_id)
            images = docker_client.get_images()

            # 查找镜像
            image_info = None
            for img in images:
                if img.get('id', '').startswith(image_id):
                    image_info = img
                    break

            if not image_info:
                await self.bot.send_message(chat_id, f"❌ 未找到镜像 ID: {image_id}")
                return

            # 构建详情消息(使用实际的API字段)
            name = image_info.get('name', '<none>')
            tag = image_info.get('tag', 'None')
            size_str = image_info.get('size', '0 Mb')
            in_used = image_info.get('inUsed', False)
            create_time = image_info.get('createTime', '未知')
            image_id_full = image_info.get('id', '')

            # 构建完整标签
            if tag == 'None' or not tag:
                full_tag = name
            else:
                full_tag = f"{name}:{tag}"

            message = f"🖼 <b>镜像详情</b>\n\n"
            message += f"📦 镜像: <code>{full_tag}</code>\n"
            message += f"🆔 ID: <code>{image_id_full[7:27]}...</code>\n"
            message += f"💾 大小: {size_str}\n"
            message += f"📅 创建时间: {create_time}\n"
            message += f"🔖 状态: {'使用中 ✅' if in_used else '未使用 🗑'}\n"

            # 构建操作按钮
            markup = InlineKeyboardMarkup()

            # 删除按钮(使用完整ID)
            if in_used:
                # 正在使用的镜像,显示警告
                markup.add(InlineKeyboardButton(
                    '⚠️ 强制删除(使用中)',
                    callback_data=f'confirm_del_image:{self._image_callback_key(chat_id, image_id_full)}'
                ))
            else:
                # 未使用的镜像,可安全删除
                markup.add(InlineKeyboardButton(
                    '🗑 删除镜像',
                    callback_data=f'confirm_del_image:{self._image_callback_key(chat_id, image_id_full)}'
                ))

            markup.add(
                InlineKeyboardButton('◀️ 返回', callback_data='back_images:0'),
                InlineKeyboardButton('❌ 取消', callback_data='cancel')
            )

            await self.bot.edit_message_text(
                message,
                chat_id,
                message_id,
                reply_markup=markup,
                parse_mode='HTML'
            )

        except Exception as e:
            logger.error(f"发送镜像详情失败: {e}")
            await self.bot.send_message(chat_id, f"❌ 获取镜像详情失败: {e}")

    async def confirm_delete_image(self, chat_id: str, message_id: int, image_id: str):
        """显示删除镜像确认对话框"""
        try:
            docker_client = self.get_docker_client(chat_id)
            images = docker_client.get_images()

            # 查找镜像
            image_info = None
            for img in images:
                if img.get('id', '') == image_id:
                    image_info = img
                    break

            if not image_info:
                await self.bot.send_message(chat_id, "❌ 未找到镜像")
                return

            name = image_info.get('name', '<none>')
            tag = image_info.get('tag', 'None')
            in_used = image_info.get('inUsed', False)

            # 构建完整标签
            if tag == 'None' or not tag:
                full_tag = name
            else:
                full_tag = f"{name}:{tag}"

            # 构建确认消息
            message = f"⚠️ <b>确认删除镜像</b>\n\n"
            message += f"📦 镜像: <code>{full_tag}</code>\n\n"

            if in_used:
                message += "🚨 <b>警告:此镜像正在使用中!</b>\n"
                message += "删除将使用 <code>force=true</code>\n\n"

            message += "确定要删除吗?"

            # 构建确认按钮
            markup = InlineKeyboardMarkup()

            # 根据是否在使用决定force参数
            force_param = "true" if in_used else "false"
            markup.add(
                InlineKeyboardButton(
                    '✅ 确认删除',
                    callback_data=f'do_del_image:{self._image_callback_key(chat_id, image_id)}:{force_param}'
                ),
                InlineKeyboardButton('❌ 取消', callback_data=f'image:{self._image_callback_key(chat_id, image_id)}')
            )

            await self.bot.edit_message_text(
                message,
                chat_id,
                message_id,
                reply_markup=markup,
                parse_mode='HTML'
            )

        except Exception as e:
            logger.error(f"显示删除确认对话框失败: {e}")
            await self.bot.send_message(chat_id, f"❌ 操作失败: {e}")

    async def delete_image_action(self, chat_id: str, message_id: int, image_id: str, force: bool = False):
        """删除镜像"""
        try:
            docker_client = self.get_docker_client(chat_id)

            # 发送删除中提示
            await self.bot.send_message(chat_id, "🗑 正在删除镜像...")

            # 删除镜像
            result = docker_client.delete_image(image_id, force=force)

            if result.get('code') == 200:
                await self.bot.send_message(chat_id, "✅ 镜像删除成功")
                await asyncio.sleep(0.5)
                # 返回镜像列表
                await self.send_images_list(chat_id, message_id, 0)
            else:
                error_msg = result.get('msg', '未知错误')
                await self.bot.send_message(chat_id, f"❌ 删除镜像失败: {error_msg}")

        except Exception as e:
            logger.error(f"删除镜像失败: {e}")
            await self.bot.send_message(chat_id, f"❌ 删除镜像失败: {e}")

    async def send_instance_selector(self, chat_id: str, action: str):
        """发送实例选择器(用于选择查看哪个实例的资源)

        Args:
            chat_id: 聊天ID
            action: 要执行的操作('containers', 'images', 'status'等)
        """
        try:
            current = self.get_current_instance_name(chat_id)

            message = f"🖥 <b>请选择实例</b>\n\n"
            message += f"当前默认: <b>{current}</b>\n\n"
            message += "选择要查看的实例:"

            markup = InlineKeyboardMarkup()

            # 每行2个实例按钮
            instance_names = list(self.docker_clients.keys())
            row = []
            for idx, name in enumerate(instance_names):
                icon = "✅" if name == current else "⚪"
                button = InlineKeyboardButton(
                    f"{icon} {name}",
                    callback_data=f"select_inst_{action}:{name}"
                )
                row.append(button)

                # 每2个按钮换行,或者是最后一个
                if len(row) == 2 or idx == len(instance_names) - 1:
                    markup.add(*row)
                    row = []

            # 添加返回和取消按钮(一行2个)
            markup.add(
                InlineKeyboardButton('◀️ 返回', callback_data='back_main'),
                InlineKeyboardButton('❌ 取消', callback_data='cancel')
            )

            await self.bot.send_message(chat_id, message, reply_markup=markup, parse_mode='HTML')

        except Exception as e:
            logger.error(f"发送实例选择器失败: {e}")
            await self.bot.send_message(chat_id, f"❌ 发送实例选择器失败: {e}")

    async def send_instances_list(self, chat_id: str):
        """发送实例列表"""
        try:
            if len(self.docker_clients) <= 1:
                await self.bot.send_message(chat_id, "💡 只配置了一个实例,无需切换")
                return

            current = self.get_current_instance_name(chat_id)
            message = f"🖥 <b>Docker Copilot 实例列表</b>\n\n"
            message += f"当前实例: <b>{current}</b>\n\n"
            message += "点击切换到其他实例:"

            markup = InlineKeyboardMarkup()
            for name in self.docker_clients.keys():
                icon = "✅" if name == current else "⚪"
                markup.add(InlineKeyboardButton(
                    f"{icon} {name}",
                    callback_data=f"switch_instance:{name}"
                ))

            await self.bot.send_message(chat_id, message, reply_markup=markup, parse_mode='HTML')

        except Exception as e:
            logger.error(f"发送实例列表失败: {e}")
            await self.bot.send_message(chat_id, f"❌ 获取实例列表失败: {e}")

    async def switch_instance(self, chat_id: str, message_id: int, instance_name: str):
        """切换到指定实例"""
        try:
            # 检查是否已经是当前实例
            current_instance = self.get_current_instance_name(chat_id)

            if instance_name == current_instance:
                # 已经是当前实例,只发送提示消息,不更新列表
                await self.bot.send_message(
                    chat_id,
                    f"💡 当前已经是实例: <b>{instance_name}</b>",
                    parse_mode='HTML'
                )
                return

            # 设置新实例
            if not self.instance_manager.set_instance(chat_id, instance_name):
                await self.bot.send_message(chat_id, "❌ 实例不存在")
                return

            # 更新消息
            current = self.get_current_instance_name(chat_id)
            message = f"🖥 <b>Docker Copilot 实例列表</b>\n\n"
            message += f"当前实例: <b>{current}</b>\n\n"
            message += "点击切换到其他实例:"

            markup = InlineKeyboardMarkup()
            for name in self.docker_clients.keys():
                icon = "✅" if name == current else "⚪"
                markup.add(InlineKeyboardButton(
                    f"{icon} {name}",
                    callback_data=f"switch_instance:{name}"
                ))

            await self.bot.edit_message_text(
                message,
                chat_id,
                message_id,
                reply_markup=markup,
                parse_mode='HTML'
            )

            # 发送切换成功提示消息
            await self.bot.send_message(
                chat_id,
                f"✅ 已切换到实例: <b>{instance_name}</b>",
                parse_mode='HTML'
            )

        except Exception as e:
            logger.error(f"切换实例失败: {e}")
            await self.bot.send_message(chat_id, f"❌ 切换实例失败: {e}")

    async def send_manage_instances(self, chat_id: str, message_id: Optional[int] = None):
        """发送实例管理界面"""
        try:
            current = self.get_current_instance_name(chat_id)

            # 构建消息
            message = f"🔧 <b>实例管理</b>\n\n"
            message += f"当前实例: <b>{current}</b>\n"
            message += f"总计: <b>{len(self.docker_clients)}</b> 个实例\n\n"

            # 获取每个实例的状态
            message += "<b>实例列表:</b>\n"

            for idx, (name, client) in enumerate(self.docker_clients.items(), 1):
                icon = "✅" if name == current else "⚪"
                message += f"\n{idx}. {icon} <b>{name}</b>\n"
                message += f"   📍 {client.api_url}\n"

                # 尝试获取容器数量(测试连接)
                try:
                    containers = client.get_containers()
                    running_count = sum(1 for c in containers if c.state == "running")
                    message += f"   🐳 容器: {len(containers)} 个 ({running_count} 运行中)\n"
                    message += f"   🟢 状态: 在线\n"
                except Exception as e:
                    message += f"   🔴 状态: 离线\n"
                    message += f"   ❗ 错误: {str(e)[:30]}...\n"

            message += f"\n💡 <b>提示:</b>\n"
            message += f"• 点击实例名称查看详情\n"
            message += f"• 使用 /instances 快速切换实例\n"
            message += f"• 修改配置使用 /settings 命令或编辑环境变量"

            # 构建按钮
            markup = InlineKeyboardMarkup()

            # 每个实例一个按钮
            for name in self.docker_clients.keys():
                icon = "✅" if name == current else "📋"
                markup.add(InlineKeyboardButton(
                    f"{icon} {name}",
                    callback_data=f"manage_inst_detail:{name}"
                ))

            # 刷新按钮
            markup.add(
                InlineKeyboardButton('🔄 刷新状态', callback_data='manage_inst_refresh'),
                InlineKeyboardButton('❌ 关闭', callback_data='cancel')
            )

            if message_id:
                await self.bot.edit_message_text(
                    message,
                    chat_id,
                    message_id,
                    reply_markup=markup,
                    parse_mode='HTML'
                )
            else:
                await self.bot.send_message(
                    chat_id,
                    message,
                    reply_markup=markup,
                    parse_mode='HTML'
                )

        except Exception as e:
            # 如果是 "message is not modified" 错误,向上传播让调用者处理
            error_str = str(e).lower()
            if "message is not modified" in error_str or "message not modified" in error_str or "not modified" in error_str:
                raise
            # 其他错误直接报告
            logger.error(f"发送实例管理界面失败: {e}")
            await self.bot.send_message(chat_id, f"❌ 获取实例管理失败: {e}")

    async def send_instance_detail(self, chat_id: str, message_id: int, instance_name: str):
        """发送实例详细信息"""
        try:
            if instance_name not in self.docker_clients:
                await self.bot.send_message(chat_id, "❌ 实例不存在")
                return

            client = self.docker_clients[instance_name]
            current = self.get_current_instance_name(chat_id)

            # 构建详情消息
            message = f"📋 <b>实例详情</b>\n\n"
            message += f"📛 名称: <b>{instance_name}</b>\n"
            message += f"📍 API 地址: <code>{client.api_url}</code>\n"
            message += f"⏱ 超时时间: {client.timeout} 秒\n\n"

            # 测试连接
            message += f"<b>连接测试:</b>\n"
            try:
                containers = client.get_containers()
                running_count = sum(1 for c in containers if c.state == "running")
                stopped_count = len(containers) - running_count
                update_count = sum(1 for c in containers if c.has_update)

                message += f"✅ 连接正常\n\n"
                message += f"<b>容器统计:</b>\n"
                message += f"  • 总计: {len(containers)} 个\n"
                message += f"  • 运行中: {running_count} 个\n"
                message += f"  • 已停止: {stopped_count} 个\n"
                message += f"  • 可更新: {update_count} 个\n"

                # 显示前5个容器
                if containers:
                    message += f"\n<b>容器列表(前5个):</b>\n"
                    for container in containers[:5]:
                        status_icon = "🟢" if container.state == "running" else "⚪"
                        update_icon = "🔄" if container.has_update else ""
                        message += f"  {status_icon} {update_icon} {container.name}\n"

                    if len(containers) > 5:
                        message += f"  ... 还有 {len(containers) - 5} 个\n"

            except Exception as e:
                message += f"❌ 连接失败\n"
                message += f"错误信息: <code>{str(e)}</code>\n"

            # 构建操作按钮
            markup = InlineKeyboardMarkup()

            # 如果不是当前实例,显示切换按钮
            if instance_name != current:
                markup.add(InlineKeyboardButton(
                    '🔄 切换到此实例',
                    callback_data=f'manage_switch_to:{instance_name}'
                ))

            markup.add(
                InlineKeyboardButton('🧪 重新测试', callback_data=f'manage_inst_detail:{instance_name}'),
                InlineKeyboardButton('◀️ 返回', callback_data='manage_inst_back')
            )

            await self.bot.edit_message_text(
                message,
                chat_id,
                message_id,
                reply_markup=markup,
                parse_mode='HTML'
            )

        except Exception as e:
            # 如果是 "message is not modified" 错误,向上传播让调用者处理
            error_str = str(e).lower()
            if "message is not modified" in error_str or "message not modified" in error_str or "not modified" in error_str:
                raise
            # 其他错误直接报告
            logger.error(f"发送实例详情失败: {e}")
            await self.bot.send_message(chat_id, f"❌ 获取实例详情失败: {e}")

    async def reload_instances(self, chat_id: str):
        """重新加载实例配置"""
        await self.bot.send_message(chat_id, "🔄 重新加载配置功能开发中...")

    async def send_version_info(self, chat_id: str, skip_selector: bool = False):
        """发送版本信息

        Args:
            chat_id: 聊天ID
            skip_selector: 是否跳过实例选择(从回调中调用时应设为True)
        """
        try:
            # 如果有多个实例且未跳过选择器,先让用户选择
            if len(self.docker_clients) > 1 and not skip_selector:
                await self.send_instance_selector(chat_id, 'version')
                return

            docker_client = self.get_docker_client(chat_id)
            instance_name = self.get_current_instance_name(chat_id)

            # 获取本地版本
            local_version_result = docker_client.get_version('local')
            local_version = local_version_result.get('data', {}).get('version', '未知')

            # 获取远程版本
            remote_version_result = docker_client.get_version('remote')
            remote_version = remote_version_result.get('data', {}).get('version', '未知')

            # 构建消息
            message = f"📦 <b>版本信息</b>\n\n"
            message += f"🖥 实例: <b>{instance_name}</b>\n\n"
            message += f"📌 当前版本: <code>{local_version}</code>\n"
            message += f"🌐 最新版本: <code>{remote_version}</code>\n\n"

            if local_version != remote_version and remote_version != '未知':
                message += "🔄 <b>有新版本可用!</b>\n"
                message += "使用 /update_program 更新"
            elif local_version == remote_version:
                message += "✅ <b>已是最新版本</b>"

            await self.bot.send_message(chat_id, message, parse_mode='HTML')

        except Exception as e:
            logger.error(f"获取版本信息失败: {e}")
            await self.bot.send_message(chat_id, f"❌ 获取版本信息失败: {e}")

    async def update_program(self, chat_id: str, skip_selector: bool = False):
        """更新Docker Copilot程序

        Args:
            chat_id: 聊天ID
            skip_selector: 是否跳过实例选择(从回调中调用时应设为True)
        """
        try:
            # 如果有多个实例且未跳过选择器,先让用户选择
            if len(self.docker_clients) > 1 and not skip_selector:
                await self.send_instance_selector(chat_id, 'update_program')
                return

            docker_client = self.get_docker_client(chat_id)
            instance_name = self.get_current_instance_name(chat_id)

            # 发送确认消息
            await self.bot.send_message(
                chat_id,
                f"🔄 正在更新 <b>{instance_name}</b> 的Docker Copilot程序...\n\n"
                f"⚠️ 更新期间服务可能会短暂中断",
                parse_mode='HTML'
            )

            # 执行更新
            result = docker_client.update_program()

            if result.get('code') == 200:
                await self.bot.send_message(
                    chat_id,
                    f"✅ <b>{instance_name}</b> 更新成功!\n\n"
                    f"程序正在重启,请稍候...",
                    parse_mode='HTML'
                )
            else:
                error_msg = result.get('msg', '未知错误')
                await self.bot.send_message(
                    chat_id,
                    f"❌ 更新失败: {error_msg}",
                    parse_mode='HTML'
                )

        except Exception as e:
            logger.error(f"更新程序失败: {e}")
            await self.bot.send_message(chat_id, f"❌ 更新程序失败: {e}")

    async def create_backup(self, chat_id: str):
        """创建容器备份(显示格式选择对话框)"""
        try:
            docker_client = self.get_docker_client(chat_id)
            instance_name = self.get_current_instance_name(chat_id)

            # 获取容器列表
            containers = docker_client.get_containers()

            # 构建选择消息
            message = f"💾 <b>创建容器备份</b>\n\n"
            message += f"🖥 实例: <b>{instance_name}</b>\n\n"
            message += f"📦 将备份 <b>{len(containers)}</b> 个容器的配置\n\n"
            message += f"请选择备份格式:"

            # 构建格式选择按钮
            markup = InlineKeyboardMarkup()

            # Config格式按钮
            markup.add(InlineKeyboardButton(
                '📋 Config格式 (完整配置)',
                callback_data='confirm_backup'
            ))

            # Compose格式按钮
            markup.add(InlineKeyboardButton(
                '📄 Compose格式 (docker-compose.yml)',
                callback_data='confirm_backup_compose'
            ))

            # 取消按钮
            markup.add(InlineKeyboardButton('❌ 取消', callback_data='cancel'))

            await self.bot.send_message(chat_id, message, reply_markup=markup, parse_mode='HTML')

        except Exception as e:
            logger.error(f"显示备份格式选择对话框失败: {e}")
            await self.bot.send_message(chat_id, f"❌ 操作失败: {e}")

    async def do_create_backup(self, chat_id: str, message_id: int):
        """执行创建容器备份操作(Config格式)"""
        try:
            docker_client = self.get_docker_client(chat_id)
            instance_name = self.get_current_instance_name(chat_id)

            # 删除选择消息
            await self.bot.delete_message(chat_id, message_id)

            # 发送备份中消息
            progress_msg = await self.bot.send_message(
                chat_id,
                f"💾 <b>正在创建Config备份</b>\n\n"
                f"🖥 实例: <b>{instance_name}</b>\n"
                f"📋 格式: Config (完整配置)\n\n"
                f"⏳ 正在备份容器配置...",
                parse_mode='HTML'
            )

            # 调用备份API
            result = docker_client.backup_containers()

            # 检查result是否为None
            if result is None:
                logger.error("backup_containers返回None")
                await self.bot.edit_message_text(
                    f"❌ <b>Config备份失败</b>\n\n"
                    f"🖥 实例: <b>{instance_name}</b>\n\n"
                    f"❗ 错误: API调用失败,请检查网络连接",
                    chat_id,
                    progress_msg.message_id,
                    parse_mode='HTML'
                )
                return

            # 检查返回码
            code = result.get('code', 0)
            if code == 200:
                # 获取备份信息(如果API返回了)
                backup_data = result.get('data', {})
                if backup_data:
                    backup_file = backup_data.get('filename', '未知')
                else:
                    backup_file = '未知'

                await self.bot.edit_message_text(
                    f"✅ <b>Config备份成功</b>\n\n"
                    f"🖥 实例: <b>{instance_name}</b>\n"
                    f"📁 备份文件: <code>{backup_file}</code>\n"
                    f"📋 格式: Config (完整配置)\n\n"
                    f"🎉 容器配置已成功备份!\n\n"
                    f"💡 备份内容包括:\n"
                    f"  • 容器配置信息\n"
                    f"  • 环境变量\n"
                    f"  • 卷挂载\n"
                    f"  • 端口映射\n"
                    f"  • 网络配置\n\n"
                    f"使用 /backups 查看所有备份",
                    chat_id,
                    progress_msg.message_id,
                    parse_mode='HTML'
                )
            else:
                error_msg = result.get('msg', '未知错误')
                logger.error(f"Config备份失败: code={code}, msg={error_msg}")
                await self.bot.edit_message_text(
                    f"❌ <b>Config备份失败</b>\n\n"
                    f"🖥 实例: <b>{instance_name}</b>\n\n"
                    f"❗ 错误: {error_msg}\n"
                    f"🔍 返回码: {code}",
                    chat_id,
                    progress_msg.message_id,
                    parse_mode='HTML'
                )

        except Exception as e:
            logger.error(f"创建Config备份失败: {e}", exc_info=True)
            try:
                await self.bot.send_message(
                    chat_id,
                    f"❌ <b>创建Config备份失败</b>\n\n"
                    f"❗ 错误: {str(e)}",
                    parse_mode='HTML'
                )
            except Exception:
                await self.bot.send_message(chat_id, f"❌ 创建Config备份失败: {e}")

    async def do_backup_to_compose(self, chat_id: str, message_id: int):
        """执行备份为docker-compose操作(Compose格式)"""
        try:
            docker_client = self.get_docker_client(chat_id)
            instance_name = self.get_current_instance_name(chat_id)

            # 删除选择消息
            await self.bot.delete_message(chat_id, message_id)

            # 发送备份中消息
            progress_msg = await self.bot.send_message(
                chat_id,
                f"📄 <b>正在创建Compose备份</b>\n\n"
                f"🖥 实例: <b>{instance_name}</b>\n"
                f"📄 格式: Compose (docker-compose.yml)\n\n"
                f"⏳ 正在生成docker-compose.yml配置...",
                parse_mode='HTML'
            )

            # 调用备份为compose API
            result = docker_client.backup_to_compose()

            # 检查result是否为None
            if result is None:
                logger.error("backup_to_compose返回None")
                await self.bot.edit_message_text(
                    f"❌ <b>Compose备份失败</b>\n\n"
                    f"🖥 实例: <b>{instance_name}</b>\n\n"
                    f"❗ 错误: API调用失败,请检查网络连接",
                    chat_id,
                    progress_msg.message_id,
                    parse_mode='HTML'
                )
                return

            # 检查返回码
            code = result.get('code', 0)
            if code == 200:
                # 获取备份信息(如果API返回了)
                backup_data = result.get('data', {})
                if backup_data:
                    backup_file = backup_data.get('filename', 'docker-compose.yml')
                else:
                    backup_file = 'docker-compose.yml'

                success_msg = f"✅ <b>Compose备份成功</b>\n\n"
                success_msg += f"🖥 实例: <b>{instance_name}</b>\n"
                success_msg += f"📁 备份文件: <code>{backup_file}</code>\n"
                success_msg += f"📄 格式: Compose (docker-compose.yml)\n\n"
                success_msg += f"🎉 已成功导出为docker-compose格式!\n\n"
                success_msg += f"💡 此格式可用于:\n"
                success_msg += f"  • 快速迁移容器配置\n"
                success_msg += f"  • 版本控制管理\n"
                success_msg += f"  • 批量部署容器\n\n"
                success_msg += f"使用 /backups 查看所有备份"

                await self.bot.edit_message_text(
                    success_msg,
                    chat_id,
                    progress_msg.message_id,
                    parse_mode='HTML'
                )
            else:
                error_msg = result.get('msg', '未知错误')
                logger.error(f"Compose备份失败: code={code}, msg={error_msg}")
                fail_msg = f"❌ <b>Compose备份失败</b>\n\n"
                fail_msg += f"🖥 实例: <b>{instance_name}</b>\n\n"
                fail_msg += f"❗ 错误: {error_msg}\n"
                fail_msg += f"🔍 返回码: {code}"

                await self.bot.edit_message_text(
                    fail_msg,
                    chat_id,
                    progress_msg.message_id,
                    parse_mode='HTML'
                )

        except Exception as e:
            logger.error(f"创建Compose备份失败: {e}", exc_info=True)
            try:
                await self.bot.send_message(
                    chat_id,
                    f"❌ <b>创建Compose备份失败</b>\n\n"
                    f"❗ 错误: {str(e)}",
                    parse_mode='HTML'
                )
            except Exception:
                await self.bot.send_message(chat_id, f"❌ 创建Compose备份失败: {e}")

    async def send_backups_list(self, chat_id: str, message_id: Optional[int] = None, page: int = 0):
        """发送备份文件列表(支持分页)"""
        try:
            logger.info(f"📋 开始发送备份列表: chat_id={chat_id}, page={page}")
            docker_client = self.get_docker_client(chat_id)
            instance_name = self.get_current_instance_name(chat_id)

            # 获取备份列表
            backups = docker_client.get_backups()

            logger.info(f"📋 获取到 {len(backups)} 个备份文件")

            if not backups:
                no_backup_msg = f"📭 <b>没有备份文件</b>\n\n"
                no_backup_msg += f"🖥 实例: <b>{instance_name}</b>\n\n"
                no_backup_msg += f"暂无任何备份文件\n\n"
                no_backup_msg += f"💡 使用 /backup 创建新备份"

                if message_id:
                    await self.bot.edit_message_text(
                        no_backup_msg,
                        chat_id,
                        message_id,
                        parse_mode='HTML'
                    )
                else:
                    await self.bot.send_message(chat_id, no_backup_msg, parse_mode='HTML')
                return

            # 分页设置
            items_per_page = 8  # 每页8个备份
            total_pages = (len(backups) + items_per_page - 1) // items_per_page

            # 确保页码有效
            page = max(0, min(page, total_pages - 1))

            # 计算当前页的备份范围
            start = page * items_per_page
            end = min(start + items_per_page, len(backups))
            page_backups = backups[start:end]

            # 构建消息
            message = f"📋 <b>备份文件列表</b>\n\n"
            message += f"🖥 实例: <b>{instance_name}</b>\n\n"
            message += f"总计: <b>{len(backups)}</b> 个备份文件\n"
            message += f"第 {page + 1}/{total_pages} 页\n\n"

            # 显示备份文件列表
            for idx, backup_file in enumerate(page_backups, start + 1):
                # 解析备份文件名(通常包含时间戳)
                # 例如: backup_2025-10-03_15-30-00.json
                file_display = backup_file
                if len(backup_file) > 35:
                    file_display = backup_file[:32] + "..."

                message += f"{idx}. 📁 <code>{file_display}</code>\n"

            # 构建键盘
            markup = InlineKeyboardMarkup()

            # 备份文件按钮(每行1个)
            for backup_file in page_backups:
                # 截断文件名用于按钮显示
                button_text = backup_file
                if len(button_text) > 30:
                    button_text = button_text[:27] + "..."

                markup.add(InlineKeyboardButton(
                    text=f"📁 {button_text}",
                    callback_data=f"backup_detail:{backup_file}"
                ))

            # 添加分页按钮
            if total_pages > 1:
                page_row = []

                if page > 0:
                    page_row.append(InlineKeyboardButton('⬅️ 上一页', callback_data=f'backup_page:{page - 1}'))

                page_row.append(InlineKeyboardButton(f'📄 {page + 1}/{total_pages}', callback_data='noop'))

                if page < total_pages - 1:
                    page_row.append(InlineKeyboardButton('➡️ 下一页', callback_data=f'backup_page:{page + 1}'))

                markup.add(*page_row)

            # 添加操作按钮
            markup.add(
                InlineKeyboardButton('🔄 刷新', callback_data='select_inst_backups:' + instance_name),
                InlineKeyboardButton('➕ 创建备份', callback_data='select_inst_backup:' + instance_name)
            )
            markup.add(InlineKeyboardButton('❌ 取消', callback_data='cancel'))

            if message_id:
                await self.bot.edit_message_text(
                    message,
                    chat_id,
                    message_id,
                    reply_markup=markup,
                    parse_mode='HTML'
                )
            else:
                await self.bot.send_message(chat_id, message, reply_markup=markup, parse_mode='HTML')

        except Exception as e:
            logger.error(f"发送备份列表失败: {e}")
            await self.bot.send_message(chat_id, f"❌ 获取备份列表失败: {e}")

    async def send_backup_detail(self, chat_id: str, message_id: int, backup_filename: str):
        """发送备份文件详情"""
        try:
            docker_client = self.get_docker_client(chat_id)
            instance_name = self.get_current_instance_name(chat_id)

            # 构建详情消息
            message = f"📁 <b>备份文件详情</b>\n\n"
            message += f"🖥 实例: <b>{instance_name}</b>\n\n"
            message += f"📄 文件名: <code>{backup_filename}</code>\n\n"

            # 尝试解析文件名中的时间戳
            # 例如: backup_2025-10-03_15-30-00.json
            if "backup_" in backup_filename:
                try:
                    parts = backup_filename.replace("backup_", "").replace(".json", "").split("_")
                    if len(parts) >= 2:
                        date_part = parts[0]
                        time_part = parts[1].replace("-", ":")
                        message += f"📅 创建时间: {date_part} {time_part}\n\n"
                except Exception:
                    pass

            message += f"💡 选择操作:"

            # 构建操作按钮
            markup = InlineKeyboardMarkup()

            # 恢复和删除按钮
            # markup.add(InlineKeyboardButton('♻️ 恢复备份', callback_data=f'restore_backup:{backup_filename}'))  # 恢复功能待实现
            markup.add(InlineKeyboardButton('🗑 删除备份', callback_data=f'confirm_delete_backup:{backup_filename}'))

            # 返回按钮
            markup.add(
                InlineKeyboardButton('◀️ 返回列表', callback_data='back_backups:0'),
                InlineKeyboardButton('❌ 取消', callback_data='cancel')
            )

            await self.bot.edit_message_text(
                message,
                chat_id,
                message_id,
                reply_markup=markup,
                parse_mode='HTML'
            )

        except Exception as e:
            logger.error(f"发送备份详情失败: {e}")
            await self.bot.send_message(chat_id, f"❌ 获取备份详情失败: {e}")

    async def confirm_delete_backup(self, chat_id: str, message_id: int, backup_filename: str):
        """显示删除备份确认对话框"""
        try:
            instance_name = self.get_current_instance_name(chat_id)

            # 解析备份时间
            time_info = ""
            if "backup_" in backup_filename:
                try:
                    parts = backup_filename.replace("backup_", "").replace(".json", "").split("_")
                    if len(parts) >= 2:
                        date_part = parts[0]
                        time_part = parts[1].replace("-", ":")
                        time_info = f"\n📅 创建时间: {date_part} {time_part}\n"
                except Exception:
                    pass

            # 构建确认消息
            message = f"⚠️ <b>确认删除备份</b>\n\n"
            message += f"🖥 实例: <b>{instance_name}</b>\n"
            message += f"📁 文件名: <code>{backup_filename}</code>{time_info}\n"
            message += f"🚨 <b>此操作不可逆!</b>\n\n"
            message += f"确定要删除这个备份文件吗?"

            # 构建确认按钮
            markup = InlineKeyboardMarkup()
            markup.add(
                InlineKeyboardButton('✅ 确认删除', callback_data=f'do_delete_backup:{backup_filename}'),
                InlineKeyboardButton('❌ 取消', callback_data=f'backup_detail:{backup_filename}')
            )

            await self.bot.edit_message_text(
                message,
                chat_id,
                message_id,
                reply_markup=markup,
                parse_mode='HTML'
            )

        except Exception as e:
            logger.error(f"显示删除确认对话框失败: {e}")
            await self.bot.send_message(chat_id, f"❌ 操作失败: {e}")

    async def do_delete_backup(self, chat_id: str, message_id: int, backup_filename: str):
        """执行删除备份操作"""
        try:
            docker_client = self.get_docker_client(chat_id)
            instance_name = self.get_current_instance_name(chat_id)

            # 更新消息为删除中
            await self.bot.edit_message_text(
                f"🗑 <b>正在删除备份</b>\n\n"
                f"🖥 实例: <b>{instance_name}</b>\n"
                f"📁 文件: <code>{backup_filename}</code>\n\n"
                f"⏳ 处理中...",
                chat_id,
                message_id,
                parse_mode='HTML'
            )

            # 调用删除API
            result = docker_client.delete_backup(backup_filename)

            if result.get('code') == 200:
                await self.bot.edit_message_text(
                    f"✅ <b>删除成功</b>\n\n"
                    f"🖥 实例: <b>{instance_name}</b>\n"
                    f"📁 文件: <code>{backup_filename}</code>\n\n"
                    f"🎉 备份文件已成功删除!\n\n"
                    f"💡 使用 /backups 查看剩余备份",
                    chat_id,
                    message_id,
                    parse_mode='HTML'
                )
            else:
                error_msg = result.get('msg', '未知错误')
                await self.bot.edit_message_text(
                    f"❌ <b>删除失败</b>\n\n"
                    f"🖥 实例: <b>{instance_name}</b>\n"
                    f"📁 文件: <code>{backup_filename}</code>\n\n"
                    f"❗ 错误: {error_msg}",
                    chat_id,
                    message_id,
                    parse_mode='HTML'
                )

        except Exception as e:
            logger.error(f"删除备份失败: {e}")
            try:
                await self.bot.edit_message_text(
                    f"❌ <b>删除备份失败</b>\n\n"
                    f"❗ 错误: {str(e)}",
                    chat_id,
                    message_id,
                    parse_mode='HTML'
                )
            except Exception:
                await self.bot.send_message(chat_id, f"❌ 删除备份失败: {e}")

    async def clean_unused_images(self, chat_id: str):
        """清理无用镜像(无tag和未使用的镜像)"""
        try:
            docker_client = self.get_docker_client(chat_id)
            instance_name = self.get_current_instance_name(chat_id)

            # 获取所有镜像
            images = docker_client.get_images()

            # 筛选出需要清理的镜像
            # 1. 无tag的镜像(tag为空、None或'None')
            # 2. 未使用的镜像(inUsed=False)
            images_to_clean = []
            for img in images:
                tag = img.get('tag', '')
                in_used = img.get('inUsed', False)
                name = img.get('name', '<none>')

                # 无tag:tag为空、None或字符串'None'
                no_tag = not tag or tag == 'None' or tag == '<none>'
                # 未使用
                not_in_use = not in_used

                # 符合清理条件:无tag 或 未使用(两个条件满足其一即可)
                if no_tag or not_in_use:
                    images_to_clean.append(img)

            if not images_to_clean:
                await self.bot.send_message(
                    chat_id,
                    f"✅ <b>{instance_name}</b> 没有需要清理的镜像\n\n"
                    f"所有镜像都在使用中且有正确的tag",
                    parse_mode='HTML'
                )
                return

            # 构建确认消息
            message = f"🗑 <b>清理无用镜像</b>\n\n"
            message += f"🖥 实例: <b>{instance_name}</b>\n\n"
            message += f"找到 <b>{len(images_to_clean)}</b> 个可清理的镜像:\n\n"

            # 分类展示镜像详情
            no_tag_unused = []  # 无tag且未使用
            no_tag_only = []     # 仅无tag
            not_used_only = []   # 仅未使用

            for img in images_to_clean:
                tag = img.get('tag', '')
                in_used = img.get('inUsed', False)
                name = img.get('name', '<none>')
                size = img.get('size', '0 Mb')
                image_id = img.get('id', '')

                no_tag = not tag or tag == 'None' or tag == '<none>'
                not_in_use = not in_used

                # 构建显示名称(包含大小和短ID)
                if tag == 'None' or not tag:
                    display_name = f"{name}"
                else:
                    display_name = f"{name}:{tag}"

                # 截断过长的名称
                if len(display_name) > 35:
                    display_name = display_name[:32] + "..."

                short_id = image_id[7:19] if len(image_id) > 19 else image_id[:12]
                img_info = f"<code>{display_name}</code>\n    ID: {short_id} | {size}"

                # 分类
                if no_tag and not_in_use:
                    no_tag_unused.append(img_info)
                elif no_tag:
                    no_tag_only.append(img_info)
                elif not_in_use:
                    not_used_only.append(img_info)

            # 显示分类详情
            if no_tag_unused:
                message += f"📦 <b>无tag且未使用</b> ({len(no_tag_unused)} 个):\n"
                for info in no_tag_unused[:5]:  # 最多显示5个
                    message += f"  • {info}\n"
                if len(no_tag_unused) > 5:
                    message += f"  • ... 还有 {len(no_tag_unused) - 5} 个\n"
                message += "\n"

            if no_tag_only:
                message += f"📦 <b>仅无tag</b> ({len(no_tag_only)} 个):\n"
                for info in no_tag_only[:5]:
                    message += f"  • {info}\n"
                if len(no_tag_only) > 5:
                    message += f"  • ... 还有 {len(no_tag_only) - 5} 个\n"
                message += "\n"

            if not_used_only:
                message += f"📦 <b>仅未使用</b> ({len(not_used_only)} 个):\n"
                for info in not_used_only[:5]:
                    message += f"  • {info}\n"
                if len(not_used_only) > 5:
                    message += f"  • ... 还有 {len(not_used_only) - 5} 个\n"
                message += "\n"

            message += f"⚠️ <b>此操作不可逆,确定要清理这些镜像吗?</b>"

            # 构建确认按钮
            markup = InlineKeyboardMarkup()
            markup.add(
                InlineKeyboardButton('✅ 确认清理', callback_data='confirm_clean_images'),
                InlineKeyboardButton('❌ 取消', callback_data='cancel')
            )

            await self.bot.send_message(chat_id, message, reply_markup=markup, parse_mode='HTML')

        except Exception as e:
            logger.error(f"获取待清理镜像列表失败: {e}")
            await self.bot.send_message(chat_id, f"❌ 获取镜像列表失败: {e}")

    async def do_clean_unused_images(self, chat_id: str, message_id: int):
        """执行清理无用镜像操作"""
        try:
            docker_client = self.get_docker_client(chat_id)
            instance_name = self.get_current_instance_name(chat_id)

            # 删除确认消息
            await self.bot.delete_message(chat_id, message_id)

            # 发送开始清理消息
            progress_msg = await self.bot.send_message(
                chat_id,
                f"🗑 正在清理 <b>{instance_name}</b> 的无用镜像...\n\n"
                f"⏳ 请稍候,这可能需要一些时间...",
                parse_mode='HTML'
            )

            # 获取所有镜像
            images = docker_client.get_images()

            # 筛选需要清理的镜像
            images_to_clean = []
            for img in images:
                tag = img.get('tag', '')
                in_used = img.get('inUsed', False)

                no_tag = not tag or tag == 'None' or tag == '<none>'
                not_in_use = not in_used

                if no_tag or not_in_use:
                    images_to_clean.append(img)

            # 执行清理
            success_count = 0
            failed_count = 0
            failed_images = []

            for idx, img in enumerate(images_to_clean, 1):
                image_id = img.get('id', '')
                name = img.get('name', '<none>')
                tag = img.get('tag', 'None')
                in_used = img.get('inUsed', False)

                # 构建显示名称
                if tag == 'None' or not tag:
                    display_name = name
                else:
                    display_name = f"{name}:{tag}"

                try:
                    # 根据是否使用中决定force参数
                    force = in_used
                    result = docker_client.delete_image(image_id, force=force)

                    if result.get('code') == 200:
                        success_count += 1
                        logger.info(f"✅ 清理成功: {display_name}")
                    else:
                        failed_count += 1
                        error_msg = result.get('msg', '未知错误')
                        failed_images.append(f"{display_name}: {error_msg}")
                        logger.error(f"❌ 清理失败: {display_name} - {error_msg}")

                except Exception as e:
                    failed_count += 1
                    failed_images.append(f"{display_name}: {str(e)}")
                    logger.error(f"❌ 清理异常: {display_name} - {e}")

                # 更新进度(每5个或最后一个)
                if idx % 5 == 0 or idx == len(images_to_clean):
                    progress_text = f"🗑 正在清理 <b>{instance_name}</b> 的无用镜像...\n\n"
                    progress_text += f"📊 进度: {idx}/{len(images_to_clean)}\n"
                    progress_text += f"✅ 成功: {success_count}\n"
                    progress_text += f"❌ 失败: {failed_count}"

                    try:
                        await self.bot.edit_message_text(
                            progress_text,
                            chat_id,
                            progress_msg.message_id,
                            parse_mode='HTML'
                        )
                    except Exception:
                        pass  # 忽略编辑消息失败的错误

            # 发送最终结果
            result_message = f"🗑 <b>清理完成</b>\n\n"
            result_message += f"🖥 实例: <b>{instance_name}</b>\n\n"
            result_message += f"📊 总计: {len(images_to_clean)} 个镜像\n"
            result_message += f"✅ 成功: {success_count} 个\n"
            result_message += f"❌ 失败: {failed_count} 个\n"

            if failed_images:
                result_message += f"\n⚠️ <b>失败详情:</b>\n"
                # 只显示前5个失败项
                for fail in failed_images[:5]:
                    result_message += f"  • {fail}\n"
                if len(failed_images) > 5:
                    result_message += f"  ... 还有 {len(failed_images) - 5} 个失败项"

            await self.bot.send_message(chat_id, result_message, parse_mode='HTML')

            # 删除进度消息
            try:
                await self.bot.delete_message(chat_id, progress_msg.message_id)
            except Exception:
                pass

        except Exception as e:
            logger.error(f"清理镜像失败: {e}")
            await self.bot.send_message(chat_id, f"❌ 清理镜像失败: {e}")

    def _get_welcome_message(self, chat_id: str) -> str:
        """获取欢迎消息"""
        current = self.get_current_instance_name(chat_id)
        instance_count = len(self.docker_clients)

        multi_instance_tip = ""
        if instance_count > 1:
            multi_instance_tip = f"\n\n🖥 当前实例: <b>{current}</b>\n💡 使用 /instances 切换服务器"
        elif instance_count == 1:
            multi_instance_tip = f"\n\n🖥 当前实例: <b>{current}</b>"

        return f"""👋 <b>欢迎使用 Docker Copilot Bot</b>

我可以帮你管理Docker容器:
• 查看/管理容器
• 查看/清理镜像
• 备份/恢复容器配置
• 更新/启动/停止/重启容器{multi_instance_tip}

使用 /help 查看所有命令"""

    def _get_help_message(self) -> str:
        """获取帮助消息"""
        multi_instance_help = ""
        if len(self.docker_clients) > 1:
            multi_instance_help = f"""

<b>🖥 实例管理:</b>
/instances - 查看/切换实例
/manage_instances - 管理实例配置(查看详情/测试连接)"""

        return f"""📖 <b>Docker Copilot Bot 帮助</b>

<b>📦 容器管理:</b>
/containers - 查看容器列表(支持分页)
/updates - 查看可更新容器
/status - 查看系统状态

<b>🖼 镜像管理:</b>
/images - 查看镜像列表
/clean_images - 清理无用镜像(手动清理)

<b>💾 备份管理:</b>
/backup - 创建容器备份
/backups - 查看备份列表{multi_instance_help}

<b>i️ 其他命令:</b>
/start - 查看欢迎信息
/help - 显示本帮助信息
/version - 查看版本信息
/update_program - 更新Bot程序

💡 <b>提示:</b>点击列表项可查看详情并进行操作
🔧 <b>配置方式:</b>config.json(通过 /settings 修改)或环境变量"""

    def send_startup_notification(self, instance_count: int, instance_names: List[str], chat_ids: List[str]):
        """发送启动成功通知"""
        import datetime

        # 构建通知消息
        now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        message = f"🎉 <b>Docker Copilot Bot 启动成功</b>\n\n"
        message += f"⏰ 启动时间: {now}\n"
        message += f"🖥 实例数量: {instance_count} 个\n\n"

        if instance_count > 0:
            message += "📋 <b>可用实例:</b>\n"
            for i, name in enumerate(instance_names, 1):
                message += f"  {i}. {name}\n"

        message += f"\n✅ Bot已就绪,可以开始使用!\n"
        message += f"💡 发送 /help 查看可用命令"

        # 发送给所有配置的chat_ids
        async def send_notifications():
            for chat_id in chat_ids:
                try:
                    await self.bot.send_message(chat_id, message, parse_mode='HTML')
                    logger.info(f"✅ 启动通知已发送到: {chat_id}")
                except Exception as e:
                    logger.error(f"❌ 发送启动通知失败 [{chat_id}]: {e}")

        # 运行异步发送
        try:
            asyncio.run(send_notifications())
        except Exception as e:
            logger.warning(f"发送启动通知时出错: {e}")

    async def _check_container_updates_loop(self):
        """后台任务:定期检查容器更新"""
        try:
            # 验证cron表达式
            cron = croniter(self.update_check_cron, datetime.now())
            logger.info(f"🔄 容器更新检测已启动(cron: {self.update_check_cron})")
        except Exception as e:
            logger.error(f"❌ 无效的cron表达式 '{self.update_check_cron}': {e}")
            return

        while True:
            try:
                # 计算下次执行时间
                now = datetime.now()
                cron = croniter(self.update_check_cron, now)
                next_run = cron.get_next(datetime)
                wait_seconds = (next_run - now).total_seconds()

                logger.info(f"⏰ 下次容器更新检测时间: {next_run.strftime('%Y-%m-%d %H:%M:%S')} (等待 {int(wait_seconds)}秒)")

                # 等待到下次执行时间
                await asyncio.sleep(wait_seconds)

                if not self.notify_on_update:
                    continue

                # 收集所有实例的可更新容器
                all_updates = {}  # {instance_name: [containers]}

                # 检查所有实例的所有容器
                for instance_name, client in self.docker_clients.items():
                    try:
                        containers = client.get_containers()

                        # 收集所有有更新且不在黑名单中的容器
                        updatable_containers = []
                        for container in containers:
                            if container.has_update:
                                # 检查是否在黑名单中(不区分实例)
                                if not self._is_update_blacklisted(container):
                                    updatable_containers.append(container)
                                else:
                                    logger.debug(f"容器 [{instance_name}:{container.name}] 在黑名单中,跳过更新提醒")

                        # 如果有可更新容器,添加到汇总列表
                        if updatable_containers:
                            all_updates[instance_name] = updatable_containers

                    except Exception as e:
                        logger.warning(f"检查实例 [{instance_name}] 容器更新时出错: {e}")

                # 如果有任何新的可更新容器,发送统一通知
                if all_updates:
                    await self._notify_container_updates(all_updates)

            except Exception as e:
                logger.error(f"容器更新检测循环出错: {e}")

    async def _notify_container_updates(self, all_updates: Dict[str, List[Any]]):
        """发送容器更新通知(合并所有实例)"""
        if not self.notify_chat_ids or not all_updates:
            return

        # 计算总数
        total_count = sum(len(containers) for containers in all_updates.values())

        # 构建通知消息
        message = f"🔔 <b>容器更新提醒</b>\n\n"
        message += f"📦 <b>发现 {total_count} 个容器有新版本可用</b>\n\n"

        # 按实例分组显示
        for instance_name, containers in all_updates.items():
            message += f"🖥 <b>实例: {instance_name}</b> ({len(containers)}个)\n"

            for container in containers:
                message += f"  • <b>{container.name}</b>\n"
                message += f"    🖼 镜像: <code>{container.image}</code>\n"
                message += f"    📊 状态: {container.status}\n"
                message += f"    🆔 ID: <code>{container.id[:12]}</code>\n"

            message += "\n"

        message += "💡 使用 /updates 命令查看详情并更新"

        # 创建内联键盘(一键更新所有实例按钮)
        markup = InlineKeyboardMarkup()
        markup.row(
            InlineKeyboardButton("🚀 一键更新所有", callback_data="update_all_instances")
        )

        # 发送给所有配置的通知chat_ids
        for chat_id in self.notify_chat_ids:
            try:
                await self.bot.send_message(chat_id, message, parse_mode='HTML', reply_markup=markup)
                logger.info(f"✅ 更新通知已发送到: {chat_id} (共 {total_count} 个容器)")
            except Exception as e:
                logger.error(f"❌ 发送更新通知失败 [{chat_id}]: {e}")

    async def _clean_images_loop(self):
        """镜像自动清理循环(定时清理未使用和无tag镜像)"""
        try:
            # 验证cron表达式
            cron = croniter(self.clean_images_cron, datetime.now())
            logger.info(f"🔄 镜像自动清理已启动(cron: {self.clean_images_cron})")
        except Exception as e:
            logger.error(f"❌ 无效的cron表达式 '{self.clean_images_cron}': {e}")
            return

        while True:
            try:
                # 计算下次执行时间
                now = datetime.now()
                cron = croniter(self.clean_images_cron, now)
                next_run = cron.get_next(datetime)
                wait_seconds = (next_run - now).total_seconds()

                logger.info(f"⏰ 下次镜像清理时间: {next_run.strftime('%Y-%m-%d %H:%M:%S')} (等待 {int(wait_seconds)}秒)")

                # 等待到下次执行时间
                await asyncio.sleep(wait_seconds)

                logger.info("🧹 开始执行镜像自动清理...")

                # 统计所有实例的清理结果
                all_results = {}  # {instance_name: {'total': x, 'success': y, 'failed': z}}

                # 清理所有实例的镜像
                for instance_name, client in self.docker_clients.items():
                    try:
                        logger.info(f"🧹 [{instance_name}] 开始清理镜像...")
                        images = client.get_images()

                        # 筛选需要清理的镜像(未使用 + 无tag)
                        to_clean = []
                        for img in images:
                            in_used = img.get('inUsed', False)
                            tag = img.get('tag', 'None')

                            # 未使用的镜像或无tag的镜像
                            if not in_used or tag == 'None' or tag == '<none>':
                                to_clean.append(img)

                        if not to_clean:
                            logger.info(f"✅ [{instance_name}] 没有需要清理的镜像")
                            continue

                        logger.info(f"🗑 [{instance_name}] 找到 {len(to_clean)} 个需要清理的镜像")

                        # 执行清理
                        success_count = 0
                        failed_count = 0
                        cleaned_images = []  # 成功清理的镜像列表
                        failed_images = []   # 清理失败的镜像列表

                        for img in to_clean:
                            try:
                                image_id = img.get('id', '')
                                name = img.get('name', '<none>')
                                tag = img.get('tag', 'None')
                                in_used = img.get('inUsed', False)

                                # 构建显示名称
                                if tag == 'None' or tag == '<none>' or not tag:
                                    display_name = name
                                else:
                                    display_name = f"{name}:{tag}"

                                # 强制删除(force=True)
                                result = client.delete_image(image_id, force=True)

                                if result.get('code') == 200:
                                    success_count += 1
                                    cleaned_images.append(display_name)
                                    logger.debug(f"  ✅ 删除成功: {display_name}")
                                else:
                                    failed_count += 1
                                    error_msg = result.get('msg', '未知错误')
                                    failed_images.append(f"{display_name}: {error_msg}")
                                    logger.warning(f"  ❌ 删除失败: {display_name} - {error_msg}")

                                # 避免API压力过大
                                await asyncio.sleep(0.5)

                            except Exception as e:
                                failed_count += 1
                                display_name = f"{name}:{tag}" if tag and tag not in ['None', '<none>'] else name
                                failed_images.append(f"{display_name}: {str(e)}")
                                logger.warning(f"  ❌ 删除镜像异常: {e}")

                        # 记录结果
                        all_results[instance_name] = {
                            'total': len(to_clean),
                            'success': success_count,
                            'failed': failed_count,
                            'cleaned': cleaned_images,
                            'failed_list': failed_images
                        }

                        logger.info(f"✅ [{instance_name}] 清理完成: 成功 {success_count}/{len(to_clean)},失败 {failed_count}")

                    except Exception as e:
                        logger.error(f"❌ [{instance_name}] 镜像清理出错: {e}")

                # 发送清理通知(启用自动清理时自动发送通知)
                if all_results and self.auto_clean_images:
                    await self._notify_image_cleanup(all_results)

            except Exception as e:
                logger.error(f"镜像清理循环出错: {e}")

    async def _notify_image_cleanup(self, all_results: Dict[str, Dict[str, Any]]):
        """发送镜像清理通知(合并所有实例)"""
        if not self.notify_chat_ids or not all_results:
            return

        # 计算总数
        total_cleaned = sum(r['success'] for r in all_results.values())
        total_failed = sum(r['failed'] for r in all_results.values())

        # 只有实际清理了镜像才发送通知
        if total_cleaned == 0 and total_failed == 0:
            return

        # 构建通知消息
        message = f"🧹 <b>镜像自动清理报告</b>\n\n"
        message += f"📊 总计: 成功清理 <b>{total_cleaned}</b> 个镜像"

        if total_failed > 0:
            message += f",失败 <b>{total_failed}</b> 个"

        message += "\n\n"

        # 按实例分组显示
        for instance_name, result in all_results.items():
            if result['total'] > 0:
                message += f"🖥 <b>{instance_name}</b>\n"
                message += f"  • 清理: {result['success']}/{result['total']} 个\n"

                # 显示成功清理的镜像列表
                if result.get('cleaned'):
                    message += f"\n  <b>✅ 已清理的镜像:</b>\n"
                    for img_name in result['cleaned']:
                        message += f"    · <code>{img_name}</code>\n"

                # 显示失败的镜像列表
                if result['failed'] > 0 and result.get('failed_list'):
                    message += f"\n  <b>❌ 失败的镜像:</b>\n"
                    for failed_info in result['failed_list'][:3]:  # 最多显示3个失败的
                        message += f"    · {failed_info}\n"

                    if len(result['failed_list']) > 3:
                        message += f"    · ... 还有 {len(result['failed_list']) - 3} 个失败\n"

                message += "\n"

        message += "💡 使用 /images 命令查看当前镜像"

        # 发送给所有配置的通知chat_ids
        for chat_id in self.notify_chat_ids:
            try:
                await self.bot.send_message(chat_id, message, parse_mode='HTML')
                logger.info(f"✅ 镜像清理通知已发送到: {chat_id}")
            except Exception as e:
                logger.error(f"❌ 发送镜像清理通知失败 [{chat_id}]: {e}")


    def _normalize_image_name(self, value: str) -> str:
        value = (value or '').strip().lower()
        for prefix in ('http://', 'https://'):
            if value.startswith(prefix):
                value = value[len(prefix):]
        for prefix in ('registry-1.docker.io/', 'docker.io/', 'library/'):
            if value.startswith(prefix):
                value = value[len(prefix):]
        return value

    def _canonical_image_name(self, value: str) -> str:
        value = self._normalize_image_name(value)
        if not value:
            return ''
        slash = value.rfind('/')
        colon = value.rfind(':')
        if colon <= slash and '@' not in value:
            value = f'{value}:latest'
        return value

    def _blacklist_candidates(self, container) -> list:
        candidates = []
        for value in (getattr(container, 'image', ''), getattr(container, 'name', '')):
            candidate = self._canonical_image_name(value) or self._normalize_image_name(value)
            if candidate and candidate not in candidates:
                candidates.append(candidate)
        return candidates

    def _is_update_blacklisted(self, container) -> bool:
        candidates = self._blacklist_candidates(container)
        for item in self.update_blacklist:
            normalized = self._canonical_image_name(item) or self._normalize_image_name(item)
            if normalized and any(candidate == normalized or candidate.startswith(f'{normalized}:') or normalized.startswith(f'{candidate}:') for candidate in candidates):
                return True
        return False

    async def _auto_update_containers_loop(self):
        """容器自动更新循环(定时更新可更新的容器)"""
        try:
            # 验证cron表达式
            cron = croniter(self.update_containers_cron, datetime.now())
            logger.info(f"🔄 容器自动更新已启动(cron: {self.update_containers_cron})")
        except Exception as e:
            logger.error(f"❌ 无效的cron表达式 '{self.update_containers_cron}': {e}")
            return

        while True:
            try:
                # 计算下次执行时间
                now = datetime.now()
                cron = croniter(self.update_containers_cron, now)
                next_run = cron.get_next(datetime)
                wait_seconds = (next_run - now).total_seconds()

                logger.info(f"⏰ 下次容器自动更新时间: {next_run.strftime('%Y-%m-%d %H:%M:%S')} (等待 {int(wait_seconds)}秒)")

                # 等待到下次执行时间
                await asyncio.sleep(wait_seconds)

                logger.info("⚡ 开始执行容器自动更新...")

                # 统计所有实例的更新结果
                all_results = {}  # {instance_name: {'total': x, 'success': y, 'failed': z, 'updated': [], 'failed_list': []}}

                # 更新所有实例的容器
                for instance_name, client in self.docker_clients.items():
                    try:
                        logger.info(f"⚡ [{instance_name}] 开始检查可更新容器...")
                        containers = client.get_containers()

                        # 筛选可更新且不在黑名单中的容器
                        to_update = []
                        for container in containers:
                            # 检查是否有更新
                            if not container.has_update:
                                continue

                            # 检查是否在黑名单中(不区分实例)
                            if self._is_update_blacklisted(container):
                                logger.info(f"  ⏭ 跳过黑名单容器/镜像: {container.name} ({container.image})")
                                continue

                            to_update.append(container)

                        if not to_update:
                            logger.info(f"✅ [{instance_name}] 没有需要更新的容器")
                            continue

                        logger.info(f"⚡ [{instance_name}] 找到 {len(to_update)} 个需要更新的容器")

                        # 执行更新
                        success_count = 0
                        failed_count = 0
                        updated_containers = []  # 成功更新的容器列表
                        failed_containers = []   # 更新失败的容器列表

                        for container in to_update:
                            try:
                                logger.info(f"  🔄 正在更新: {container.name}")

                                # 执行更新
                                result = client.update_container(
                                    container.id,
                                    container.image,
                                    container.name
                                )

                                if result.get('code') == 200:
                                    success_count += 1
                                    updated_containers.append(f"{container.name} ({container.image})")
                                    logger.info(f"  ✅ 更新成功: {container.name}")
                                else:
                                    failed_count += 1
                                    error_msg = result.get('msg', '未知错误')
                                    failed_containers.append(f"{container.name}: {error_msg}")
                                    logger.warning(f"  ❌ 更新失败: {container.name} - {error_msg}")

                                # 避免API压力过大,等待2秒
                                await asyncio.sleep(2)

                            except Exception as e:
                                failed_count += 1
                                failed_containers.append(f"{container.name}: {str(e)}")
                                logger.warning(f"  ❌ 更新容器异常: {e}")

                        # 记录结果
                        all_results[instance_name] = {
                            'total': len(to_update),
                            'success': success_count,
                            'failed': failed_count,
                            'updated': updated_containers,
                            'failed_list': failed_containers
                        }

                        logger.info(f"✅ [{instance_name}] 更新完成: 成功 {success_count}/{len(to_update)},失败 {failed_count}")

                    except Exception as e:
                        logger.error(f"❌ [{instance_name}] 容器自动更新出错: {e}")

                # 发送更新通知(启用自动更新时自动发送通知)
                if all_results and self.auto_update_containers:
                    await self._notify_auto_update(all_results)

            except Exception as e:
                logger.error(f"容器自动更新循环出错: {e}")

    async def _notify_auto_update(self, all_results: Dict[str, Dict[str, Any]]):
        """发送容器自动更新通知(合并所有实例)"""
        if not self.notify_chat_ids or not all_results:
            return

        # 计算总数
        total_updated = sum(r['success'] for r in all_results.values())
        total_failed = sum(r['failed'] for r in all_results.values())

        # 只有实际更新了容器才发送通知
        if total_updated == 0 and total_failed == 0:
            return

        # 构建通知消息
        message = f"⚡ <b>容器自动更新报告</b>\n\n"
        message += f"📊 总计: 成功更新 <b>{total_updated}</b> 个容器"

        if total_failed > 0:
            message += f",失败 <b>{total_failed}</b> 个"

        message += "\n\n"

        # 按实例分组显示
        for instance_name, result in all_results.items():
            if result['total'] > 0:
                message += f"🖥 <b>{instance_name}</b>\n"
                message += f"  • 更新: {result['success']}/{result['total']} 个\n"

                # 显示成功更新的容器列表
                if result.get('updated'):
                    message += f"\n  <b>✅ 已更新的容器:</b>\n"
                    for container_info in result['updated']:
                        message += f"    · <code>{container_info}</code>\n"

                # 显示失败的容器列表
                if result['failed'] > 0 and result.get('failed_list'):
                    message += f"\n  <b>❌ 失败的容器:</b>\n"
                    for failed_info in result['failed_list'][:3]:  # 最多显示3个失败的
                        message += f"    · {failed_info}\n"

                    if len(result['failed_list']) > 3:
                        message += f"    · ... 还有 {len(result['failed_list']) - 3} 个失败\n"

                message += "\n"

        message += "💡 使用 /containers 命令查看容器状态"

        # 发送给所有配置的通知chat_ids
        for chat_id in self.notify_chat_ids:
            try:
                await self.bot.send_message(chat_id, message, parse_mode='HTML')
                logger.info(f"✅ 容器自动更新通知已发送到: {chat_id}")
            except Exception as e:
                logger.error(f"❌ 发送容器自动更新通知失败 [{chat_id}]: {e}")

    def _sync_runtime_config_on_first_run(self):
        """首次运行时,将当前配置同步到config.json"""
        try:
            # 检查config.json是否是刚创建的(created_at在最近10秒内)
            config_data = self.runtime_config.get_all()
            created_at_str = config_data.get('created_at', '')

            if created_at_str:
                from datetime import datetime
                created_at = datetime.fromisoformat(created_at_str)
                now = datetime.now()
                time_diff = (now - created_at).total_seconds()

                # 如果是最近10秒内创建的,说明是首次运行
                if time_diff < 10:
                    logger.info("🔄 检测到首次运行,正在同步当前配置到 config.json...")

                    # 获取 DockerCopilot 实例配置
                    from src.config import load_config
                    current_config = load_config()

                    # 构建完整的配置更新
                    updates = {}

                    # 同步 DockerCopilot 配置
                    updates['dockercopilot.default_instance'] = current_config.dockercopilot.default_instance
                    updates['dockercopilot.instances'] = [
                        {
                            'name': inst.name,
                            'api_url': inst.api_url,
                            'secret_key': inst.secret_key,
                            'timeout': inst.timeout
                        }
                        for inst in current_config.dockercopilot.instances
                    ]

                    # 同步 Telegram 配置
                    updates['telegram.bot_token'] = current_config.telegram.bot_token
                    updates['telegram.chat_ids'] = current_config.telegram.chat_ids
                    updates['telegram.polling_interval'] = current_config.telegram.polling_interval
                    updates['telegram.update_check_cron'] = self.update_check_cron
                    updates['telegram.notify_on_update'] = self.notify_on_update
                    updates['telegram.update_blacklist'] = self.update_blacklist
                    updates['telegram.auto_clean_images'] = self.auto_clean_images
                    updates['telegram.clean_images_cron'] = self.clean_images_cron
                    updates['telegram.auto_update_containers'] = self.auto_update_containers
                    updates['telegram.update_containers_cron'] = self.update_containers_cron

                    # 使用当前实例的配置更新config.json
                    import asyncio
                    asyncio.run(self.runtime_config.update(updates, 'system'))

                    logger.info("✅ 当前配置已同步到 config.json")
                    logger.info("💡 下次启动将直接使用 config.json 中的配置")
        except Exception as e:
            logger.warning(f"⚠️ 同步配置失败: {e}")

    async def send_settings_menu(self, chat_id: str, message_id: Optional[int] = None):
        """显示配置管理菜单"""
        try:
            from croniter import croniter

            # 构建配置信息
            message = "⚙️ <b>定时任务配置</b>\n\n"

            # 1. 容器更新检测
            message += "🔄 <b>容器更新检测</b>\n"
            message += f"  • 时间: <code>{self.update_check_cron}</code>\n"

            try:
                cron = croniter(self.update_check_cron, datetime.now())
                next_run = cron.get_next(datetime)
                message += f"  • 下次执行: {next_run.strftime('%m-%d %H:%M')}\n"
            except:
                pass

            message += f"  • 通知: {'✅ 开启' if self.notify_on_update else '❌ 关闭'}\n\n"

            # 2. 镜像自动清理
            message += "🧹 <b>镜像自动清理</b>\n"
            message += f"  • 时间: <code>{self.clean_images_cron}</code>\n"

            try:
                cron = croniter(self.clean_images_cron, datetime.now())
                next_run = cron.get_next(datetime)
                message += f"  • 下次执行: {next_run.strftime('%m-%d %H:%M')}\n"
            except:
                pass

            message += f"  • 状态: {'✅ 已启用' if self.auto_clean_images else '❌ 未启用'}\n\n"

            # 3. 容器自动更新
            message += "⚡ <b>容器自动更新</b>\n"
            message += f"  • 时间: <code>{self.update_containers_cron}</code>\n"

            try:
                cron = croniter(self.update_containers_cron, datetime.now())
                next_run = cron.get_next(datetime)
                message += f"  • 下次执行: {next_run.strftime('%m-%d %H:%M')}\n"
            except:
                pass

            message += f"  • 状态: {'✅ 已启用' if self.auto_update_containers else '❌ 未启用'}\n\n"

            # 4. 更新黑名单
            message += "📋 <b>更新黑名单</b>\n"
            if self.update_blacklist:
                blacklist_str = ', '.join(self.update_blacklist[:5])
                if len(self.update_blacklist) > 5:
                    blacklist_str += f" ... (共{len(self.update_blacklist)}个)"
                message += f"  • 当前: <code>{blacklist_str}</code>\n"
            else:
                message += f"  • 当前: <i>无</i>\n"
            message += "\n"

            message += "💡 点击下方按钮进行配置"

            # 构建按钮
            markup = InlineKeyboardMarkup()

            # 第一行:容器更新检测
            markup.row(
                InlineKeyboardButton("📝 编辑检测时间", callback_data="settings_edit_cron:update_check"),
                InlineKeyboardButton(
                    f"{'🔕' if self.notify_on_update else '🔔'} 通知",
                    callback_data="settings_toggle:notify_on_update"
                )
            )

            # 第二行:镜像清理
            markup.row(
                InlineKeyboardButton("📝 编辑清理时间", callback_data="settings_edit_cron:clean_images"),
                InlineKeyboardButton(
                    f"{'⏸️' if self.auto_clean_images else '▶️'} 自动清理",
                    callback_data="settings_toggle:auto_clean_images"
                )
            )

            # 第三行:容器自动更新
            markup.row(
                InlineKeyboardButton("📝 编辑更新时间", callback_data="settings_edit_cron:auto_update"),
                InlineKeyboardButton(
                    f"{'⏸️' if self.auto_update_containers else '▶️'} 自动更新",
                    callback_data="settings_toggle:auto_update_containers"
                )
            )

            # 第四行:黑名单
            markup.row(
                InlineKeyboardButton("📋 编辑黑名单", callback_data="settings_edit_blacklist")
            )

            # 第五行:操作按钮
            markup.row(
                InlineKeyboardButton("🔄 重新加载", callback_data="settings_reload"),
                InlineKeyboardButton("❌ 关闭", callback_data="cancel")
            )

            if message_id:
                try:
                    await self.bot.edit_message_text(
                        message,
                        chat_id,
                        message_id,
                        reply_markup=markup,
                        parse_mode='HTML'
                    )
                except Exception as edit_error:
                    # 如果编辑失败(如 message is not modified),删除旧消息并发送新消息
                    error_str = str(edit_error).lower()
                    if "message is not modified" in error_str or "message not modified" in error_str or "not modified" in error_str:
                        try:
                            await self.bot.delete_message(chat_id, message_id)
                        except:
                            pass
                        await self.bot.send_message(
                            chat_id,
                            message,
                            reply_markup=markup,
                            parse_mode='HTML'
                        )
                    else:
                        raise
            else:
                await self.bot.send_message(
                    chat_id,
                    message,
                    reply_markup=markup,
                    parse_mode='HTML'
                )

        except Exception as e:
            logger.error(f"显示配置菜单失败: {e}")
            await self.bot.send_message(chat_id, f"❌ 显示配置菜单失败: {e}")

    async def start_edit_cron(self, chat_id: str, message_id: int, config_type: str):
        """开始编辑cron表达式"""
        try:
            # 获取当前值
            current_cron = ""
            field_name = ""

            if config_type == "update_check":
                current_cron = self.update_check_cron
                field_name = "容器更新检测"
            elif config_type == "clean_images":
                current_cron = self.clean_images_cron
                field_name = "镜像自动清理"
            elif config_type == "auto_update":
                current_cron = self.update_containers_cron
                field_name = "容器自动更新"

            # 构建说明消息
            message = f"✏️ <b>编辑{field_name}时间</b>\n\n"
            message += f"📅 当前值: <code>{current_cron}</code>\n\n"
            message += "<b>Cron格式说明:</b>\n"
            message += "<code>分 时 日 月 星期</code>\n\n"
            message += "<b>常用示例:</b>\n"
            message += "• <code>*/5 * * * *</code>  - 每5分钟\n"
            message += "• <code>*/10 * * * *</code> - 每10分钟\n"
            message += "• <code>0 * * * *</code>    - 每小时整点\n"
            message += "• <code>0 2 * * *</code>    - 每天凌晨2点\n"
            message += "• <code>0 0 * * 0</code>    - 每周日凌晨\n"
            message += "• <code>0 0 1 * *</code>    - 每月1日凌晨\n\n"
            message += "请输入新的cron表达式:\n"
            message += "<i>(输入 /cancel 取消)</i>"

            # 保存用户状态
            self.user_states[chat_id] = {
                'action': 'edit_cron',
                'config_type': config_type,
                'message_id': message_id
            }

            # 构建取消按钮
            markup = InlineKeyboardMarkup()
            markup.row(InlineKeyboardButton("❌ 取消", callback_data="settings_menu"))

            await self.bot.edit_message_text(
                message,
                chat_id,
                message_id,
                reply_markup=markup,
                parse_mode='HTML'
            )

        except Exception as e:
            logger.error(f"开始编辑cron失败: {e}")
            await self.bot.send_message(chat_id, f"❌ 操作失败: {e}")

    async def process_cron_input(self, message: Message):
        """处理用户输入的cron表达式"""
        chat_id = str(message.chat.id)
        cron_input = message.text.strip()

        try:
            # 删除用户输入的消息
            try:
                await self.bot.delete_message(chat_id, message.message_id)
            except:
                pass

            # 检查是否取消
            if cron_input == '/cancel':
                del self.user_states[chat_id]
                await self.send_settings_menu(chat_id)
                return

            # 验证cron表达式
            from croniter import croniter
            try:
                croniter(cron_input, datetime.now())
            except Exception as e:
                await self.bot.send_message(
                    chat_id,
                    f"❌ 无效的cron表达式: {e}\n\n请重新输入或使用 /cancel 取消"
                )
                return

            # 获取用户状态
            state = self.user_states.get(chat_id, {})
            config_type = state.get('config_type')

            if not config_type:
                await self.bot.send_message(chat_id, "❌ 状态丢失,请重新操作")
                return

            # 保存配置到config.json
            config_key = ""
            if config_type == "update_check":
                config_key = "telegram.update_check_cron"
            elif config_type == "clean_images":
                config_key = "telegram.clean_images_cron"
            elif config_type == "auto_update":
                config_key = "telegram.update_containers_cron"

            # 更新配置文件
            success = await self.runtime_config.update({config_key: cron_input}, chat_id)

            if not success:
                await self.bot.send_message(chat_id, "❌ 保存配置失败")
                del self.user_states[chat_id]
                return

            # 重启对应的后台任务
            restart_success = False
            if config_type == "update_check":
                restart_success = await self.restart_update_check_task(cron_input)
            elif config_type == "clean_images":
                restart_success = await self.restart_clean_images_task(new_cron=cron_input)
            elif config_type == "auto_update":
                restart_success = await self.restart_auto_update_task(new_cron=cron_input)

            if restart_success:
                # 计算下次执行时间
                next_run = croniter(cron_input, datetime.now()).get_next(datetime)

                await self.bot.send_message(
                    chat_id,
                    f"✅ 配置已更新\n\n"
                    f"• 新值: <code>{cron_input}</code>\n"
                    f"• 已保存到 config.json\n"
                    f"• 后台任务已重启\n"
                    f"• 下次执行: {next_run.strftime('%Y-%m-%d %H:%M:%S')}",
                    parse_mode='HTML'
                )
            else:
                await self.bot.send_message(
                    chat_id,
                    f"⚠️ 配置已保存,但重启任务失败\n请查看日志或重启容器"
                )

            # 清除用户状态
            del self.user_states[chat_id]

            # 返回配置菜单
            await self.send_settings_menu(chat_id)

        except Exception as e:
            logger.error(f"处理cron输入失败: {e}")
            await self.bot.send_message(chat_id, f"❌ 处理失败: {e}")
            if chat_id in self.user_states:
                del self.user_states[chat_id]

    async def toggle_setting(self, chat_id: str, message_id: int, setting_name: str):
        """切换开关配置"""
        try:
            # 获取当前值并切换
            new_value = False
            config_key = f"telegram.{setting_name}"
            restart_needed = False

            if setting_name == "notify_on_update":
                new_value = not self.notify_on_update
                self.notify_on_update = new_value
                # 如果启用了通知,重启更新检测任务
                if new_value:
                    await self.restart_update_check_task(self.update_check_cron)
                else:
                    # 如果禁用,停止任务
                    if self.update_check_task:
                        self.update_check_task.cancel()
            elif setting_name == "auto_clean_images":
                new_value = not self.auto_clean_images
                await self.restart_clean_images_task(enabled=new_value)
                restart_needed = True
            elif setting_name == "auto_update_containers":
                new_value = not self.auto_update_containers
                await self.restart_auto_update_task(enabled=new_value)
                restart_needed = True

            # 保存到配置文件
            await self.runtime_config.update({config_key: new_value}, chat_id)

            # 刷新配置菜单
            await self.send_settings_menu(chat_id, message_id)

        except Exception as e:
            logger.error(f"切换配置失败: {e}")
            await self.bot.send_message(chat_id, f"❌ 切换失败: {e}")

    async def start_edit_blacklist(self, chat_id: str, message_id: int):
        """开始编辑黑名单"""
        try:
            # 构建说明消息
            current_blacklist = ', '.join(self.update_blacklist) if self.update_blacklist else '(空)'

            message = "📋 <b>编辑更新黑名单</b>\n\n"
            message += f"当前黑名单: <code>{current_blacklist}</code>\n\n"
            message += "<b>说明:</b>\n"
            message += "• 黑名单中的容器不会发送更新提醒\n"
            message += "• 也不会被自动更新\n"
            message += "• 容器名称,多个用逗号分隔\n"
            message += "• 输入空格清空黑名单\n\n"
            message += "<b>示例:</b>\n"
            message += "<code>postgresql,redis,nginx</code>\n\n"
            message += "请输入新的黑名单:\n"
            message += "<i>(输入 /cancel 取消)</i>"

            # 保存用户状态
            self.user_states[chat_id] = {
                'action': 'edit_blacklist',
                'message_id': message_id
            }

            # 构建取消按钮
            markup = InlineKeyboardMarkup()
            markup.row(InlineKeyboardButton("❌ 取消", callback_data="settings_menu"))

            await self.bot.edit_message_text(
                message,
                chat_id,
                message_id,
                reply_markup=markup,
                parse_mode='HTML'
            )

        except Exception as e:
            logger.error(f"开始编辑黑名单失败: {e}")
            await self.bot.send_message(chat_id, f"❌ 操作失败: {e}")

    async def process_blacklist_input(self, message: Message):
        """处理用户输入的黑名单"""
        chat_id = str(message.chat.id)
        blacklist_input = message.text.strip()

        try:
            # 删除用户输入的消息
            try:
                await self.bot.delete_message(chat_id, message.message_id)
            except:
                pass

            # 检查是否取消
            if blacklist_input == '/cancel':
                del self.user_states[chat_id]
                await self.send_settings_menu(chat_id)
                return

            # 解析黑名单
            if blacklist_input in ('', ' '):
                new_blacklist = []
            else:
                new_blacklist = [name.strip() for name in blacklist_input.split(',') if name.strip()]

            # 保存配置
            success = await self.runtime_config.update({
                'telegram.update_blacklist': new_blacklist
            }, chat_id)

            if not success:
                await self.bot.send_message(chat_id, "❌ 保存配置失败")
                del self.user_states[chat_id]
                return

            # 更新内存中的配置
            self.update_blacklist = new_blacklist

            blacklist_str = ', '.join(new_blacklist) if new_blacklist else '(空)'
            await self.bot.send_message(
                chat_id,
                f"✅ 黑名单已更新\n\n"
                f"• 新值: <code>{blacklist_str}</code>\n"
                f"• 已保存到 config.json\n"
                f"• 立即生效",
                parse_mode='HTML'
            )

            # 清除用户状态
            del self.user_states[chat_id]

            # 返回配置菜单
            await self.send_settings_menu(chat_id)

        except Exception as e:
            logger.error(f"处理黑名单输入失败: {e}")
            await self.bot.send_message(chat_id, f"❌ 处理失败: {e}")
            if chat_id in self.user_states:
                del self.user_states[chat_id]

    async def reload_settings(self, chat_id: str, message_id: int):
        """重新加载配置"""
        try:
            # 重新加载配置文件
            success = await self.runtime_config.reload()

            if success:
                # 从配置文件加载新值
                telegram_config = self.runtime_config.get_telegram_config()

                # 更新配置(需要重启任务)
                self.update_check_cron = telegram_config.get('update_check_cron', self.update_check_cron)
                self.notify_on_update = telegram_config.get('notify_on_update', self.notify_on_update)
                self.update_blacklist = telegram_config.get('update_blacklist', self.update_blacklist)
                self.auto_clean_images = telegram_config.get('auto_clean_images', self.auto_clean_images)
                self.clean_images_cron = telegram_config.get('clean_images_cron', self.clean_images_cron)
                self.auto_update_containers = telegram_config.get('auto_update_containers', self.auto_update_containers)
                self.update_containers_cron = telegram_config.get('update_containers_cron', self.update_containers_cron)

                # 重启所有后台任务
                await self.restart_update_check_task(self.update_check_cron)
                await self.restart_clean_images_task()
                await self.restart_auto_update_task()

                # 删除旧的配置菜单
                try:
                    await self.bot.delete_message(chat_id, message_id)
                except:
                    pass

                # 发送新的配置菜单
                await self.send_settings_menu(chat_id)

                # 发送成功提示
                await self.bot.send_message(
                    chat_id,
                    "✅ 配置已重新加载,所有任务已重启",
                    parse_mode='HTML'
                )
            else:
                # 发送失败提示
                await self.bot.send_message(
                    chat_id,
                    "❌ 重新加载配置失败",
                    parse_mode='HTML'
                )

        except Exception as e:
            logger.error(f"重新加载配置失败: {e}")
            # 发送错误提示
            await self.bot.send_message(
                chat_id,
                f"❌ 重新加载失败: {e}",
                parse_mode='HTML'
            )

    def start_polling(self):
        """启动轮询模式(使用asyncio)"""
        logger.info("🤖 Telegram Bot 启动轮询模式(使用 pyTelegramBotAPI)...")
        logger.info("📡 内置长轮询,自动处理409冲突")

        async def run_bot():
            await self._discard_backlog_once()

            # 启动容器更新检测后台任务
            if self.notify_on_update and self.notify_chat_ids:
                self.update_check_task = asyncio.create_task(self._check_container_updates_loop())
                logger.info("✅ 容器更新检测后台任务已启动")

            # 启动镜像清理后台任务
            if self.auto_clean_images:
                self.clean_images_task = asyncio.create_task(self._clean_images_loop())
                logger.info(f"✅ 镜像自动清理后台任务已启动(cron: {self.clean_images_cron})")

            # 启动容器自动更新后台任务
            if self.auto_update_containers:
                self.auto_update_task = asyncio.create_task(self._auto_update_containers_loop())
                logger.info(f"✅ 容器自动更新后台任务已启动(cron: {self.update_containers_cron})")

            # 运行异步轮询
            await self.bot.polling(non_stop=True, interval=0, timeout=60)

        # 运行异步轮询
        asyncio.run(run_bot())
