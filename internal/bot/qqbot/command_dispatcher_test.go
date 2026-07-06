package qqbot

import (
	"context"
	"strings"
	"testing"
)

type fakeQQSender struct {
	c2c    []Message
	groups []Message
}

func (s *fakeQQSender) SendC2C(ctx context.Context, openID string, msg Message) error {
	s.c2c = append(s.c2c, msg)
	return nil
}

func (s *fakeQQSender) SendGroup(ctx context.Context, groupOpenID string, msg Message) error {
	s.groups = append(s.groups, msg)
	return nil
}

type fakeActions struct {
	status              StatusSummary
	containers          []ContainerInfoLite
	imageList           []ImageInfoLite
	backups             BackupSummary
	version             VersionSummary
	updates             []ContainerUpdateItem
	checkUpdatesCalled  bool
	backupJSONCalled    bool
	backupComposeCalled bool
	cleanImagesCalled   bool
	started             []string
	startedContainers   []string
	stoppedContainers   []string
	restartedContainers []string
	removedImages       []string
}

func (a *fakeActions) Status(ctx context.Context) (StatusSummary, error) {
	return a.status, nil
}

func (a *fakeActions) Containers(ctx context.Context) ([]ContainerInfoLite, error) {
	return append([]ContainerInfoLite(nil), a.containers...), nil
}

func (a *fakeActions) ImageList(ctx context.Context) ([]ImageInfoLite, error) {
	return append([]ImageInfoLite(nil), a.imageList...), nil
}

func (a *fakeActions) Backups(ctx context.Context) (BackupSummary, error) {
	return a.backups, nil
}

func (a *fakeActions) Version(ctx context.Context) (VersionSummary, error) {
	return a.version, nil
}

func (a *fakeActions) Updates(ctx context.Context) ([]ContainerUpdateItem, error) {
	return append([]ContainerUpdateItem(nil), a.updates...), nil
}

func (a *fakeActions) CheckUpdates(ctx context.Context) (string, error) {
	a.checkUpdatesCalled = true
	return "已提交更新检测。", nil
}

func (a *fakeActions) StartContainer(ctx context.Context, item ContainerInfoLite) (string, error) {
	a.startedContainers = append(a.startedContainers, item.Name)
	return "容器已启动", nil
}

func (a *fakeActions) StopContainer(ctx context.Context, item ContainerInfoLite) (string, error) {
	a.stoppedContainers = append(a.stoppedContainers, item.Name)
	return "容器已停止", nil
}

func (a *fakeActions) RestartContainer(ctx context.Context, item ContainerInfoLite) (string, error) {
	a.restartedContainers = append(a.restartedContainers, item.Name)
	return "容器已重启", nil
}

func (a *fakeActions) UpdateContainer(ctx context.Context, item ContainerUpdateItem) (string, error) {
	a.started = append(a.started, item.Name)
	return "task-" + item.Name, nil
}

func (a *fakeActions) BackupJSON(ctx context.Context) error {
	a.backupJSONCalled = true
	return nil
}

func (a *fakeActions) BackupCompose(ctx context.Context) error {
	a.backupComposeCalled = true
	return nil
}

func (a *fakeActions) CleanImages(ctx context.Context) (string, error) {
	a.cleanImagesCalled = true
	return "没有可清理的未使用镜像。", nil
}

func (a *fakeActions) RemoveImage(ctx context.Context, item ImageInfoLite, force bool) (string, error) {
	a.removedImages = append(a.removedImages, imageDisplayName(item))
	return "镜像已删除", nil
}

