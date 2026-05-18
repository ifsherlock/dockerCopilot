#!/bin/sh
set -e

cd "${WORKDIR:-/app}" || exit 1

# 判断当前目录下是否存在名为 dockerCopilot-new 的二进制文件
if [ -f "./dockerCopilot-new" ]; then
    mv ./dockerCopilot-new ./dockerCopilot
    chmod +x ./dockerCopilot
fi

BACKEND_PID=""
BOT_PID=""

shutdown() {
    echo "收到停止信号，正在关闭服务..."
    if [ -n "$BOT_PID" ] && kill -0 "$BOT_PID" 2>/dev/null; then
        kill "$BOT_PID" 2>/dev/null || true
    fi
    if [ -n "$BACKEND_PID" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
        kill "$BACKEND_PID" 2>/dev/null || true
    fi
    wait 2>/dev/null || true
    exit 0
}

trap shutdown INT TERM

# 启动 Docker Copilot 后端
./dockerCopilot &
BACKEND_PID=$!
echo "Docker Copilot 后端已启动 PID=$BACKEND_PID"

# 可选启动 Telegram Bot：只有环境变量或配置文件里存在非空 bot_token 才启动。
# /app/config/config.json 还会保存更新黑名单等 UI 配置，不能仅因文件存在就启动 Bot。
CONFIG_BOT_TOKEN=""
if [ -f "/app/config/config.json" ]; then
    CONFIG_BOT_TOKEN=$(python3 -c "import json; p='/app/config/config.json'; print(((json.load(open(p, encoding='utf-8')).get('telegram') or {}).get('bot_token')) or '')" 2>/dev/null || true)
fi

if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] || [ -n "$CONFIG_BOT_TOKEN" ]; then
    if [ -d "/app/bot" ]; then
        echo "检测到 Telegram Bot 配置，正在启动 Bot..."
        cd /app/bot
        /app/bot/.venv/bin/python -m src.main &
        BOT_PID=$!
        echo "Telegram Bot 已启动 PID=$BOT_PID"
        cd "${WORKDIR:-/app}"
    else
        echo "警告：未找到 /app/bot，跳过 Telegram Bot 启动"
    fi
else
    echo "未配置 Telegram Bot Token，跳过 Telegram Bot 启动"
fi

# 后端是容器生命周期的权威进程：后端退出才停止容器。
# Telegram Bot 是可选辅助进程，Bot 启动失败/运行中退出不能拖垮后端，避免容器重启循环。
while true; do
    if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
        echo "Docker Copilot 后端已退出"
        shutdown
    fi
    if [ -n "$BOT_PID" ] && ! kill -0 "$BOT_PID" 2>/dev/null; then
        wait "$BOT_PID" 2>/dev/null || true
        echo "Telegram Bot 已退出，后端继续运行"
        BOT_PID=""
    fi
    sleep 2
done
