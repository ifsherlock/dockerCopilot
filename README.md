# DockerCopilot

<a href="https://www.gnu.org/licenses/agpl-3.0.en.html">
  <img alt="License: AGPLv3" src="https://shields.io/badge/License-AGPL%20v3-blue.svg">
</a>

DockerCopilot 是一个主打便捷的 Docker 容器管理工具，支持通过 Web 页面和 Telegram Bot 管理容器、镜像、备份和更新。

> 当前维护版：`2.1.6` / `v2.1.6`

## 功能概览

- 容器管理
  - 查看运行中/已停止容器
  - 启动、停止、重启、重命名容器
  - 单个/批量更新容器
  - 更新进度查看
  - 容器详情卡片
  - 容器搜索、卡片/表格视图
- 镜像管理
  - 镜像列表卡片/表格视图
  - 删除无 Tag 镜像、删除未使用镜像
  - 批量选择/批量删除
  - 镜像拉取/加速拉取与操作日志
- 更新检测
  - 基于容器创建镜像和运行镜像 digest 检测更新
  - 支持同一镜像运行多个容器的更新识别
  - 避免把本地 tag、`latest` tag 或 `sha256:...` 误当作容器原始镜像
  - 容器列表优先返回本地 Docker 状态，更新检测异步刷新缓存，避免 DockerHub/GHCR/私有仓库网络问题拖慢页面
- 更新黑名单
  - 支持容器/镜像维度忽略更新
  - 黑名单持久化到 `/app/config/config.json` 的 `telegram.update_blacklist`
  - Web 容器页、交互页和 Telegram Bot 使用同一份黑名单
- 备份恢复
  - 备份容器配置
  - 恢复容器配置
  - 支持定时备份
- Telegram Bot
  - 内置 Bot，可随主容器启动
  - 支持代理（none / socks5 / http）
  - 支持更新通知、自动更新、镜像清理
  - 支持多 DockerCopilot 实例配置
  - 提供独立 Bot 镜像，适合单独部署
- UI 优化
  - 中文界面
  - 容器/镜像搜索
  - 容器和镜像表格视图
  - 批量操作按钮增强
  - 镜像大小颜色提示

## 镜像

GHCR：

```text
ghcr.io/ifsherlock/dockercopilot:latest
ghcr.io/ifsherlock/dockercopilot:v2.1.6
ghcr.io/ifsherlock/dockercopilot-bot:latest
ghcr.io/ifsherlock/dockercopilot-bot:2.1.6
```

DockerHub：

```text
jaysherlock/dockercopilot:latest
jaysherlock/dockercopilot:v2.1.6
jaysherlock/dockercopilot-bot:latest
jaysherlock/dockercopilot-bot:2.1.6
```

## 主程序 docker-compose.yaml

推荐创建目录后部署，例如：

```bash
mkdir -p /opt/dockercopilot/{data,config}
cd /opt/dockercopilot
nano docker-compose.yaml
```

写入：

```yaml
services:
  dockercopilot:
    image: ghcr.io/ifsherlock/dockercopilot:latest
    container_name: dockercopilot
    restart: always
    privileged: true
    network_mode: bridge
    ports:
      - "12712:12712"
    volumes:
      # 必填：用于管理宿主机 Docker
      - /var/run/docker.sock:/var/run/docker.sock
      # 数据目录：备份文件、图标等
      - ./data:/data
      # 配置目录：保存 Bot 配置、更新黑名单等
      - ./config:/app/config
    environment:
      - TZ=Asia/Shanghai
      - DOCKER_HOST=unix:///var/run/docker.sock
      # 登录密钥：不少于 8 位
      - secretKey=请改成你的强密码
      # 备份目录，默认也可不填
      - BACKUP_DIR=/data/backups
      - WORKDIR=/app
```

启动：

```bash
docker compose up -d
```

访问：

```text
http://服务器IP:12712/manager
```

如果只允许本机反代访问，可以保持 `12712:12712`；如果需要局域网直接访问，可改为：

```yaml
ports:
  - "0.0.0.0:12712:12712"
```

### 环境变量说明

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `secretKey` | 是 | Web 登录密钥，不少于 8 位 |
| `TZ` | 否 | 时区，建议 `Asia/Shanghai` |
| `DOCKER_HOST` | 否 | Docker socket 地址，默认使用 `unix:///var/run/docker.sock` |
| `BACKUP_DIR` | 否 | 备份文件目录，建议 `/data/backups` |
| `WORKDIR` | 否 | 容器工作目录，默认 `/app` |
| `TELEGRAM_BOT_TOKEN` | 否 | 填写后主容器会启动内置 Telegram Bot |
| `TELEGRAM_CHAT_IDS` | 否 | 允许接收通知的 chat id，多个用英文逗号分隔 |
| `TELEGRAM_PROXY_TYPE` | 否 | Telegram 代理类型：`none` / `socks5` / `http` |
| `DOCKERCOPILOT_API_URLS` | 否 | Bot 管理实例列表，格式见下方 |

