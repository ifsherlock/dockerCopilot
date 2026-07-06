# 更新状态与前端拆分架构

本文记录 DockerCopilot 当前的更新检测、黑名单统计和前端拆包边界。后续改动应优先维护这些边界，而不是在页面、Bot 或概览里各自重新计算更新状态。

## 后端分层

后端按事实来源和展示口径分层：

```text
Docker API / Registry / runtime config
          |
          v
internal/domain/inventory
          |
          +--> internal/domain/updatecheck ---> ServiceContext.UpdateStore
          |
          +--> internal/domain/blacklist
          |
          v
internal/domain/summary
          |
          +--> /api/containers
          +--> /api/images
          +--> /api/overview
          +--> Telegram /updates
```

- `internal/domain/updatecheck` 拥有更新状态枚举、镜像更新缓存、程序更新状态、registry manifest / digest 比较语义。
- `ServiceContext.UpdateStore` 是运行期更新状态的唯一内存事实来源；旧的 `GetHubImageUpdate`、`SetHubImageUpdate` 等方法只作为兼容包装存在，不能再引入第二套 map 缓存。
- `internal/domain/inventory` 负责把 Docker 容器和镜像转换成后端统一快照。
- `internal/domain/summary` 负责概览、容器、镜像统计口径，统计时接收 `UpdateStore` 和 `blacklist.Matcher`。
- `internal/domain/blacklist` 负责黑名单规则归一化、旧 `[]string` 兼容、scope/match 语义和命中判断。
- `internal/domain/composeproject` 负责 Compose 项目读写、状态补全、docker run / container 转 compose、CLI 执行和 SDK fallback；`internal/utiles/resources.go` 只保留资源概览、网络、卷、日志、商店包装和兼容入口。

## 更新状态语义

更新状态统一使用 `updatecheck.Status`：

```text
unknown | checking | up_to_date | update_available | ignored | unsupported | check_failed
```

程序自身更新和容器镜像更新是两个信号：

- `ProgramUpdateState` 表示 DockerCopilot 二进制版本、构建日期、远端版本和程序更新状态。
- `ImageState` 表示镜像 digest 检测结果，容器页和镜像页继续保留兼容字段 `haveUpdate` / `Update`，但展示状态应优先使用 `updateKind` 和 `updateStatus`。
- 自身容器镜像落后时使用 `updateKind=self_container_image`；程序版本落后时使用 `/api/version` 返回的 `hasProgramUpdate` 和 `programUpdateStatus`。
- registry 检测失败必须进入 `check_failed` 或 `unsupported`，不能静默当成无更新。

更新检测入口：

- `/api/containers/check-update` 触发后台检测，并通过 `UpdateStore` 记录结果。
- 容器列表和镜像列表读取同一个 `UpdateStore`，必要时只触发带冷却时间的后台刷新。
- TG `/updates` 会先触发或复用近期检测，等待短时间后读取同一容器快照；如果实时检测超过等待阈值，先展示缓存结果和缓存年龄，再在后台检测完成后编辑消息。

## 黑名单和统计口径

黑名单现在只有一个匹配入口：`blacklist.Matcher`。

- 旧配置 `telegram.update_blacklist: []string` 仍兼容；读入后由 `blacklist.FromLegacyStrings` 转成结构化规则。
- 容器更新忽略使用 `Matcher.MatchContainerUpdate(containerName, usingImage, createdImageRef)`。
- 镜像更新忽略使用 `summary.ImageIgnored`，会检查主镜像 ref、RepoTags 和 RepoDigests。
- 概览、容器页、镜像页、TG 更新列表必须使用后端返回的 ignored / updateStatus 语义；前端可以做筛选和展示，但不能自建第二套黑名单统计口径。
- `summary.ContainerCounts` 和 `summary.ImageCounts` 是概览统计的后端口径；新增统计数字时应优先扩展这里，而不是在 `resources.go` 或页面组件中重复计算。

## 前端拆分约束

PC 前端通过 `React.lazy` 和 `Suspense` 做页面级拆包：

- `src/App.jsx` 只同步加载应用壳、导航、认证、主题和轻量全局状态；业务页面通过 `src/app/routes/*Page.jsx` lazy 加载。
- 容器工作区在 `src/features/containers/ContainerWorkspace.jsx` 内按 `list`、`compose`、`new` 子页 lazy 加载。
- 日志页在 `src/features/logs/LogsPage.jsx` 内按日志面板 lazy 加载。
- 业务页面 chunk 应保持可审查；若 `npm run build:pc` 再次出现 Vite 500 kB chunk 警告，先拆页面、modal、表格或日志查看器，再考虑 `manualChunks`。
- 不允许只提高 `chunkSizeWarningLimit` 来隐藏问题。

移动端入口：

- `web-mobile/app/page.tsx` 是 7 行 route shell，只渲染 `features/mobile/MobileDashboardPage`。
- 移动端数据和程序更新分别由 `useMobileDashboardData`、`useMobileProgramUpdate` 管理。
- `features/mobile/views/*` 只负责视图展示，不直接创建新的请求缓存或重复更新检测逻辑。

## 维护规则

- 新增 API 字段时保持旧字段兼容，但新增展示逻辑应优先读取结构化状态字段。
- 新增更新统计时先确认它属于容器、镜像、程序还是 Compose 项目，不要复用 `haveUpdate` 表达不同含义。
- 新增黑名单能力时先扩展 `blacklist.Rule` / `Matcher`，再让 Web、Mobile、TG 共用。
- 新增资源概览能力时优先放到对应 domain 包；`internal/utiles/resources.go` 不再承接 store、summary、inventory、updatecheck 或 Compose 的新职责。
- 新增 PC 页面或重型面板时默认 lazy，首屏不应同步 import 非当前页面的业务模块。
