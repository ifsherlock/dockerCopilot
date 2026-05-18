"""Docker Copilot实例管理器"""
import logging
from typing import Dict, List, Any, Optional
from ..api import DockerCopilotClient

logger = logging.getLogger(__name__)


class InstanceManager:
    """管理多个Docker Copilot实例"""

    def __init__(self, docker_clients: Dict[str, DockerCopilotClient], default_instance: str):
        self.docker_clients = docker_clients
        self.current_instance = {}  # {chat_id: instance_name}
        self.default_instance = default_instance or list(docker_clients.keys())[0]

    def get_client(self, chat_id: str) -> DockerCopilotClient:
        """获取当前用户选择的Docker Copilot客户端"""
        instance_name = self.current_instance.get(chat_id, self.default_instance)
        return self.docker_clients.get(instance_name, list(self.docker_clients.values())[0])

    def get_current_instance(self, chat_id: str) -> str:
        """获取当前实例名称"""
        return self.current_instance.get(chat_id, self.default_instance)

    def set_instance(self, chat_id: str, instance_name: str) -> bool:
        """设置当前实例"""
        if instance_name in self.docker_clients:
            self.current_instance[chat_id] = instance_name
            return True
        return False

    def get_all_instances(self) -> List[str]:
        """获取所有实例名称列表"""
        return list(self.docker_clients.keys())

    def get_instance_info(self, instance_name: str) -> Optional[Dict[str, Any]]:
        """获取实例信息（包括容器数量等）"""
        try:
            client = self.docker_clients.get(instance_name)
            if not client:
                return None

            containers = client.get_containers()
            return {
                'name': instance_name,
                'container_count': len(containers),
                'available': True
            }
        except Exception as e:
            logger.error(f"获取实例 [{instance_name}] 信息失败: {e}")
            return {
                'name': instance_name,
                'container_count': 0,
                'available': False,
                'error': str(e)
            }

    def is_multi_instance(self) -> bool:
        """是否为多实例模式"""
        return len(self.docker_clients) > 1