func TestHelpCommandShowsMigratedMenu(t *testing.T) {
	sender := &fakeQQSender{}
	dispatcher := NewCommandDispatcher(Config{MarkdownEnabled: true, ButtonsEnabled: true}, sender, &fakeActions{})
	err := dispatcher.Dispatch(context.Background(), IncomingCommand{Kind: CommandKindMessage, UserOpenID: "user-1", Content: "/help"})
	if err != nil {
		t.Fatalf("Dispatch() error = %v", err)
	}
	if len(sender.c2c) != 1 {
		t.Fatalf("replies = %#v", sender.c2c)
	}
	for _, want := range []string{"DockerCopilot QQ 官方机器人", "概览", "容器", "镜像", "更新", "备份", "版本"} {
		if !strings.Contains(sender.c2c[0].Text, want) {
			t.Fatalf("help text missing %s: %q", want, sender.c2c[0].Text)
		}
	}
	if sender.c2c[0].Markdown == nil || sender.c2c[0].Keyboard == nil {
		t.Fatalf("help menu should include markdown and keyboard: %#v", sender.c2c[0])
	}
	firstButton := sender.c2c[0].Keyboard.Raw["content"].(map[string]interface{})["rows"].([]interface{})[0].(map[string]interface{})["buttons"].([]interface{})[0].(map[string]interface{})
	action := firstButton["action"].(map[string]interface{})
	permission := action["permission"].(map[string]interface{})
	if action["type"] != 1 || permission["type"] != 2 {
		t.Fatalf("button action = %#v, want callback action with all-user permission", action)
	}
	renderData := firstButton["render_data"].(map[string]interface{})
	if renderData["label"] == "" || renderData["visited_label"] != renderData["label"] {
		t.Fatalf("button render_data = %#v, want stable visited_label", renderData)
	}
}

func TestHelpCommandFallsBackToTextMenuWhenButtonsDisabled(t *testing.T) {
	sender := &fakeQQSender{}
	dispatcher := NewCommandDispatcher(Config{MarkdownEnabled: true, ButtonsEnabled: false}, sender, &fakeActions{})
	err := dispatcher.Dispatch(context.Background(), IncomingCommand{Kind: CommandKindMessage, UserOpenID: "user-1", Content: "/help"})
	if err != nil {
		t.Fatalf("Dispatch() error = %v", err)
	}
	if len(sender.c2c) != 1 || sender.c2c[0].Keyboard != nil || sender.c2c[0].Markdown == nil {
		t.Fatalf("help fallback = %#v, want markdown text without keyboard", sender.c2c)
	}
}

func TestHomeMenuButtonDispatchesCommand(t *testing.T) {
	sender := &fakeQQSender{}
	actions := &fakeActions{status: StatusSummary{Containers: 2, Running: 1, Stopped: 1, UpdateCount: 0}}
	dispatcher := NewCommandDispatcher(Config{MarkdownEnabled: true, ButtonsEnabled: true}, sender, actions)

	err := dispatcher.Dispatch(context.Background(), IncomingCommand{
		Kind:       CommandKindInteraction,
		UserOpenID: "user-1",
		Action:     commandCallbackData("/status"),
	})
	if err != nil {
		t.Fatalf("Dispatch() error = %v", err)
	}
	if len(sender.c2c) != 1 || !strings.Contains(sender.c2c[0].Text, "DockerCopilot 状态") {
		t.Fatalf("button dispatch reply = %#v, want status response", sender.c2c)
	}
}

func TestStatusCommandUsesSharedSummary(t *testing.T) {
	sender := &fakeQQSender{}
	actions := &fakeActions{status: StatusSummary{Containers: 3, Running: 2, Stopped: 1, UpdateCount: 1}}
	dispatcher := NewCommandDispatcher(Config{}, sender, actions)
	err := dispatcher.Dispatch(context.Background(), IncomingCommand{Kind: CommandKindMessage, UserOpenID: "user-1", Content: "/status"})
	if err != nil {
		t.Fatalf("Dispatch() error = %v", err)
	}
	if len(sender.c2c) != 1 || !strings.Contains(sender.c2c[0].Text, "可更新: 1") {
		t.Fatalf("status replies = %#v", sender.c2c)
	}
}

func TestContainersCommandRendersContainerNames(t *testing.T) {
	sender := &fakeQQSender{}
	actions := &fakeActions{containers: []ContainerInfoLite{{ID: "c1", Name: "api", Status: "running", Image: "nginx:latest", HaveUpdate: true}}}
	dispatcher := NewCommandDispatcher(Config{}, sender, actions)
	err := dispatcher.Dispatch(context.Background(), IncomingCommand{Kind: CommandKindMessage, UserOpenID: "user-1", Content: "/containers"})
	if err != nil {
		t.Fatalf("Dispatch() error = %v", err)
	}
	if len(sender.c2c) != 1 || !strings.Contains(sender.c2c[0].Text, "api") || !strings.Contains(sender.c2c[0].Text, "🟢") || !strings.Contains(sender.c2c[0].Text, "↑") {
		t.Fatalf("containers reply = %#v", sender.c2c)
	}
}

