# Docker Copilot integrated image
FROM alpine
LABEL authors="onlyLTY"
WORKDIR /app

ARG TARGETOS
ARG TARGETARCH

COPY release/${TARGETOS}/${TARGETARCH}/dockerCopilot ./dockerCopilot
COPY release/etc/. ./etc
COPY start.sh ./start.sh
RUN apk add --no-cache tzdata \
    && chmod +x start.sh \
    && chmod +x dockerCopilot

# 设置环境变量
ENV secretKey="" \
    DOCKER_HOST="unix:///var/run/docker.sock" \
    BACKUP_DIR="/data/backups" \
    WORKDIR="/app" \
    TZ="Asia/Shanghai"

VOLUME ["/data"]
CMD ["./start.sh"]
