// Package automation 是后台自动化任务的统一调度中心。
//
// 它独立于任何 Bot 与 HTTP 请求运行，负责三类任务：
//  1. 定时更新检测：周期性检测本机容器镜像是否有新版本，结果写入 UpdateStore
//     （前端 / Bot 均只读该缓存），并通过 botnotify 广播“发现新可更新容器”事件；
//  2. 自动清理镜像：按 cron 清理可安全删除的镜像（悬空 / 未使用旧镜像）；
//  3. 自动更新容器：按 cron 自动更新检测到新版本且未被黑名单忽略的容器。
//
// 通知带持久化指纹去重：只有当出现“上次通知之后新增的可更新容器”时才推送，
// 服务重启、前端刷新都不会造成重复推送。
package automation

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/onlyLTY/dockerCopilot/internal/domain/botnotify"
	"github.com/onlyLTY/dockerCopilot/internal/domain/inventory"
	"github.com/onlyLTY/dockerCopilot/internal/domain/summary"
	"github.com/onlyLTY/dockerCopilot/internal/domain/updatecheck"
	"github.com/onlyLTY/dockerCopilot/internal/logic/updateview"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"github.com/onlyLTY/dockerCopilot/internal/types"
	"github.com/onlyLTY/dockerCopilot/internal/utiles"
	"github.com/robfig/cron/v3"
	"github.com/zeromicro/go-zero/core/logx"
)

const (
	defaultUpdateCheckCron = "*/30 * * * *"
	notifyStateFile        = "update_notify_state.json"
)

type Scheduler struct {
	svcCtx *svc.ServiceContext

	mu   sync.Mutex // 保护 cron 重建
	cron *cron.Cron

	jobMu sync.Mutex // 串行化检测 / 清理 / 更新任务，避免互相打架

	notifyMu    sync.Mutex
	notified    map[string]time.Time // 已通知的可更新项 key -> 通知时间
	notifyReady bool
}

var (
	defaultMu        sync.Mutex
	defaultScheduler *Scheduler
)

// Init 创建默认调度器、挂载到 svc 的重载钩子并立即加载配置。
// 随后延迟数秒做一次启动检测，让前端和 Bot 尽快拿到最新更新状态。
func Init(ctx context.Context, svcCtx *svc.ServiceContext) *Scheduler {
	s := &Scheduler{svcCtx: svcCtx}
	defaultMu.Lock()
	defaultScheduler = s
	defaultMu.Unlock()
	svc.SetAutomationReloader(s.Reload)
	if err := s.Reload(); err != nil {
		logx.Errorf("加载自动化调度配置失败: %v", err)
	}
	go func() {
		select {
		case <-ctx.Done():
			return
		case <-time.After(20 * time.Second):
		}
		warmCtx, cancel := context.WithTimeout(ctx, 15*time.Minute)
		defer cancel()
		if _, err := s.RunUpdateCheck(warmCtx, true); err != nil {
			logx.Errorf("启动预热更新检测失败: %v", err)
		}
	}()
	return s
}

// Default 返回 Init 创建的默认调度器，未初始化时为 nil。
func Default() *Scheduler {
	defaultMu.Lock()
	defer defaultMu.Unlock()
	return defaultScheduler
}