func TestImagesBackupsAndVersionCommandsRenderSummaries(t *testing.T) {
	sender := &fakeQQSender{}
	actions := &fakeActions{
		imageList: []ImageInfoLite{{ID: "img1", Name: "nginx", Tag: "latest", Size: "80 MB", InUse: true}},
		backups:   BackupSummary{Files: []string{"backup-2026-07-06.json"}},
		version:   VersionSummary{LocalVersion: "2.1.25", BuildDate: "2026-07-06", RemoteVersion: "2.1.25", RemoteStatus: "程序无更新"},
	}
	dispatcher := NewCommandDispatcher(Config{}, sender, actions)
	ctx := context.Background()
	for _, command := range []string{"/images", "/backups", "/version"} {
		if err := dispatcher.Dispatch(ctx, IncomingCommand{Kind: CommandKindMessage, UserOpenID: "user-1", Content: command}); err != nil {
			t.Fatalf("Dispatch(%s) error = %v", command, err)
		}
	}
	if len(sender.c2c) != 3 {
		t.Fatalf("replies = %#v", sender.c2c)
	}
	if !strings.Contains(sender.c2c[0].Text, "nginx:latest") || !strings.Contains(sender.c2c[1].Text, "backup-2026-07-06.json") || !strings.Contains(sender.c2c[2].Text, "2.1.25") {
		t.Fatalf("summary replies = %#v", sender.c2c)
	}
}

func TestOperationCommandsCallActions(t *testing.T) {
	sender := &fakeQQSender{}
	actions := &fakeActions{}
	dispatcher := NewCommandDispatcher(Config{}, sender, actions)
	ctx := context.Background()
	for _, command := range []string{"/check_updates", "/backup", "/backup_compose", "/clean_images"} {
		if err := dispatcher.Dispatch(ctx, IncomingCommand{Kind: CommandKindMessage, UserOpenID: "user-1", Content: command}); err != nil {
			t.Fatalf("Dispatch(%s) error = %v", command, err)
		}
	}
	if !actions.checkUpdatesCalled || !actions.backupJSONCalled || !actions.backupComposeCalled || !actions.cleanImagesCalled {
		t.Fatalf("actions not called: %#v", actions)
	}
	if len(sender.c2c) != 4 || !strings.Contains(sender.c2c[0].Text, "/updates") || !strings.Contains(sender.c2c[0].Text, "查看结果") {
		t.Fatalf("operation replies = %#v", sender.c2c)
	}
}

func TestUpdatesCommandRendersKeyboardWhenButtonsEnabled(t *testing.T) {
	sender := &fakeQQSender{}
	actions := &fakeActions{updates: []ContainerUpdateItem{
		{ID: "c1", Name: "web", CreateImage: "nginx:latest"},
		{ID: "c2", Name: "db", CreateImage: "postgres:latest"},
	}}
	dispatcher := NewCommandDispatcher(Config{ButtonsEnabled: true, MarkdownEnabled: true}, sender, actions)
	err := dispatcher.Dispatch(context.Background(), IncomingCommand{Kind: CommandKindMessage, UserOpenID: "user-1", Content: "/updates", MessageID: "msg-1"})
	if err != nil {
		t.Fatalf("Dispatch() error = %v", err)
	}
	if len(sender.c2c) != 1 || sender.c2c[0].Keyboard == nil || sender.c2c[0].Markdown == nil {
		t.Fatalf("updates reply = %#v", sender.c2c)
	}
	if !strings.Contains(sender.c2c[0].Text, "**可更新容器** · 2 个") || !strings.Contains(sender.c2c[0].Text, "| # | 容器 | 镜像 |") {
		t.Fatalf("updates text = %q", sender.c2c[0].Text)
	}
}

