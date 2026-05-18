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

# 可选启动 Telegram Bot：只有配置了 TELEGRAM_BOT_TOKEN 或 /app/config/config.json 才启动
if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] || [ -f "/app/config/config.json" ]; then
    if [ -d "/app/bot" ]; then
        echo "检测到 Telegram Bot 配置，正在启动 Bot..."
        cd /app/bot
        python -m src.main &
        BOT_PID=$!
        echo "Telegram Bot 已启动 PID=$BOT_PID"
        cd "${WORKDIR:-/app}"
    else
        echo "警告：未找到 /app/bot，跳过 Telegram Bot 启动"
    fi
else
    echo "未配置 TELEGRAM_BOT_TOKEN，跳过 Telegram Bot 启动"
fi

# 任一进程退出，则关闭全部，方便容器重启
while true; do
    if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
        echo "Docker Copilot 后端已退出"
        shutdown
    fi
    if [ -n "$BOT_PID" ] && ! kill -0 "$BOT_PID" 2>/dev/null; then
        echo "Telegram Bot 已退出"
        shutdown
    fi
    sleep 2
done