// Reload 按最新运行时配置重建全部自动化 cron 任务。
func (s *Scheduler) Reload() error {
	cfg, err := svc.LoadRuntimeConfigForRead()
	if err != nil {
		return err
	}
	tg := cfg.Telegram

	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cron != nil {
		s.cron.Stop()
	}
	c := cron.New(cron.WithParser(cron.NewParser(
		cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow,
	)))

	loaded := []string{}

	checkSpec := strings.TrimSpace(svc.AsString(tg["update_check_cron"], defaultUpdateCheckCron))
	if checkSpec == "" {
		checkSpec = defaultUpdateCheckCron
	}
	if !cronDisabled(checkSpec) {
		if _, err := c.AddFunc(checkSpec, func() {
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
			defer cancel()
			if _, err := s.RunUpdateCheck(ctx, true); err != nil {
				logx.Errorf("定时更新检测失败: %v", err)
			}
		}); err != nil {
			logx.Errorf("解析更新检测 cron [%s] 失败，本轮跳过该任务: %v", checkSpec, err)
		} else {
			loaded = append(loaded, "更新检测["+checkSpec+"]")
		}
	}

	if svc.AsBool(tg["auto_clean_images"]) {
		spec := strings.TrimSpace(svc.AsString(tg["clean_images_cron"], "3 2 * * *"))
		if spec != "" && !cronDisabled(spec) {
			if _, err := c.AddFunc(spec, func() {
				ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
				defer cancel()
				if err := s.RunCleanImages(ctx); err != nil {
					logx.Errorf("自动清理镜像失败: %v", err)
				}
			}); err != nil {
				logx.Errorf("解析自动清理镜像 cron [%s] 失败，本轮跳过该任务: %v", spec, err)
			} else {
				loaded = append(loaded, "自动清理镜像["+spec+"]")
			}
		}
	}

	if svc.AsBool(tg["auto_update_containers"]) {
		spec := strings.TrimSpace(svc.AsString(tg["update_containers_cron"], "0 */6 * * *"))
		if spec != "" && !cronDisabled(spec) {
			if _, err := c.AddFunc(spec, func() {
				ctx, cancel := context.WithTimeout(context.Background(), 2*time.Hour)
				defer cancel()
				if err := s.RunUpdateContainers(ctx); err != nil {
					logx.Errorf("自动更新容器失败: %v", err)
				}
			}); err != nil {
				logx.Errorf("解析自动更新容器 cron [%s] 失败，本轮跳过该任务: %v", spec, err)
			} else {
				loaded = append(loaded, "自动更新容器["+spec+"]")
			}
		}
	}

	c.Start()
	s.cron = c
	if len(loaded) == 0 {
		logx.Infof("自动化调度器已加载: 无启用任务")
	} else {
		logx.Infof("自动化调度器已加载: %s", strings.Join(loaded, " "))
	}
	return nil
}

func cronDisabled(spec string) bool {
	switch strings.ToLower(strings.TrimSpace(spec)) {
	case "off", "false", "no", "none", "disabled", "0":
		return true
	}
	return false
}

// updatableContainer 是一次检测后得到的可更新容器视图。
type updatableContainer struct {
	Container inventory.Container
	Ignored   bool
}

// RunUpdateCheck 同步执行一次本机容器更新检测并刷新 UpdateStore。
// notify 为 true 时，还会扫描远端实例，并对“新增的可更新容器”做去重广播。
// 返回本机发现的（未被忽略的）可更新容器数量。
func (s *Scheduler) RunUpdateCheck(ctx context.Context, notify bool) (int, error) {
	s.jobMu.Lock()
	defer s.jobMu.Unlock()
	updatable, err := s.detectUpdatable(ctx)
	if err != nil {
		return 0, err
	}
	active := make([]inventory.Container, 0, len(updatable))
	for _, item := range updatable {
		if !item.Ignored {
			active = append(active, item.Container)
		}
	}
	logx.Infof("更新检测完成: 可更新=%d (含忽略=%d)", len(active), len(updatable)-len(active))
	if notify {
		candidatesByInstance := map[string][]updateCandidate{
			"local": localCandidates(active),
		}
		if cfg, cfgErr := svc.LoadRuntimeConfigForRead(); cfgErr == nil {
			itemsBy, keysBy, _ := sweepRemoteInstances(ctx, cfg)
			for instance, items := range itemsBy {
				keys := keysBy[instance]
				pairs := make([]updateCandidate, 0, len(items))
				for i := range items {
					if i < len(keys) {
						pairs = append(pairs, updateCandidate{Key: keys[i], Item: items[i]})
					}
				}
				candidatesByInstance[instance] = pairs
			}
		}
		s.notifyNewUpdates(ctx, candidatesByInstance)
	}
	return len(active), nil
}