## 内置 Telegram Bot 配置

如果希望主程序容器同时启动 Telegram Bot，可在主程序 compose 的 `environment` 中补充：

```yaml
environment:
  - TZ=Asia/Shanghai
  - DOCKER_HOST=unix:///var/run/docker.sock
  - secretKey=请改成你的强密码

  # ===== Telegram Bot 配置（可选）=====
  - TELEGRAM_BOT_TOKEN=你的_bot_token
  - TELEGRAM_CHAT_IDS=你的_chat_id,另一个_chat_id
  - TELEGRAM_POLLING_INTERVAL=1
  - TELEGRAM_UPDATE_CHECK_CRON=0 18 * * *
  - TELEGRAM_NOTIFY_ON_UPDATE=true

  # 更新黑名单，建议也可以在 Web「交互」页面维护
  - TELEGRAM_UPDATE_BLACKLIST=postgresql,redis,mysql

  # 自动清理镜像
  - TELEGRAM_AUTO_CLEAN_IMAGES=false
  - TELEGRAM_CLEAN_IMAGES_CRON=3 2 * * *

  # 自动更新容器
  - TELEGRAM_AUTO_UPDATE_CONTAINERS=false
  - TELEGRAM_UPDATE_CONTAINERS_CRON=0 */6 * * *

  # ===== Telegram Bot 代理配置（可选）=====
  # 支持 none / socks5 / http
  - TELEGRAM_PROXY_TYPE=none
  - TELEGRAM_PROXY_HOST=
  - TELEGRAM_PROXY_PORT=
  - TELEGRAM_PROXY_USERNAME=
  - TELEGRAM_PROXY_PASSWORD=

  # ===== Bot 管理 DockerCopilot 实例 =====
  # 格式：实例名::API地址::secretKey
  # 多实例用 | 分隔
  - DOCKERCOPILOT_API_URLS=local::http://127.0.0.1:12712::请改成你的强密码
```

Bot 配置会持久化到：

```text
/app/config/config.json
```

只要挂载了：

```yaml
- ./config:/app/config
```

那么 Bot 配置、更新黑名单等都会在容器重建后保留。

## 单独部署 Telegram Bot

如果你不想把 Bot 跑在主程序容器里，可以单独部署 `dockercopilot-bot`。

适用场景：

- 主程序和 Bot 分开升级
- 一个 Bot 管理多个 DockerCopilot 实例
- Bot 需要独立代理网络
- 主程序容器只负责 Web/API

示例 `docker-compose.bot.yaml`：

```yaml
services:
  dockercopilot-bot:
    image: ghcr.io/ifsherlock/dockercopilot-bot:latest
    container_name: dockercopilot-bot
    restart: always
    environment:
      - TZ=Asia/Shanghai

      # Telegram Bot
      - TELEGRAM_BOT_TOKEN=你的_bot_token
      - TELEGRAM_CHAT_IDS=你的_chat_id
      - TELEGRAM_POLLING_INTERVAL=1

      # DockerCopilot 实例
      # 格式：实例名::API地址::secretKey
      # 如果 Bot 和主程序在同一个 compose 网络内，可以使用 http://dockercopilot:12712
      # 如果是外部主机，请填写可访问地址，例如 http://192.168.1.10:12712
      - DOCKERCOPILOT_API_URLS=local::http://192.168.1.10:12712::你的_dockercopilot_secretKey

      # 更新通知/自动任务
      - TELEGRAM_UPDATE_CHECK_CRON=0 18 * * *
      - TELEGRAM_NOTIFY_ON_UPDATE=true
      - TELEGRAM_UPDATE_BLACKLIST=
      - TELEGRAM_AUTO_CLEAN_IMAGES=false
      - TELEGRAM_CLEAN_IMAGES_CRON=3 2 * * *
      - TELEGRAM_AUTO_UPDATE_CONTAINERS=false
      - TELEGRAM_UPDATE_CONTAINERS_CRON=0 */6 * * *

      # 代理：none / socks5 / http
      - TELEGRAM_PROXY_TYPE=none
      - TELEGRAM_PROXY_HOST=
      - TELEGRAM_PROXY_PORT=
      - TELEGRAM_PROXY_USERNAME=
      - TELEGRAM_PROXY_PASSWORD=
    volumes:
      # 保存 Bot 运行时配置
      - ./bot-config:/app/config
```

