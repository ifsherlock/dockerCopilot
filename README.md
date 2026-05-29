# DockerCopilot

<a href="https://www.gnu.org/licenses/agpl-3.0.en.html">
  <img alt="License: AGPLv3" src="https://shields.io/badge/License-AGPL%20v3-blue.svg">
</a>

> 🛠️ 维护版：`2.1.12`  
> ❤️ 基于原作者 [onlyLTY/dockerCopilot](https://github.com/onlyLTY/dockerCopilot) 持续演进，感谢原作者开源贡献。

DockerCopilot 是一个面向日常运维的 Docker 管理工具，提供 🖥️ **Web 面板** + 📱 **Mobile 面板** + 🤖 **Telegram Bot**，适合 NAS、Linux 主机和家庭服务器统一管理容器、镜像、日志、备份与更新。

## ✨ 2.1.12 看点
- 🖥️ PC 与 📱 Mobile 双端统一体验
- 🔁 移动端 About 页支持程序更新：远端拉取、上传更新、强制覆盖、进度轮询、重连恢复
- 🔐 PC / Mobile 共用登录态
- 🐳 容器管理、镜像管理、日志查看、备份恢复、定时任务一站式完成
- 🤖 Telegram Bot 支持多实例管理、自动更新、自动清理与通知
- 📱 `/manager` 已初步适配移动端访问，触屏场景也可直接使用

## 🚀 推荐镜像
```text
jaysherlock/dockercopilot:latest
```

## 🧭 快速开始
1. 拉取镜像：

```bash
docker pull jaysherlock/dockercopilot:latest
```

2. 新建 `docker-compose.yml`，推荐直接使用下面的配置示例：

```yaml
services:
  dockercopilot:
    image: jaysherlock/dockercopilot:latest
    container_name: dockercopilot
    restart: unless-stopped
    privileged: true
    network_mode: host
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./data:/data
      - ./config:/app/config
    environment:
      TZ: Asia/Shanghai
      DOCKER_HOST: unix:///var/run/docker.sock
      secretKey: please-change-me
      BACKUP_DIR: /data/backups
      WORKDIR: /app

      # 🤖 Telegram Bot（可选）
      TELEGRAM_BOT_TOKEN: ""
      TELEGRAM_CHAT_IDS: ""
      TELEGRAM_UPDATE_CHECK_CRON: "0 18 * * *"
      TELEGRAM_NOTIFY_ON_UPDATE: "true"
      TELEGRAM_AUTO_CLEAN_IMAGES: "false"
      TELEGRAM_CLEAN_IMAGES_CRON: "3 2 * * *"
      TELEGRAM_AUTO_UPDATE_CONTAINERS: "false"
      TELEGRAM_UPDATE_CONTAINERS_CRON: "0 */6 * * *"

      # 🌐 代理（可选）
      TELEGRAM_PROXY_TYPE: none
      TELEGRAM_PROXY_HOST: ""
      TELEGRAM_PROXY_PORT: ""
      TELEGRAM_PROXY_USERNAME: ""
      TELEGRAM_PROXY_PASSWORD: ""
```

3. 修改 `secretKey`，按需填写 Telegram Bot 配置。
4. 启动：

```bash
docker compose up -d
```

5. 访问：

```text
PC 管理端： http://宿主机IP:12712/manager
移动端：   http://宿主机IP:12712/m
```

- 如果使用 bridge 网络，请先确认已正确映射 `12712:12712`

## 📱 双手机端 UI 适配
DockerCopilot 同时提供两套适合手机访问的入口，可按使用场景选择：

- `/manager`：PC 管理端已做响应式移动端适配，手机浏览器可直接打开，适合需要完整桌面管理能力、并希望手机与电脑界面一致的场景。
- `/m`：独立移动端 UI，布局更轻量，按钮更集中，底部导航更适合触屏操作，适合日常手机巡检、容器启停、镜像更新、日志查看和程序更新。
- 两个入口共用同一后端 API 与登录态，登录一次后可在 PC 适配页和独立移动页之间切换。
- 在 PC 管理端的手机分辨率下，页面右上角提供“手机传送”入口，可快速跳转到 `/m`。

## 🧩 配置说明
### 推荐部署：host 网络
推荐直接使用 host 网络，WebUI 链接更稳定，也更适合 NAS / 家用服务器。

### 常用环境变量
| 变量 | 说明 |
| --- | --- |
| `secretKey` | Web 登录密钥，建议修改为强密码 |
| `TZ` | 时区，建议 `Asia/Shanghai` |
| `DOCKER_HOST` | Docker socket 地址，通常为 `unix:///var/run/docker.sock` |
| `BACKUP_DIR` | 备份目录，建议 `/data/backups` |
| `WORKDIR` | 程序工作目录，通常为 `/app` |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot Token |
| `TELEGRAM_CHAT_IDS` | 接收通知的 chat id，多个用逗号分隔 |
| `TELEGRAM_UPDATE_CHECK_CRON` | 定时检查更新 |
| `TELEGRAM_AUTO_CLEAN_IMAGES` | 是否自动清理无用镜像 |
| `TELEGRAM_CLEAN_IMAGES_CRON` | 自动清理镜像 Cron |
| `TELEGRAM_AUTO_UPDATE_CONTAINERS` | 是否自动更新容器 |
| `TELEGRAM_UPDATE_CONTAINERS_CRON` | 自动更新容器 Cron |
| `TELEGRAM_PROXY_TYPE` | `none / socks5 / http` |
| `HOST_LAN_IP` | bridge 模式下建议设置宿主机局域网 IP |

### bridge 模式提示
如果必须使用 bridge：
- 记得映射 `12712:12712`
- 建议补充 `HOST_LAN_IP`
- 容器 WebUI 链接会更准确

## 📦 更新说明
- 容器更新：支持 Web / Bot / 批量更新
- 自更新：下载对应架构二进制并自动替换
- 黑名单：可避免误更新关键容器

## 🛠️ 开发构建
```bash
npm install
npm run build:front
```

- `/manager` 当前已做响应式移动端适配，但移动端专用入口仍推荐 `/m`
- `build:pc` 会输出到 [`front/pc`](front/pc)
- `build:mobile` 会生成并同步到 [`front/mobile`](front/mobile)
- Go 后端会把两套前端嵌入二进制
- 具体构建方式可参考 [`scripts`](dockerCopilot/scripts) 目录内的自动构建脚本：[`build-debian.sh`](dockerCopilot/scripts/build-debian.sh)、[`build-windows.cmd`](dockerCopilot/scripts/build-windows.cmd)、[`sync-mobile.mjs`](dockerCopilot/scripts/sync-mobile.mjs)

## 🙏 致谢
再次感谢原作者 [onlyLTY/dockerCopilot](https://github.com/onlyLTY/dockerCopilot) 的优秀工作与持续维护。

## 📄 License
AGPL-3.0
