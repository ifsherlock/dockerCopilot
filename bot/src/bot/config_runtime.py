"""运行时配置管理模块

此模块负责管理动态配置文件（config.json），允许通过Bot实时修改配置而无需重启容器。

配置优先级:
  环境变量 > config.json

功能:
  - 读取/写入 config.json
  - 配置更新（带文件锁）
  - 配置验证
  - 配置回滚
"""

import json
import os
from typing import Dict, Any, Optional
from datetime import datetime
import asyncio
import logging

logger = logging.getLogger(__name__)


class RuntimeConfigManager:
    """运行时配置管理器"""

    def __init__(self, config_path: str = None):
        """
        初始化配置管理器

        Args:
            config_path: JSON配置文件路径，默认 /app/config/config.json
        """
        if config_path is None:
            # 查找配置文件（优先Docker路径）
            possible_paths = [
                "/app/config/config.json",        # Docker 容器（新路径）
                os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "app", "config", "config.json"),  # 本地开发
                "app/config/config.json",         # 当前目录下的 app/config
                "config.json",                    # 兼容旧版
            ]

            # 使用第一个存在的路径，或者默认路径
            config_path = None
            for path in possible_paths:
                if os.path.exists(path):
                    config_path = path
                    break

            # 如果都不存在，使用默认路径（会自动创建）
            if config_path is None:
                config_path = possible_paths[0] if os.path.exists("/app/config") else possible_paths[2]

        self.config_path = config_path
        self._lock = asyncio.Lock()  # 文件锁，防止并发写入
        self._config = self._load_or_create()

    def _load_or_create(self) -> Dict[str, Any]:
        """加载配置文件，如果不存在则创建默认配置"""
        if os.path.exists(self.config_path):
            try:
                with open(self.config_path, 'r', encoding='utf-8') as f:
                    config = json.load(f)
                logger.info(f"✅ 已加载运行时配置: {self.config_path}")
                return config
            except Exception as e:
                logger.error(f"⚠️ 读取运行时配置失败: {e}，使用默认配置")
                return self._get_default_config()
        else:
            # 创建默认配置
            config = self._get_default_config()
            self._save(config)
            logger.info(f"✅ 已创建运行时配置文件: {self.config_path}")
            return config

    def _get_default_config(self) -> Dict[str, Any]:
        """获取默认配置"""
        return {
            "version": "1.0",
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
            "dockercopilot": {
                "default_instance": "server1",
                "instances": [
                    {
                        "name": "server1",
                        "api_url": "http://192.168.1.100:12712",
                        "secret_key": "your_secret_key_here",
                        "timeout": 30
                    }
                ]
            },
            "telegram": {
                "bot_token": "",
                "chat_ids": [],
                "polling_interval": 1,
                "update_check_cron": "*/10 * * * *",
                "notify_on_update": True,
                "update_blacklist": [],
                "auto_clean_images": False,
                "clean_images_cron": "0 2 * * *",
                "auto_update_containers": False,
                "update_containers_cron": "0 3 * * 0",
                "proxy": {
                    "type": "none",
                    "host": "",
                    "port": 0,
                    "username": "",
                    "password": ""
                }
            }
        }

    def _save(self, config: Dict[str, Any]) -> bool:
        """保存配置到文件"""
        try:
            # 确保目录存在
            config_dir = os.path.dirname(self.config_path)
            if config_dir:
                os.makedirs(config_dir, exist_ok=True)

            # 写入文件
            with open(self.config_path, 'w', encoding='utf-8') as f:
                json.dump(config, f, indent=2, ensure_ascii=False)

            logger.info(f"✅ 配置已保存到: {self.config_path}")
            return True
        except Exception as e:
            logger.error(f"❌ 保存运行时配置失败: {e}")
            return False

    async def update(self, updates: Dict[str, Any], user_id: str = None) -> bool:
        """
        更新配置

        Args:
            updates: 要更新的配置字典，例如 {'telegram.update_check_cron': '*/5 * * * *'}
            user_id: 操作用户ID

        Returns:
            是否成功
        """
        async with self._lock:
            try:
                # 更新配置
                for key, value in updates.items():
                    keys = key.split('.')
                    current = self._config

                    # 导航到最后一层
                    for k in keys[:-1]:
                        if k not in current:
                            current[k] = {}
                        current = current[k]

                    # 设置值
                    current[keys[-1]] = value
                    logger.info(f"📝 配置更新: {key} = {value}")

                # 更新元信息
                self._config['updated_at'] = datetime.now().isoformat()
                if user_id:
                    self._config['updated_by'] = user_id

                # 保存到文件
                return self._save(self._config)
            except Exception as e:
                logger.error(f"❌ 更新配置失败: {e}")
                return False

    def get(self, key: str, default: Any = None) -> Any:
        """
        获取配置值

        Args:
            key: 配置键，支持点号分隔，例如 'telegram.update_check_cron'
            default: 默认值

        Returns:
            配置值
        """
        keys = key.split('.')
        current = self._config

        for k in keys:
            if isinstance(current, dict) and k in current:
                current = current[k]
            else:
                return default

        return current

    def get_all(self) -> Dict[str, Any]:
        """获取所有配置"""
        return self._config.copy()

    def get_telegram_config(self) -> Dict[str, Any]:
        """获取Telegram配置部分"""
        return self._config.get('telegram', {}).copy()

    async def reload(self) -> bool:
        """重新加载配置文件"""
        async with self._lock:
            try:
                self._config = self._load_or_create()
                logger.info("✅ 配置已重新加载")
                return True
            except Exception as e:
                logger.error(f"❌ 重新加载配置失败: {e}")
                return False

    def backup(self) -> bool:
        """备份当前配置"""
        try:
            backup_path = f"{self.config_path}.backup"
            with open(backup_path, 'w', encoding='utf-8') as f:
                json.dump(self._config, f, indent=2, ensure_ascii=False)
            logger.info(f"✅ 配置已备份到: {backup_path}")
            return True
        except Exception as e:
            logger.error(f"❌ 备份配置失败: {e}")
            return False

    def restore_backup(self) -> bool:
        """从备份恢复配置"""
        try:
            backup_path = f"{self.config_path}.backup"
            if not os.path.exists(backup_path):
                logger.error("❌ 备份文件不存在")
                return False

            with open(backup_path, 'r', encoding='utf-8') as f:
                self._config = json.load(f)

            self._save(self._config)
            logger.info("✅ 配置已从备份恢复")
            return True
        except Exception as e:
            logger.error(f"❌ 恢复配置失败: {e}")
            return False