func TestUpdatesCommandFallsBackWhenButtonsDisabled(t *testing.T) {
	sender := &fakeQQSender{}
	actions := &fakeActions{updates: []ContainerUpdateItem{{ID: "c1", Name: "web", CreateImage: "nginx:latest"}}}
	dispatcher := NewCommandDispatcher(Config{ButtonsEnabled: false}, sender, actions)
	err := dispatcher.Dispatch(context.Background(), IncomingCommand{Kind: CommandKindMessage, UserOpenID: "user-1", Content: "/updates"})
	if err != nil {
		t.Fatalf("Dispatch() error = %v", err)
	}
	if len(sender.c2c) != 1 || sender.c2c[0].Keyboard != nil || !strings.Contains(sender.c2c[0].Text, "按钮未启用") {
		t.Fatalf("fallback reply = %#v", sender.c2c)
	}
}

func TestStatusCommandRendersMarkdownWhenEnabled(t *testing.T) {
	sender := &fakeQQSender{}
	actions := &fakeActions{status: StatusSummary{Containers: 3, Running: 2, Stopped: 1, UpdateCount: 1}}
	dispatcher := NewCommandDispatcher(Config{MarkdownEnabled: true, ButtonsEnabled: true}, sender, actions)
	err := dispatcher.Dispatch(context.Background(), IncomingCommand{Kind: CommandKindMessage, UserOpenID: "user-1", Content: "/status"})
	if err != nil {
		t.Fatalf("Dispatch() error = %v", err)
	}
	if len(sender.c2c) != 1 || sender.c2c[0].Markdown == nil || sender.c2c[0].Keyboard == nil {
		t.Fatalf("status reply = %#v", sender.c2c)
	}
	if sender.c2c[0].Markdown.Content != sender.c2c[0].Text {
		t.Fatalf("markdown content = %q, text = %q", sender.c2c[0].Markdown.Content, sender.c2c[0].Text)
	}
}

func TestSummaryCommandsRenderMarkdownAndButtonsWhenEnabled(t *testing.T) {
	sender := &fakeQQSender{}
	actions := &fakeActions{
		containers: []ContainerInfoLite{{ID: "c1", Name: "api", Status: "running", Image: "nginx:latest"}},
		imageList:  []ImageInfoLite{{ID: "img1", Name: "nginx", Tag: "latest"}},
		backups:    BackupSummary{Files: []string{"a.json"}},
		version:    VersionSummary{LocalVersion: "2.1.25"},
	}
	dispatcher := NewCommandDispatcher(Config{MarkdownEnabled: true, ButtonsEnabled: true}, sender, actions)
	ctx := context.Background()
	for _, command := range []string{"/containers", "/images", "/backups", "/version", "/check_updates", "/clean_images"} {
		if err := dispatcher.Dispatch(ctx, IncomingCommand{Kind: CommandKindMessage, UserOpenID: "user-1", Content: command}); err != nil {
			t.Fatalf("Dispatch(%s) error = %v", command, err)
		}
	}
	if len(sender.c2c) != 6 {
		t.Fatalf("replies = %#v", sender.c2c)
	}
	for i, msg := range sender.c2c {
		if msg.Markdown == nil || msg.Keyboard == nil {
			t.Fatalf("reply[%d] = %#v, want markdown and keyboard", i, msg)
		}
	}
}

func TestInteractionConfirmAndRunUpdate(t *testing.T) {
	sender := &fakeQQSender{}
	actions := &fakeActions{updates: []ContainerUpdateItem{{ID: "c1", Name: "web", CreateImage: "nginx:latest"}}}
	dispatcher := NewCommandDispatcher(Config{ButtonsEnabled: true}, sender, actions)
	ctx := context.Background()
	err := dispatcher.Dispatch(ctx, IncomingCommand{Kind: CommandKindMessage, UserOpenID: "user-1", Content: "/updates"})
	if err != nil {
		t.Fatalf("updates Dispatch() error = %v", err)
	}
	sessionID := firstSessionID(t, dispatcher.sessions)
	err = dispatcher.Dispatch(ctx, IncomingCommand{Kind: CommandKindInteraction, UserOpenID: "user-1", Action: updateCallbackData(sessionID, "confirm_item", 0)})
	if err != nil {
		t.Fatalf("confirm Dispatch() error = %v", err)
	}
	err = dispatcher.Dispatch(ctx, IncomingCommand{Kind: CommandKindInteraction, UserOpenID: "user-1", Action: updateCallbackData(sessionID, "run_item", 0)})
	if err != nil {
		t.Fatalf("run Dispatch() error = %v", err)
	}
	if strings.Join(actions.started, ",") != "web" {
		t.Fatalf("started = %#v, want web", actions.started)
	}
	if len(sender.c2c) != 3 || !strings.Contains(sender.c2c[2].Text, "已提交更新：web") {
		t.Fatalf("interaction replies = %#v", sender.c2c)
	}
}

