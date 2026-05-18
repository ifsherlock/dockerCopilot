# Docker Copilot integrated image
FROM alpine
LABEL authors="onlyLTY"
WORKDIR /app

ARG TARGETPLATFORM

COPY dc-back/dist/$TARGETPLATFORM/dockerCopilot ./dockerCopilot
COPY dc-back/etc/. ./etc
COPY start.sh ./start.sh
COPY bot ./bot

RUN apk add --no-cache tzdata python3 py3-pip \
    && python3 -m venv /app/bot/.venv \
    && /app/bot/.venv/bin/pip install --no-cache-dir -r /app/bot/requirements.txt \
    && ln -sf /app/bot/.venv/bin/python /usr/local/bin/python \
    && chmod +x start.sh \
    && chmod +x dockerCopilot

# 设置环境变量
ENV secretKey="" \
    DOCKER_HOST="unix:///var/run/docker.sock" \
    BACKUP_DIR="/data/backups" \
    WORKDIR="/app" \
    TZ="Asia/Shanghai"

VOLUME ["/data", "/app/config"]
CMD ["./start.sh"]
