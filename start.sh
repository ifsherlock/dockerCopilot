#!/bin/sh
set -e

cd "${WORKDIR:-/app}" || exit 1

if [ -f "./dockerCopilot-new" ]; then
    mv ./dockerCopilot-new ./dockerCopilot
    chmod +x ./dockerCopilot
fi

trap 'echo "[dockercopilot][warn] 收到停止信号，正在关闭服务..."; exit 0' INT TERM

exec ./dockerCopilot