启动：

```bash
docker compose -f docker-compose.bot.yaml up -d
```

> 注意：独立 Bot 可以通过 API 管理 DockerCopilot 实例；更新黑名单的最终同步能力取决于目标 DockerCopilot API。建议优先在 DockerCopilot Web「交互」页面维护黑名单。

## 多实例配置格式

`DOCKERCOPILOT_API_URLS` 格式：

```text
实例名::API地址::secretKey
```

多个实例使用 `|` 分隔：

```text
home::http://192.168.1.10:12712::home_secret|nas::http://192.168.1.20:12712::nas_secret
```

## 更新黑名单

更新黑名单用于跳过不希望自动更新/提示更新的容器或镜像。

推荐在 Web 页面维护：

```text
交互 -> 更新黑名单
```

保存位置：

```text
/app/config/config.json -> telegram.update_blacklist
```

匹配规则：

- 支持容器名
- 支持镜像名
- 自动规范化 Docker Hub 前缀，例如：
  - `docker.io/library/nginx:latest`
  - `library/nginx:latest`
  - `nginx:latest`
- 未填写 tag 时按 `:latest` 处理
- 容器页、交互页和 Telegram Bot 共用同一份规则

## 更新检测说明

DockerCopilot 会优先使用容器创建时的镜像引用，例如：

```text
vaultwarden/server:1.35.8
jaysherlock/dc-update-test:latest
```

再结合当前运行镜像的 `RepoDigests` 与远端 registry digest 比较。

这样可以避免：

- 同一个镜像运行多个容器时漏检
- 容器 `usingImage` 变成 `sha256:...` 后无法更新
- 本地 `latest` tag 和容器创建 tag 不一致导致误报
- 私有仓库、无权限仓库、无 `RepoDigest` 的本地镜像拖垮容器列表

容器列表接口会优先返回本地容器状态，更新检测在后台异步刷新缓存。

## 程序自更新说明

DockerCopilot 左下角版本信息会同时读取：

- 本地运行版本
- 远端 `latest/version` 版本

当远端版本高于本地版本时，页面会提示有新版本。

### DockerCopilot 自身容器如何更新？

DockerCopilot 自己这个容器不会走普通容器的“拉镜像 -> 停止 -> 重建容器”流程。

原因很简单：如果先把自己停掉，更新流程也就中断了。

因此自身更新会改走 **程序自更新**：

1. 读取远端 `latest/version`
2. 从 GitHub Release 下载对应架构的 `dockerCopilot-<arch>.tar.gz`
3. 解压出新的 `dockerCopilot-new` 二进制
4. 将其写入容器工作目录中的 `./dockerCopilot-new`
5. 主进程退出后，容器重启
6. `start.sh` 检测到 `./dockerCopilot-new`，自动替换为 `./dockerCopilot`

这样容器版就可以通过**仅替换二进制文件**完成自更新，而不需要先把容器删除重建。

### 什么时候不会执行自更新？

如果本地版本已经等于远端版本，界面会直接提示：

- `当前已是最新版本`

此时不会重复下载，也不会触发重启。

## 常见问题

### 登录提示失败

请检查：

- `secretKey` 是否和 compose 中一致
- `secretKey` 是否不少于 8 位且非纯数字
- 容器是否正常启动：`docker logs dockercopilot`

### 页面看不到容器

请检查是否挂载 Docker socket：

```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
```

以及环境变量：

```yaml
environment:
  - DOCKER_HOST=unix:///var/run/docker.sock
```

### Telegram Bot 不启动

请检查：

- `TELEGRAM_BOT_TOKEN` 是否填写
- `TELEGRAM_CHAT_IDS` 是否正确
- 如果网络需要代理，是否配置了 `TELEGRAM_PROXY_TYPE/HOST/PORT`
- 查看日志：`docker logs dockercopilot` 或 `docker logs dockercopilot-bot`

### Bot 退出会不会影响主程序？

不会。主程序后端是容器生命周期的权威进程；Telegram Bot 是可选辅助进程，Bot 退出不会导致 DockerCopilot 后端退出。

## 开发环境

- Go：`1.21+`
- Node.js：建议 `20+`
- 前端构建：

```bash
npm install
npm run build
```

本项目运行镜像使用嵌入式前端资源，完整构建链路为：

```bash
npm run build
rm -rf front
cp -a dist front
go build -o dc-back/dist/linux/amd64/dockerCopilot ./dockercopilot.go
docker build -f docker/Dockerfile -t ghcr.io/ifsherlock/dockercopilot:latest .
```

## License

AGPL-3.0