func TestContainersCommandRendersSelectableListAndActions(t *testing.T) {
	sender := &fakeQQSender{}
	actions := &fakeActions{containers: []ContainerInfoLite{
		{ID: "c1", Name: "api", Status: "running", Image: "nginx:latest"},
		{ID: "c2", Name: "worker", Status: "exited", Image: "alpine:latest"},
		{ID: "c3", Name: "db", Status: "running", Image: "postgres:16"},
		{ID: "c4", Name: "cache", Status: "running", Image: "redis:7"},
		{ID: "c5", Name: "job", Status: "exited", Image: "busybox:latest"},
	}}
	dispatcher := NewCommandDispatcher(Config{ButtonsEnabled: true, MarkdownEnabled: true}, sender, actions)
	ctx := context.Background()

	if err := dispatcher.Dispatch(ctx, IncomingCommand{Kind: CommandKindMessage, UserOpenID: "user-1", Content: "/containers"}); err != nil {
		t.Fatalf("containers Dispatch() error = %v", err)
	}
	if strings.Contains(sender.c2c[0].Text, "[running]") || !strings.Contains(sender.c2c[0].Text, "| # | 状态 | 容器 | 镜像 |") {
		t.Fatalf("containers text = %q, want markdown table with emoji status", sender.c2c[0].Text)
	}
	callbacks := collectQQCallbackData(sender.c2c[0])
	if countCallbacksWithPrefix(callbacks, "ctr:") < 5 {
		t.Fatalf("callbacks = %#v, want more selectable container actions on one page", callbacks)
	}
	detailAction := firstCallbackWithPrefix(callbacks, "ctr:", ":item:")
	if detailAction == "" {
		t.Fatalf("callbacks = %#v, want container item callback", callbacks)
	}

	if err := dispatcher.Dispatch(ctx, IncomingCommand{Kind: CommandKindInteraction, UserOpenID: "user-1", Action: detailAction}); err != nil {
		t.Fatalf("detail Dispatch() error = %v", err)
	}
	if len(sender.c2c) != 2 || !strings.Contains(sender.c2c[1].Text, "容器详情") || !strings.Contains(sender.c2c[1].Text, "api") {
		t.Fatalf("detail reply = %#v", sender.c2c)
	}
	action := firstCallbackWithPrefix(collectQQCallbackData(sender.c2c[1]), "ctr:", ":restart:")
	if action == "" {
		t.Fatalf("detail callbacks = %#v, want restart action", collectQQCallbackData(sender.c2c[1]))
	}
	if err := dispatcher.Dispatch(ctx, IncomingCommand{Kind: CommandKindInteraction, UserOpenID: "user-1", Action: action}); err != nil {
		t.Fatalf("restart Dispatch() error = %v", err)
	}
	if strings.Join(actions.restartedContainers, ",") != "api" {
		t.Fatalf("restartedContainers = %#v, want api", actions.restartedContainers)
	}
}

func TestContainerListPaginatesWithMoreActionCapacity(t *testing.T) {
	sender := &fakeQQSender{}
	actions := &fakeActions{containers: []ContainerInfoLite{
		{ID: "c1", Name: "one", Status: "running"},
		{ID: "c2", Name: "two", Status: "running"},
		{ID: "c3", Name: "three", Status: "running"},
		{ID: "c4", Name: "four", Status: "running"},
		{ID: "c5", Name: "five", Status: "running"},
		{ID: "c6", Name: "six", Status: "running"},
		{ID: "c7", Name: "seven", Status: "running"},
		{ID: "c8", Name: "eight", Status: "running"},
		{ID: "c9", Name: "nine", Status: "running"},
	}}
	dispatcher := NewCommandDispatcher(Config{ButtonsEnabled: true, MarkdownEnabled: true}, sender, actions)
	if err := dispatcher.Dispatch(context.Background(), IncomingCommand{Kind: CommandKindMessage, UserOpenID: "user-1", Content: "/containers"}); err != nil {
		t.Fatalf("containers Dispatch() error = %v", err)
	}
	if !strings.Contains(sender.c2c[0].Text, "第 1/2 页") {
		t.Fatalf("containers text = %q, want pagination", sender.c2c[0].Text)
	}
	callbacks := collectQQCallbackData(sender.c2c[0])
	if countCallbacksWithPrefix(callbacks, "ctr:") < 7 {
		t.Fatalf("callbacks = %#v, want 6 item callbacks plus next page", callbacks)
	}
	if firstCallbackWithPrefix(callbacks, "ctr:", ":page:") == "" {
		t.Fatalf("callbacks = %#v, want page callback", callbacks)
	}
}

