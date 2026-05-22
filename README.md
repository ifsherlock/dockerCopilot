# DockerCopilot

<a href="https://www.gnu.org/licenses/agpl-3.0.en.html">
  <img alt="License: AGPLv3" src="https://shields.io/badge/License-AGPL%20v3-blue.svg">
</a>

DockerCopilot 是一个面向日常运维的 Docker 管理工具，提供 **Web 面板 + Telegram Bot** 双入口，适合在 NAS、Linux 主机、家庭服务器上统一管理容器、镜像、日志、备份与更新。

> 当前维护版：`2.1.9`

---

## 这版重点能力

### 1. 容器管理更完整
- 容器列表 / 卡片双视图
- 启动、停止、重启、重命名
- 单个 / 批量更新容器
- 更新进度反馈
- 容器详情查看
- 容器 WebUI 链接自动生成
- 支持宿主机 IP / 容器专属 WebUI 地址覆盖

### 2. 镜像管理更实用
- 镜像列表 / 卡片双视图
- 批量选择、批量删除、强制删除
- 镜像拉取 / 加速拉取
- 镜像来源链接跳转（Docker Hub / GHCR）
- 镜像使用状态区分：
  - `running`：有运行中的容器正在使用
  - `stopped`：仅被已停止容器使用
  - `unused`：未被任何容器使用

### 3. 定时任务能力更明确
- **定时检查更新**
- **定时自动更新容器**
- **定时自动清理无用镜像**
- **定时备份 JSON / Compose 配置**
- 支持 Cron 配置
- 支持更新黑名单，避免误更新关键容器

### 4. Telegram Bot 操控是核心能力之一
- Bot 可直接操控容器：启动 / 停止 / 重启 / 更新
- 支持查看可更新容器列表
- 支持镜像管理、容器管理、更新确认
- 支持更新通知、自动更新、自动清理
- 支持代理：`none / socks5 / http`
- 支持 **多实例管理**：一个 Bot 管多个 DockerCopilot

### 5. 日志 / 配置 / 备份都更适合长期使用
- 容器日志查看、过滤、高亮、复制、下载
- 配置页统一管理 Bot / 多实例 / 代理 / 定时策略
- 备份与恢复入口集中
- 关键配置持久化到 `/app/config/config.json`

---

## 镜像

推荐镜像：

```text
jaysherlock/dockercopilot:latest
```

> 当前主程序镜像已内置 Telegram Bot，不需要再额外部署旧的独立 bot 子进程方案。

---

## 推荐部署方式：host 网络

**推荐优先使用 `host` 模式运行。**

原因：
- 容器 WebUI 链接更直观
- 不容易拿到 `172.*` 这类容器内网地址
- 更适合 NAS / 家用服务器 / 反向代理前的本地部署
- 配置更简单，排障成本更低

### docker-compose.yaml

```yaml
services:
  dockercopilot:
    image: jaysherlock/dockercopilot:latest
    container_name: dockercopilot
    restart: always
    privileged: true
    network_mode: host
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./data:/data
      - ./config:/app/config
    environment:
      - TZ=Asia/Shanghai
      - DOCKER_HOST=unix:///var/run/docker.sock
      - secretKey=请改成你的强密码
      - BACKUP_DIR=/data/backups
      - WORKDIR=/app

      # 可选：Telegram Bot
      - TELEGRAM_BOT_TOKEN=
      - TELEGRAM_CHAT_IDS=
      - TELEGRAM_UPDATE_CHECK_CRON=0 18 * * *
      - TELEGRAM_NOTIFY_ON_UPDATE=true

      # 可选：自动任务
      - TELEGRAM_AUTO_CLEAN_IMAGES=false
      - TELEGRAM_CLEAN_IMAGES_CRON=3 2 * * *
      - TELEGRAM_AUTO_UPDATE_CONTAINERS=false
      - TELEGRAM_UPDATE_CONTAINERS_CRON=0 */6 * * *

      # 可选：代理
      - TELEGRAM_PROXY_TYPE=none
      - TELEGRAM_PROXY_HOST=
      - TELEGRAM_PROXY_PORT=
      - TELEGRAM_PROXY_USERNAME=
      - TELEGRAM_PROXY_PASSWORD=
```

启动：

```bash
docker compose up -d
```

访问：

```text
http://服务器IP:12712/manager
```

---

## 如果你必须使用 bridge

可以运行，但建议同时配置宿主机局域网 IP。

### bridge 示例

