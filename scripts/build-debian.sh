#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TOOLS_DIR="${PROJECT_ROOT}/.build-tools"
DOWNLOAD_DIR="${TOOLS_DIR}/downloads"

NODE_VERSION="24.16.0"
GO_VERSION="1.24.1"
MIN_NODE_MAJOR="20"
MIN_GO_VERSION="1.24.1"

BUILD_VERSION="$(tr -d '\r\n' < "${PROJECT_ROOT}/version")"
BUILD_DATE="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
LDFLAGS="-w -s -X github.com/onlyLTY/dockerCopilot/internal/config.Version=${BUILD_VERSION} -X github.com/onlyLTY/dockerCopilot/internal/config.BuildDate=${BUILD_DATE}"

export CGO_ENABLED=0

log() {
  printf '\033[1;34m[INFO]\033[0m %s\n' "$*"
}

success() {
  printf '\033[1;32m[ OK ]\033[0m %s\n' "$*"
}

warn() {
  printf '\033[1;33m[WARN]\033[0m %s\n' "$*"
}

error() {
  printf '\033[1;31m[ERR ]\033[0m %s\n' "$*" >&2
}

die() {
  error "$*"
  exit 1
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

version_ge() {
  local current="$1"
  local required="$2"
  [[ "$(printf '%s\n%s\n' "$required" "$current" | sort -V | head -n1)" == "$required" ]]
}

run_apt() {
  if [[ ${EUID} -eq 0 ]]; then
    apt-get "$@"
  elif command_exists sudo; then
    sudo apt-get "$@"
  else
    die "需要 root 或 sudo 才能自动安装 Debian 依赖"
  fi
}

ensure_base_packages() {
  command_exists apt-get || die "当前环境不是 Debian/Ubuntu 系 apt 环境，无法自动补齐依赖"

  local packages=(ca-certificates curl git build-essential xz-utils tar)
  local missing=()

  for pkg in "${packages[@]}"; do
    if ! dpkg -s "$pkg" >/dev/null 2>&1; then
      missing+=("$pkg")
    fi
  done

  if (( ${#missing[@]} > 0 )); then
    log "安装缺失系统依赖: ${missing[*]}"
    run_apt update
    run_apt install -y "${missing[@]}"
  else
    success "Debian 基础依赖已齐全"
  fi
}

detect_host_arch() {
  case "$(uname -m)" in
    x86_64|amd64)
      HOST_NODE_ARCH="x64"
      HOST_GO_ARCH="amd64"
      ;;
    aarch64|arm64)
      HOST_NODE_ARCH="arm64"
      HOST_GO_ARCH="arm64"
      ;;
    *)
      die "暂不支持当前主机架构: $(uname -m)"
      ;;
  esac
}

ensure_local_node() {
  mkdir -p "$DOWNLOAD_DIR"

  if command_exists node && command_exists npm; then
    local node_version_raw node_major
    node_version_raw="$(node -v | sed 's/^v//')"
    node_major="${node_version_raw%%.*}"
    if [[ "$node_major" =~ ^[0-9]+$ ]] && (( node_major >= MIN_NODE_MAJOR )); then
      success "复用系统 Node.js v${node_version_raw}"
      return
    fi
    warn "系统 Node.js 版本过低(v${node_version_raw})，将使用本地 Node.js ${NODE_VERSION}"
  fi

  local node_dir="${TOOLS_DIR}/node-v${NODE_VERSION}-linux-${HOST_NODE_ARCH}"
  local node_archive="${DOWNLOAD_DIR}/node-v${NODE_VERSION}-linux-${HOST_NODE_ARCH}.tar.xz"
  local node_url="https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${HOST_NODE_ARCH}.tar.xz"

  if [[ ! -x "${node_dir}/bin/node" ]]; then
    log "下载 Node.js ${NODE_VERSION} (${HOST_NODE_ARCH})"
    rm -rf "$node_dir"
    curl -fL "$node_url" -o "$node_archive"
    tar -xJf "$node_archive" -C "$TOOLS_DIR"
  fi

  export PATH="${node_dir}/bin:${PATH}"
  success "已启用本地 Node.js: $(node -v)"
}

ensure_local_go() {
  mkdir -p "$DOWNLOAD_DIR"

  if command_exists go; then
    local go_version_raw
    go_version_raw="$(go env GOVERSION 2>/dev/null | sed 's/^go//')"
    if [[ -n "$go_version_raw" ]] && version_ge "$go_version_raw" "$MIN_GO_VERSION"; then
      success "复用系统 Go ${go_version_raw}"
      return
    fi
    warn "系统 Go 版本过低(${go_version_raw:-unknown})，将使用本地 Go ${GO_VERSION}"
  fi

  local go_root="${TOOLS_DIR}/go"
  local go_bin="${go_root}/go/bin/go"
  local go_archive="${DOWNLOAD_DIR}/go${GO_VERSION}.linux-${HOST_GO_ARCH}.tar.gz"
  local go_url="https://go.dev/dl/go${GO_VERSION}.linux-${HOST_GO_ARCH}.tar.gz"

  if [[ ! -x "$go_bin" ]]; then
    log "下载 Go ${GO_VERSION} (${HOST_GO_ARCH})"
    rm -rf "$go_root"
    mkdir -p "$go_root"
    curl -fL "$go_url" -o "$go_archive"
    tar -xzf "$go_archive" -C "$go_root"
  fi

  export PATH="${go_root}/go/bin:${PATH}"
  success "已启用本地 Go: $(go version)"
}

install_frontend_dependencies() {
  log "安装 PC 前端依赖"
  (cd "$PROJECT_ROOT" && npm ci)

  log "安装移动端前端依赖"
  (cd "$PROJECT_ROOT" && npm --prefix ./web-mobile ci)

  success "前端依赖安装完成"
}

build_frontend() {
  log "开始构建前端（PC + Mobile）"
  (cd "$PROJECT_ROOT" && npm run build:front)
  success "前端构建完成"
}

choose_target() {
  printf '\n请选择要构建的二进制目标：\n'
  printf '  1) Windows amd64 EXE\n'
  printf '  2) Linux amd64\n'
  printf '  3) Linux arm64\n\n'

  while true; do
    read -r -p '请输入选项 [1/2/3]: ' BUILD_CHOICE
    case "$BUILD_CHOICE" in
      1)
        TARGET_GOOS="windows"
        TARGET_GOARCH="amd64"
        TARGET_NAME="dockerCopilot.exe"
        TARGET_DIR="${PROJECT_ROOT}/release/windows/amd64"
        break
        ;;
      2)
        TARGET_GOOS="linux"
        TARGET_GOARCH="amd64"
        TARGET_NAME="dockerCopilot"
        TARGET_DIR="${PROJECT_ROOT}/release/linux/amd64"
        break
        ;;
      3)
        TARGET_GOOS="linux"
        TARGET_GOARCH="arm64"
        TARGET_NAME="dockerCopilot"
        TARGET_DIR="${PROJECT_ROOT}/release/linux/arm64"
        break
        ;;
      *)
        warn "无效选项，请重新输入 1、2 或 3"
        ;;
    esac
  done
}