func TestImagesCommandRendersSelectableListAndDeleteFlow(t *testing.T) {
	sender := &fakeQQSender{}
	actions := &fakeActions{imageList: []ImageInfoLite{
		{ID: "img1", Name: "busybox", Tag: "latest", Size: "5 MB", CleanupCandidate: true},
		{ID: "img2", Name: "postgres", Tag: "16", Size: "400 MB", InUse: true},
	}}
	dispatcher := NewCommandDispatcher(Config{ButtonsEnabled: true, MarkdownEnabled: true}, sender, actions)
	ctx := context.Background()

	if err := dispatcher.Dispatch(ctx, IncomingCommand{Kind: CommandKindMessage, UserOpenID: "user-1", Content: "/images"}); err != nil {
		t.Fatalf("images Dispatch() error = %v", err)
	}
	if !strings.Contains(sender.c2c[0].Text, "| # | 状态 | 镜像 | 大小 |") || !strings.Contains(sender.c2c[0].Text, "🧹") {
		t.Fatalf("images text = %q, want markdown table with emoji status", sender.c2c[0].Text)
	}
	callbacks := collectQQCallbackData(sender.c2c[0])
	detailAction := firstCallbackWithPrefix(callbacks, "img:", ":item:")
	if detailAction == "" {
		t.Fatalf("callbacks = %#v, want image item callback", callbacks)
	}
	if err := dispatcher.Dispatch(ctx, IncomingCommand{Kind: CommandKindInteraction, UserOpenID: "user-1", Action: detailAction}); err != nil {
		t.Fatalf("image detail Dispatch() error = %v", err)
	}
	if len(sender.c2c) != 2 || !strings.Contains(sender.c2c[1].Text, "镜像详情") || !strings.Contains(sender.c2c[1].Text, "busybox:latest") {
		t.Fatalf("image detail reply = %#v", sender.c2c)
	}
	confirmAction := firstCallbackWithPrefix(collectQQCallbackData(sender.c2c[1]), "img:", ":confirm_delete:")
	if confirmAction == "" {
		t.Fatalf("detail callbacks = %#v, want delete confirm", collectQQCallbackData(sender.c2c[1]))
	}
	if err := dispatcher.Dispatch(ctx, IncomingCommand{Kind: CommandKindInteraction, UserOpenID: "user-1", Action: confirmAction}); err != nil {
		t.Fatalf("delete confirm Dispatch() error = %v", err)
	}
	deleteAction := firstCallbackWithPrefix(collectQQCallbackData(sender.c2c[2]), "img:", ":delete:")
	if deleteAction == "" {
		t.Fatalf("confirm callbacks = %#v, want delete action", collectQQCallbackData(sender.c2c[2]))
	}
	if err := dispatcher.Dispatch(ctx, IncomingCommand{Kind: CommandKindInteraction, UserOpenID: "user-1", Action: deleteAction}); err != nil {
		t.Fatalf("delete Dispatch() error = %v", err)
	}
	if strings.Join(actions.removedImages, ",") != "busybox:latest" {
		t.Fatalf("removedImages = %#v, want busybox:latest", actions.removedImages)
	}
}