```yaml
services:
  dockercopilot:
    image: jaysherlock/dockercopilot:latest
    container_name: dockercopilot
    restart: always
    privileged: true
    network_mode: bridge
    ports:
      - "12712:12712"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./data:/data
      - ./config:/app/config
    environment:
      - TZ=Asia/Shanghai
      - DOCKER_HOST=unix:///var/run/docker.sock
      - secretKey=请改成你的强密码
      - HOST_LAN_IP=改成你的宿主机IP
```

说明：
- `HOST_LAN_IP` 建议填写宿主机真实局域网 IP
- 这样容器页生成的 WebUI 链接会优先使用这个地址
- 否则在 bridge 模式下，某些场景可能显示成 Docker 内网地址

---

## 常用环境变量

| 变量 | 说明 |
| --- | --- |
| `secretKey` | Web 登录密钥，建议不少于 8 位 |
| `TZ` | 时区，建议 `Asia/Shanghai` |
| `DOCKER_HOST` | Docker socket 地址，通常为 `unix:///var/run/docker.sock` |
| `BACKUP_DIR` | 备份目录，建议 `/data/backups` |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot Token |
| `TELEGRAM_CHAT_IDS` | 允许接收通知的 chat id，多个用逗号分隔 |
| `TELEGRAM_UPDATE_CHECK_CRON` | 定时检查更新 |
| `TELEGRAM_AUTO_CLEAN_IMAGES` | 是否自动清理无用镜像 |
| `TELEGRAM_CLEAN_IMAGES_CRON` | 自动清理镜像 Cron |
| `TELEGRAM_AUTO_UPDATE_CONTAINERS` | 是否自动更新容器 |
| `TELEGRAM_UPDATE_CONTAINERS_CRON` | 自动更新容器 Cron |
| `TELEGRAM_PROXY_TYPE` | `none / socks5 / http` |
| `HOST_LAN_IP` | bridge 模式下推荐设置的宿主机局域网 IP |
| `DOCKERCOPILOT_API_URLS` | 多实例 Bot 管理列表 |

---

## 多实例 Bot 配置

`DOCKERCOPILOT_API_URLS` 格式：

```text
实例名::API地址::secretKey
```

多个实例用 `|` 分隔：

```text
home::http://你的宿主机IP:12712::home_secret|nas::http://另一台宿主机IP:12712::nas_secret
```

适合：
- 一台 Bot 管多台 DockerCopilot
- 多 NAS / 多主机统一通知与操控

---

## 更新与自更新说明

DockerCopilot 支持两类更新：

### 容器更新
- 检查容器所用镜像是否有新版本
- 支持 Web 更新
- 支持 Telegram Bot 更新
- 支持批量更新
- 支持更新黑名单

### DockerCopilot 自更新
DockerCopilot 自己不会走普通的“删容器重建”流程，而是走：

1. 检查远端版本
2. 下载对应架构 release 二进制包
3. 写入新的 `dockerCopilot-new`
4. 主进程退出后自动替换
5. 容器重启完成升级

这样可以避免“先把自己停掉，更新流程也一起停掉”的问题。

---

## 配置与持久化

主要配置文件：

```text
/app/config/config.json
```

建议始终挂载：

```yaml
- ./config:/app/config
```

这样这些内容都能保留：
- Bot 配置
- 更新黑名单
- 自动任务设置
- 多实例配置
- 宿主机 IP 配置
- 容器专属 WebUI 覆盖配置

---

## 常见问题

### 1. 页面看不到容器
请确认已挂载 Docker socket：

```yaml
- /var/run/docker.sock:/var/run/docker.sock
```

并设置：

```yaml
- DOCKER_HOST=unix:///var/run/docker.sock
```

### 2. 容器 WebUI 链接不对
优先建议：
- 使用 `host` 网络模式

如果必须 bridge：
- 配置 `HOST_LAN_IP`
- 或在 Web 配置页填写宿主机 IP

### 3. Telegram Bot 没反应
检查：
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_IDS`
- 代理配置是否正确
- 容器日志中是否有 Telegram 连接错误

### 4. 自动更新 / 自动清理不执行
检查：
- 对应开关是否开启
- Cron 是否填写正确
- 时区是否正确
- 更新黑名单是否把目标过滤掉了

---

## 开发构建

前端：

```bash
npm install
npm run build
```

如果需要重新打包嵌入式前端：

```bash
npm run build
rm -rf front
cp -a dist front
```

后端 / 镜像再按项目发布流程继续构建。

---

## 致谢

本项目基于原作者的优秀工作持续演进，特别感谢原作者：

- 原作者仓库：<https://github.com/onlyLTY/dockerCopilot>

维护版在此基础上持续补充了：
- Telegram Bot 深化操控
- 定时更新 / 定时清理 / 定时备份
- 多实例管理
- 更适合中文用户与 NAS 场景的前后端体验优化

---

## License

AGPL-3.0
