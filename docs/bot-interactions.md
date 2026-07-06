# Bot 交互与官方 QQBot 说明

本文说明 DockerCopilot 当前 Bot 交互边界、配置含义和更新检测交互口径。

## Telegram 入站鉴权

Telegram 命令和按钮回调都会先经过统一鉴权策略。

- 配置了 `telegram.chat_ids` 时，只有列表中的聊天可以执行 Bot 命令和按钮回调。
- 未配置 `telegram.chat_ids` 时，为兼容旧部署暂时允许入站命令，但启动日志会提示建议配置白名单。
- `telegram.interactive_enabled=false` 时，写操作会被拒绝，只保留帮助和只读入口。

`chat_ids` 很重要：只要别人能给同一个 Telegram Bot 发消息，理论上就能触发 Bot 入站逻辑。配置 `chat_ids` 后，DockerCopilot 会在命令进入容器、镜像、更新等业务动作前拦住非白名单聊天，避免误操作。

## Telegram 富交互和 Parse Mode

Telegram 默认保持兼容模式：

- `telegram.rich_interactions_enabled=false`
- `telegram.parse_mode=HTML`

开启富交互后，首页、帮助和更新相关消息会使用更紧凑的按钮菜单。`parse_mode` 只支持 `HTML` 和 `MarkdownV2`，未知值会回退到 `HTML`。MarkdownV2 会做必要转义，避免容器名、镜像名中的特殊字符破坏消息格式。

## `/updates` 新机制

`/updates` 不再一直等待实时检测完成。

1. 先尝试短时间等待实时检测。
2. 超时后立即展示当前缓存快照，让用户先看到可操作结果。
3. 后台检测完成后，优先编辑原 `/updates` 消息为最新结果。
4. 单个更新和批量更新都必须先进入确认页，确认后才提交动作。
5. 更新按钮使用稳定 session 快照，不再用容器短 ID 前缀匹配，旧按钮过期后只提示刷新。

如果缓存结果和后台最终结果不一致，默认编辑原消息并更新按钮会话。只有原消息编辑失败、用户已经进入确认/执行流程、或者结果出现高风险突变时，才另发一条短摘要和“查看最新结果”入口，不重复推送完整列表。

## 官方 QQBot 范围

QQ 只做官方 QQBot 模块，基于 QQ Bot API v2。

已支持的第一阶段能力：

- `/start` 或等价文本：帮助和入口说明。
- `/status`：容器概览和可更新数量。
- `/updates`：可更新容器列表。
- 开启按钮能力时，支持单个和批量更新确认回调。
- Gateway 模式下通过官方 WebSocket 长连接接收入站事件，无需公网回调地址。
- 兼容保留 Webhook 路由能力：支持官方回调地址验证、请求签名校验、HTTP ACK 和异步命令分发。

明确不支持：

- OneBot
- NapCat
- Lagrange
- go-cqhttp
- llbot
- 其它第三方 QQ 个人号协议桥

QQBot 配置独立存放在 `qqbot` 命名空间。默认关闭，只有显式开启并配置官方 AppID/AppSecret 后才会启动。AppSecret 在 API 返回和 PC 设置页中会以遮罩形式展示。

当前 QQBot 事件接入默认使用 Gateway/WebSocket 长连接。DockerCopilot 启动后会用 AppID/AppSecret 获取 access token，再调用 QQ 官方 `/gateway` 接口取得 WebSocket 地址，完成 Identify、心跳和事件分发。因此 NAS 内网部署不需要配置公网 Webhook。

`event_mode` 固定保存为 `gateway`，`sandbox` 固定保存为 `false`。Webhook 仍作为内部兼容模式保留路由，但 PC 设置页不展示模式切换，避免把用户不需要理解的传输细节变成配置项。

OpenID 白名单可以先留空跑通入站消息。Gateway 收到已通过鉴权的入站事件后，会在配置里记录最近入站身份；PC 设置页会展示最近的用户 OpenID 和群 OpenID，并提供复制和加入白名单入口。