// updateCandidate 把一个可更新项和它的去重键绑定在一起。
type updateCandidate struct {
	Key  string
	Item botnotify.UpdatableItem
}

func localCandidates(active []inventory.Container) []updateCandidate {
	out := make([]updateCandidate, 0, len(active))
	for _, c := range active {
		image := c.CreatedImageRef
		if image == "" {
			image = c.UsingImage
		}
		out = append(out, updateCandidate{
			Key:  instanceKey("local", c.Name+"@"+c.ImageID),
			Item: botnotify.UpdatableItem{Name: c.Name, Image: image},
		})
	}
	return out
}

// detectUpdatable 拉取容器快照、逐个访问 registry 刷新更新状态，返回可更新容器列表。
func (s *Scheduler) detectUpdatable(ctx context.Context) ([]updatableContainer, error) {
	// 与前端触发的检测互斥：若已有检测在跑，等它结束后直接复用结果。
	if s.svcCtx.TryStartUpdateCheck(0) {
		snapshot, err := updateview.BuildContainerSnapshot(ctx, s.svcCtx)
		if err != nil {
			s.svcCtx.FinishUpdateCheck()
			return nil, err
		}
		checkList := make([]types.Container, 0, len(snapshot.DockerContainers))
		for _, item := range snapshot.DockerContainers {
			checkList = append(checkList, types.Container{Container: item})
		}
		utiles.CheckImageUpdate(s.svcCtx, checkList)
		s.svcCtx.FinishUpdateCheck()
		return collectUpdatable(s.svcCtx, snapshot), nil
	}

	if !s.waitUpdateCheckDone(ctx, 5*time.Minute) {
		return nil, fmt.Errorf("已有更新检测长时间未结束，放弃本轮检测")
	}
	snapshot, err := updateview.BuildContainerSnapshot(ctx, s.svcCtx)
	if err != nil {
		return nil, err
	}
	return collectUpdatable(s.svcCtx, snapshot), nil
}

func (s *Scheduler) waitUpdateCheckDone(ctx context.Context, maxWait time.Duration) bool {
	deadline := time.Now().Add(maxWait)
	for time.Now().Before(deadline) {
		if !s.svcCtx.IsUpdateCheckRunning() {
			return true
		}
		select {
		case <-ctx.Done():
			return false
		case <-time.After(2 * time.Second):
		}
	}
	return !s.svcCtx.IsUpdateCheckRunning()
}

func collectUpdatable(svcCtx *svc.ServiceContext, snapshot updateview.Snapshot) []updatableContainer {
	out := []updatableContainer{}
	for _, item := range snapshot.Inventory.Containers {
		state, _ := updateview.UpdateState(svcCtx.UpdateStore, item.ImageID)
		if state.Status != updatecheck.StatusUpdateAvailable {
			continue
		}
		match := summary.ContainerIgnored(item, snapshot.Matcher)
		out = append(out, updatableContainer{Container: item, Ignored: match.Matched})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Container.Name < out[j].Container.Name })
	return out
}

// ---- 通知去重 ----

type notifyStateFileData struct {
	Items map[string]time.Time `json:"items"`
}

func (s *Scheduler) loadNotifyStateLocked() {
	if s.notifyReady {
		return
	}
	s.notified = map[string]time.Time{}
	s.notifyReady = true
	b, err := os.ReadFile(svc.RuntimeStateFile(notifyStateFile))
	if err != nil {
		return
	}
	var data notifyStateFileData
	if err := json.Unmarshal(b, &data); err != nil {
		return
	}
	if data.Items != nil {
		s.notified = data.Items
	}
}

func (s *Scheduler) persistNotifyStateLocked() {
	path := svc.RuntimeStateFile(notifyStateFile)
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return
	}
	b, err := json.Marshal(notifyStateFileData{Items: s.notified})
	if err != nil {
		return
	}
	_ = os.WriteFile(path, b, 0644)
}