build_binary() {
  mkdir -p "$TARGET_DIR"
  local output_path="${TARGET_DIR}/${TARGET_NAME}"

  log "开始构建 ${TARGET_GOOS}/${TARGET_GOARCH} 二进制"
  (
    cd "$PROJECT_ROOT"
    GOOS="$TARGET_GOOS" GOARCH="$TARGET_GOARCH" \
      go build -a --trimpath -ldflags="$LDFLAGS" -o "$output_path" .
  )

  success "二进制构建完成: $output_path"
}

print_summary() {
  printf '\n构建完成：\n'
  printf '  版本号: %s\n' "$BUILD_VERSION"
  printf '  构建时间(UTC): %s\n' "$BUILD_DATE"
  printf '  PC 前端目录: %s\n' "${PROJECT_ROOT}/front/pc"
  printf '  Mobile 前端目录: %s\n' "${PROJECT_ROOT}/front/mobile"
  printf '  二进制文件: %s/%s\n\n' "$TARGET_DIR" "$TARGET_NAME"
}

main() {
  log "项目根目录: $PROJECT_ROOT"
  ensure_base_packages
  detect_host_arch
  ensure_local_node
  ensure_local_go
  install_frontend_dependencies
  choose_target
  build_frontend
  build_binary
  print_summary
}

main "$@"
