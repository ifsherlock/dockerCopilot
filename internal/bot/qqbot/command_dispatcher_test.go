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
	images              ImageSummary
	backups             BackupSummary
	version             VersionSummary
	updates             []ContainerUpdateItem
	checkUpdatesCalled  bool
	backupJSONCalled    bool
	backupComposeCalled bool
	cleanImagesCalled   bool
	started             []string
}

func (a *fakeActions) Status(ctx context.Context) (StatusSummary, error) {
	return a.status, nil
}

func (a *fakeActions) Containers(ctx context.Context) ([]ContainerInfoLite, error) {
	return append([]ContainerInfoLite(nil), a.containers...), nil
}

func (a *fakeActions) Images(ctx context.Context) (ImageSummary, error) {
	return a.images, nil
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
	for _, want := range []string{"/containers", "/images", "/backups", "/backup_compose", "/version"} {
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
	actions := &fakeActions{containers: []ContainerInfoLite{{Name: "api", Status: "running", Image: "nginx:latest", HaveUpdate: true}}}
	dispatcher := NewCommandDispatcher(Config{}, sender, actions)
	err := dispatcher.Dispatch(context.Background(), IncomingCommand{Kind: CommandKindMessage, UserOpenID: "user-1", Content: "/containers"})
	if err != nil {
		t.Fatalf("Dispatch() error = %v", err)
	}
	if len(sender.c2c) != 1 || !strings.Contains(sender.c2c[0].Text, "api") || !strings.Contains(sender.c2c[0].Text, "可更新") {
		t.Fatalf("containers reply = %#v", sender.c2c)
	}
}

func TestImagesBackupsAndVersionCommandsRenderSummaries(t *testing.T) {
	sender := &fakeQQSender{}
	actions := &fakeActions{
		images:  ImageSummary{Total: 5, InUse: 3, Unused: 2, Updatable: 1},
		backups: BackupSummary{Files: []string{"backup-2026-07-06.json"}},
		version: VersionSummary{LocalVersion: "2.1.25", BuildDate: "2026-07-06", RemoteVersion: "2.1.25", RemoteStatus: "程序无更新"},
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
	if !strings.Contains(sender.c2c[0].Text, "总数: 5") || !strings.Contains(sender.c2c[1].Text, "backup-2026-07-06.json") || !strings.Contains(sender.c2c[2].Text, "2.1.25") {
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
	if len(sender.c2c) != 4 || !strings.Contains(sender.c2c[0].Text, "稍后发送 /updates") {
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
	if !strings.Contains(sender.c2c[0].Text, "可更新容器：2 个") {
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
		containers: []ContainerInfoLite{{Name: "api", Status: "running", Image: "nginx:latest"}},
		images:     ImageSummary{Total: 2, InUse: 1, Unused: 1},
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
	if !strings.Contains(sender.c2c[0].Text, "按钮已失效") || !strings.Contains(sender.c2c[0].Text, "DockerCopilot QQ 官方机器人") {
		t.Fatalf("stale reply = %q, want stale reason and home menu", sender.c2c[0].Text)
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