// notifyNewUpdates 只对上次通知之后新增的可更新项广播事件。
// 对每个“本轮成功扫描”的实例：清掉已消失的旧键（容器已更新/删除后，
// 未来再出现新版本会重新提醒）；未扫描/扫描失败的实例保留旧状态，避免误重推。
func (s *Scheduler) notifyNewUpdates(ctx context.Context, candidatesByInstance map[string][]updateCandidate) {
	now := time.Now()
	freshByInstance := map[string][]botnotify.UpdatableItem{}

	s.notifyMu.Lock()
	s.loadNotifyStateLocked()
	for instance, candidates := range candidatesByInstance {
		current := make(map[string]bool, len(candidates))
		for _, c := range candidates {
			current[c.Key] = true
		}
		prefix := instance + "/"
		for key := range s.notified {
			if strings.HasPrefix(key, prefix) && !current[key] {
				delete(s.notified, key)
			}
		}
		for _, c := range candidates {
			if _, ok := s.notified[c.Key]; ok {
				continue
			}
			s.notified[c.Key] = now
			freshByInstance[instance] = append(freshByInstance[instance], c.Item)
		}
	}
	s.persistNotifyStateLocked()
	s.notifyMu.Unlock()

	if !botnotify.HasNotifier() {
		return
	}
	for instance, fresh := range freshByInstance {
		if len(fresh) == 0 {
			continue
		}
		sort.Slice(fresh, func(i, j int) bool { return fresh[i].Name < fresh[j].Name })
		s.svcCtx.AddOperationLog("automation", "检测到新的可更新容器", fmt.Sprintf("%s: %d 个", instance, len(fresh)))
		botnotify.BroadcastUpdates(ctx, botnotify.UpdatesEvent{Instance: instance, Items: fresh, At: now})
	}
}

// ---- 自动清理镜像 ----

// RunCleanImages 清理本机所有可安全删除的镜像（悬空/未使用旧镜像），
// 结果写入操作日志并广播给各 Bot。
func (s *Scheduler) RunCleanImages(ctx context.Context) error {
	s.jobMu.Lock()
	defer s.jobMu.Unlock()
	s.svcCtx.AddOperationLog("automation", "自动清理镜像开始", "")
	snapshot, err := updateview.BuildImageSnapshot(ctx, s.svcCtx)
	if err != nil {
		s.svcCtx.AddOperationLog("automation", "自动清理镜像失败", err.Error())
		botnotify.BroadcastAutomation(ctx, botnotify.AutomationEvent{Kind: botnotify.KindCleanImages, Err: err.Error()})
		return err
	}
	ok, failed := 0, 0
	details := []string{}
	for _, img := range snapshot.Inventory.Images {
		if !img.CleanupCandidate {
			continue
		}
		name := imageDisplayName(img)
		if err := utiles.RemoveImage(s.svcCtx, img.ID, false); err != nil {
			failed++
			details = append(details, fmt.Sprintf("❌ %s: %s", name, err.Error()))
			continue
		}
		ok++
		details = append(details, fmt.Sprintf("✅ %s (%s)", name, inventory.SizeFormat(img.Size)))
	}
	s.svcCtx.AddOperationLog("automation", "自动清理镜像完成", fmt.Sprintf("成功 %d 失败 %d", ok, failed))
	logx.Infof("自动清理镜像完成: 成功=%d 失败=%d", ok, failed)
	if ok > 0 || failed > 0 {
		botnotify.BroadcastAutomation(ctx, botnotify.AutomationEvent{
			Kind: botnotify.KindCleanImages, OK: ok, Failed: failed, Details: details,
		})
	}
	return nil
}

func imageDisplayName(img inventory.Image) string {
	name := img.Name
	tag := strings.ToLower(strings.TrimSpace(img.Tag))
	if img.Tag != "" && tag != "none" && tag != "<none>" {
		name += ":" + img.Tag
	}
	if name == "" || name == ":" {
		name = img.ID
	}
	return name
}

// ---- 自动更新容器 ----

