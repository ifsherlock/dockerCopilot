"""Docker Copilot API客户端"""
import os
import requests
import logging
import jwt
import time
from typing import Dict, List, Any, Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class Container:
    """容器信息"""
    id: str
    name: str
    image: str
    state: str
    status: str
    has_update: bool = False


class DockerCopilotClient:
    """Docker Copilot API客户端"""

    def __init__(self, api_url: str, secret_key: str, timeout: int = 30):
        self.api_url = api_url.rstrip('/')
        # 兼容旧配置：当实例 secret_key 为空时，回退环境变量
        self.secret_key = secret_key or os.getenv('DOCKERCOPILOT_SECRET_KEY', '')
        self.timeout = timeout
        self._token_cache = None
        self._token_expire_time = 0

        # 关键策略：DockerCopilot API 请求永远直连，不走任何代理
        # - ignore HTTP(S)_PROXY/ALL_PROXY/no_proxy 环境变量
        # - requests 仅用于 DockerCopilot API，不影响 Telegram Bot 自身网络行为
        self._session = requests.Session()
        self._session.trust_env = False
        self._session.proxies = {"http": None, "https": None}

        logger.info(f"Docker Copilot API客户端初始化完成: {self.api_url} (proxy=disabled)")

    def _generate_jwt(self, force_new: bool = False) -> str:
        """生成JWT Token（使用HS256算法，支持缓存）"""
        try:
            current_time = int(time.time())

            # 如果缓存的token还未过期（提前5分钟刷新），直接返回
            if not force_new and self._token_cache and current_time < (self._token_expire_time - 300):
                return self._token_cache

            # 生成新token
            # 注意：为了兼容时间不同步的服务器，iat 设置为稍早时间
            payload = {
                "exp": current_time + 28 * 24 * 60 * 60,  # 28天后过期
                "iat": current_time - 300                 # 当前时间减5分钟（容差）
            }
            encoded_jwt = jwt.encode(payload, self.secret_key, algorithm="HS256")
            token = f"Bearer {encoded_jwt}"

            # 缓存token
            self._token_cache = token
            self._token_expire_time = current_time + 28 * 24 * 60 * 60

            logger.debug(f"生成新JWT Token（有效期至: {self._token_expire_time}）")
            return token
        except Exception as e:
            logger.error(f"生成JWT Token失败: {e}")
            raise

    def _get_headers(self, force_new_token: bool = False) -> Dict[str, str]:
        """获取请求头"""
        return {
            "Authorization": self._generate_jwt(force_new=force_new_token),
            "Content-Type": "application/json"
        }

    def _request(self, method: str, endpoint: str, **kwargs) -> Dict[str, Any]:
        """发送HTTP请求（带重试机制）"""
        url = f"{self.api_url}{endpoint}"

        # 首次尝试
        try:
            response = self._session.request(
                method=method,
                url=url,
                headers=self._get_headers(),
                timeout=self.timeout,
                **kwargs
            )

            response.raise_for_status()
            return response.json()

        except requests.HTTPError as e:
            # 如果是401错误，尝试刷新token后重试一次
            if e.response.status_code == 401:
                logger.warning(f"收到401错误，尝试刷新Token后重试: {url}")
                logger.debug(f"当前时间: {int(time.time())}, Secret Key: {self.secret_key[:10]}...")
                try:
                    response = self._session.request(
                        method=method,
                        url=url,
                        headers=self._get_headers(force_new_token=True),
                        timeout=self.timeout,
                        **kwargs
                    )
                    response.raise_for_status()
                    logger.info(f"刷新Token后请求成功: {url}")
                    return response.json()
                except requests.RequestException as retry_error:
                    logger.error(f"刷新Token后仍然失败 [{method}] {url}: {retry_error}")
                    logger.debug(f"响应内容: {retry_error.response.text if hasattr(retry_error, 'response') else 'N/A'}")
                    raise
            else:
                # 尝试从响应中提取详细错误信息
                error_detail = str(e)
                if hasattr(e, 'response') and e.response is not None:
                    try:
                        error_json = e.response.json()
                        if 'msg' in error_json:
                            error_detail = error_json['msg']
                        elif 'message' in error_json:
                            error_detail = error_json['message']
                    except:
                        # 如果无法解析JSON，使用响应文本
                        if e.response.text:
                            error_detail = e.response.text[:200]  # 限制长度

                logger.error(f"API请求失败 [{method}] {url}: {error_detail}")
                # 抛出包含详细信息的异常
                raise Exception(f"{e.response.status_code} {e.response.reason}: {error_detail}") from e

        except requests.RequestException as e:
            logger.error(f"API请求失败 [{method}] {url}: {e}")
            raise

    def get_containers(self) -> List[Container]:
        """获取容器列表（返回码为0表示成功）"""
        result = self._request('GET', '/api/containers')

        # 注意：容器列表API返回code=0表示成功（与其他API的code=200不同）
        if result.get('code') != 0:
            raise Exception(f"获取容器列表失败: {result.get('msg')}")

        containers = []
        for idx, item in enumerate(result.get('data', [])):
            # 调试日志：输出原始数据
            logger.info(f"API返回容器 {idx}: {item}")

            # 根据API文档，使用正确的字段名（小写）
            status = item.get('status', '')

            # 判断运行状态：status字段通常包含 "Up" 或 "Exited"
            state = 'running' if 'Up' in status or status.lower() == 'running' else 'stopped'

            container = Container(
                id=item.get('id', ''),
                name=item.get('name', ''),
                image=item.get('usingImage', ''),
                state=state,
                status=status,
                has_update=item.get('haveUpdate', False)
            )
            logger.info(f"解析后容器: id={container.id}, name={container.name}, state={container.state}")
            containers.append(container)

        return containers

    def get_container_info(self, container_id: str) -> Optional[Dict[str, Any]]:
        """获取容器详细信息（通过容器列表过滤）"""
        containers = self.get_containers()
        for container in containers:
            if container.id.startswith(container_id):
                return {
                    'id': container.id,
                    'name': container.name,
                    'image': container.image,
                    'state': container.state,
                    'status': container.status,
                    'has_update': container.has_update
                }
        return None

    def start_container(self, container_id: str) -> Dict[str, Any]:
        """启动容器"""
        return self._request('POST', f'/api/container/{container_id}/start')

    def stop_container(self, container_id: str) -> Dict[str, Any]:
        """停止容器"""
        return self._request('POST', f'/api/container/{container_id}/stop')

    def restart_container(self, container_id: str) -> Dict[str, Any]:
        """重启容器"""
        return self._request('POST', f'/api/container/{container_id}/restart')

    def rename_container(self, container_id: str, new_name: str) -> Dict[str, Any]:
        """重命名容器

        Args:
            container_id: 容器ID
            new_name: 新的容器名称

        Returns:
            操作结果
        """
        params = {'newName': new_name}
        return self._request('POST', f'/api/container/{container_id}/rename', params=params)

    def update_container(self, container_id: str, image_name_and_tag: str, container_name: str) -> Dict[str, Any]:
        """更新容器"""
        params = {
            'imageNameAndTag': image_name_and_tag,
            'containerName': container_name
        }
        return self._request('POST', f'/api/container/{container_id}/update', params=params)

    def get_update_progress(self, task_id: str) -> Dict[str, Any]:
        """查询更新进度"""
        return self._request('GET', f'/api/progress/{task_id}')

    def get_version(self, version_type: str = 'local') -> Dict[str, Any]:
        """获取版本信息

        Args:
            version_type: 'local' 获取本地版本, 'remote' 获取远程版本

        Returns:
            版本信息字典
        """
        params = {'type': version_type}
        return self._request('GET', '/api/version', params=params)

    def update_program(self) -> Dict[str, Any]:
        """更新 Docker Copilot 程序到最新版本"""
        return self._request('PUT', '/api/program')

    def get_images(self) -> List[Dict[str, Any]]:
        """获取镜像列表"""
        result = self._request('GET', '/api/images')

        if result.get('code') != 200:
            raise Exception(f"获取镜像列表失败: {result.get('msg')}")

        return result.get('data', [])

    def delete_image(self, image_id: str, force: bool = False) -> Dict[str, Any]:
        """删除镜像"""
        params = {'force': 'true' if force else 'false'}
        return self._request('DELETE', f'/api/image/{image_id}', params=params)

    def backup_containers(self) -> Dict[str, Any]:
        """备份所有容器配置"""
        return self._request('GET', '/api/container/backup')

    def backup_to_compose(self) -> Dict[str, Any]:
        """备份为docker-compose格式"""
        return self._request('GET', '/api/container/backup2compose')

    def get_backups(self) -> List[Dict[str, Any]]:
        """获取备份文件列表"""
        result = self._request('GET', '/api/container/listBackups')

        if result.get('code') != 200:
            raise Exception(f"获取备份列表失败: {result.get('msg')}")

        return result.get('data', [])

    def restore_backup(self, filename: str) -> Dict[str, Any]:
        """恢复备份"""
        data = {'filename': filename}
        return self._request('POST', '/api/container/backups/restore', json=data)

    def delete_backup(self, filename: str) -> Dict[str, Any]:
        """删除备份文件"""
        params = {'filename': filename}
        return self._request('DELETE', '/api/container/backups', params=params)