func TestInteractionCancelReturnsHomeMenu(t *testing.T) {
	sender := &fakeQQSender{}
	actions := &fakeActions{updates: []ContainerUpdateItem{{ID: "c1", Name: "web", CreateImage: "nginx:latest"}}}
	dispatcher := NewCommandDispatcher(Config{}, sender, actions)
	ctx := context.Background()
	if err := dispatcher.Dispatch(ctx, IncomingCommand{Kind: CommandKindMessage, UserOpenID: "user-1", Content: "/updates"}); err != nil {
		t.Fatalf("updates Dispatch() error = %v", err)
	}
	sessionID := firstSessionID(t, dispatcher.sessions)
	if err := dispatcher.Dispatch(ctx, IncomingCommand{Kind: CommandKindInteraction, UserOpenID: "user-1", Action: updateCallbackData(sessionID, "cancel", -1)}); err != nil {
		t.Fatalf("cancel Dispatch() error = %v", err)
	}
	if len(sender.c2c) != 2 || !strings.Contains(sender.c2c[1].Text, "DockerCopilot QQ 官方机器人") {
		t.Fatalf("cancel replies = %#v", sender.c2c)
	}
	if strings.Contains(sender.c2c[1].Text, "已取消") {
		t.Fatalf("cancel should return home menu without standalone cancel text: %q", sender.c2c[1].Text)
	}
}

func TestStaleInteractionReturnsReasonWithHomeMenu(t *testing.T) {
	sender := &fakeQQSender{}
	dispatcher := NewCommandDispatcher(Config{}, sender, &fakeActions{})

	if err := dispatcher.Dispatch(context.Background(), IncomingCommand{Kind: CommandKindInteraction, UserOpenID: "user-1", Action: "stale"}); err != nil {
		t.Fatalf("stale Dispatch() error = %v", err)
	}
	if len(sender.c2c) != 1 {
		t.Fatalf("replies = %#v", sender.c2c)
	}
	if !strings.Contains(sender.c2c[0].Text, "按钮已失效") || !strings.Contains(sender.c2c[0].Text, "请选择下方按钮重新打开功能") {
		t.Fatalf("stale reply = %q, want stale reason and compact recovery hint", sender.c2c[0].Text)
	}
}

func TestInteractionRouterAckBeforeCommandDispatch(t *testing.T) {
	var events []string
	sender := &fakeQQSender{}
	actions := &fakeActions{}
	dispatcher := NewCommandDispatcher(Config{}, sender, actions)
	router := NewRouter(NewAuthPolicy([]string{"user-1"}, nil), recordingAcker{events: &events}, dispatchRecorder{events: &events, dispatcher: dispatcher})
	err := router.HandleCommand(context.Background(), IncomingCommand{Kind: CommandKindInteraction, UserOpenID: "user-1", Action: "stale"})
	if err != nil {
		t.Fatalf("HandleCommand() error = %v", err)
	}
	if got := joinEvents(events); got != "ack:stale,dispatch:stale" {
		t.Fatalf("events = %s", got)
	}
}

type dispatchRecorder struct {
	events     *[]string
	dispatcher *CommandDispatcher
}

func (d dispatchRecorder) Dispatch(ctx context.Context, cmd IncomingCommand) error {
	*d.events = append(*d.events, "dispatch:"+cmd.Action)
	return d.dispatcher.Dispatch(ctx, cmd)
}

func firstSessionID(t *testing.T, store *updateSessionStore) string {
	t.Helper()
	store.mu.Lock()
	defer store.mu.Unlock()
	for id := range store.sessions {
		return id
	}
	t.Fatal("no session created")
	return ""
}

func collectQQCallbackData(msg Message) []string {
	if msg.Keyboard == nil || msg.Keyboard.Raw == nil {
		return nil
	}
	content, _ := msg.Keyboard.Raw["content"].(map[string]interface{})
	rows, _ := content["rows"].([]interface{})
	var result []string
	for _, row := range rows {
		rowMap, _ := row.(map[string]interface{})
		buttons, _ := rowMap["buttons"].([]interface{})
		for _, rawButton := range buttons {
			buttonMap, _ := rawButton.(map[string]interface{})
			action, _ := buttonMap["action"].(map[string]interface{})
			if data, ok := action["data"].(string); ok {
				result = append(result, data)
			}
		}
	}
	return result
}

func firstCallbackWithPrefix(callbacks []string, prefix string, contains string) string {
	for _, callback := range callbacks {
		if strings.HasPrefix(callback, prefix) && strings.Contains(callback, contains) {
			return callback
		}
	}
	return ""
}

func countCallbacksWithPrefix(callbacks []string, prefix string) int {
	count := 0
	for _, callback := range callbacks {
		if strings.HasPrefix(callback, prefix) {
			count++
		}
	}
	return count
}