// RunUpdateContainers 先做一次检测，然后逐个更新所有可更新且未被忽略的容器。
// DockerCopilot 自身容器不参与自动更新（避免更新过程中断其它容器的更新）。
func (s *Scheduler) RunUpdateContainers(ctx context.Context) error {
	s.jobMu.Lock()
	updatable, err := s.detectUpdatable(ctx)
	if err != nil {
		s.jobMu.Unlock()
		s.svcCtx.AddOperationLog("automation", "自动更新容器失败", "检测更新失败: "+err.Error())
		botnotify.BroadcastAutomation(ctx, botnotify.AutomationEvent{Kind: botnotify.KindUpdateContainers, Err: err.Error()})
		return err
	}

	targets := []inventory.Container{}
	skippedSelf := false
	for _, item := range updatable {
		if item.Ignored {
			continue
		}
		if item.Container.IsSelf {
			skippedSelf = true
			continue
		}
		targets = append(targets, item.Container)
	}
	if len(targets) == 0 {
		s.jobMu.Unlock()
		if skippedSelf {
			s.svcCtx.AddOperationLog("automation", "自动更新容器跳过", "仅 DockerCopilot 自身有更新，请手动更新程序")
		}
		logx.Infof("自动更新容器: 无需要更新的容器 (跳过自身=%v)", skippedSelf)
		return nil
	}

	s.svcCtx.AddOperationLog("automation", "自动更新容器开始", fmt.Sprintf("%d 个", len(targets)))
	ok, failed := 0, 0
	details := []string{}
	delOldContainer := os.Getenv("DelOldContainer") != "false"
	for _, c := range targets {
		select {
		case <-ctx.Done():
			failed++
			details = append(details, fmt.Sprintf("❌ %s: 任务超时中止", c.Name))
			s.jobMu.Unlock()
			s.finishAutoUpdate(ctx, ok, failed, details, skippedSelf)
			return ctx.Err()
		default:
		}
		image := utiles.ResolveContainerUpdateImage(s.svcCtx, c.ID, c.CreatedImageRef)
		taskID := uuid.New().String()
		err := func() (err error) {
			defer func() {
				if r := recover(); r != nil {
					err = fmt.Errorf("更新过程异常: %v", r)
				}
			}()
			return utiles.UpdateContainer(s.svcCtx, c.ID, c.Name, image, delOldContainer, taskID)
		}()
		if err != nil {
			failed++
			details = append(details, fmt.Sprintf("❌ %s: %s", c.Name, err.Error()))
			continue
		}
		ok++
		details = append(details, fmt.Sprintf("✅ %s → %s", c.Name, image))
	}
	s.jobMu.Unlock()
	s.finishAutoUpdate(ctx, ok, failed, details, skippedSelf)
	return nil
}

func (s *Scheduler) finishAutoUpdate(ctx context.Context, ok int, failed int, details []string, skippedSelf bool) {
	if skippedSelf {
		details = append(details, "ℹ️ DockerCopilot 自身有更新，需手动更新程序")
	}
	s.svcCtx.AddOperationLog("automation", "自动更新容器完成", fmt.Sprintf("成功 %d 失败 %d", ok, failed))
	logx.Infof("自动更新容器完成: 成功=%d 失败=%d", ok, failed)
	botnotify.BroadcastAutomation(ctx, botnotify.AutomationEvent{
		Kind: botnotify.KindUpdateContainers, OK: ok, Failed: failed, Details: details,
	})
	// 更新完成后按最新状态清理本机的通知记录：已消失的项被移除，
	// 之后若这些容器再次出现新版本会重新提醒。
	if updatable, err := s.detectUpdatable(ctx); err == nil {
		active := make([]inventory.Container, 0, len(updatable))
		for _, item := range updatable {
			if !item.Ignored {
				active = append(active, item.Container)
			}
		}
		current := map[string]bool{}
		for _, c := range localCandidates(active) {
			current[c.Key] = true
		}
		s.notifyMu.Lock()
		s.loadNotifyStateLocked()
		for key := range s.notified {
			if strings.HasPrefix(key, "local/") && !current[key] {
				delete(s.notified, key)
			}
		}
		s.persistNotifyStateLocked()
		s.notifyMu.Unlock()
	}
}
