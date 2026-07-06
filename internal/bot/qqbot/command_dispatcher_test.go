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
	status  StatusSummary
	updates []ContainerUpdateItem
	started []string
}

func (a *fakeActions) Status(ctx context.Context) (StatusSummary, error) {
	return a.status, nil
}

func (a *fakeActions) Updates(ctx context.Context) ([]ContainerUpdateItem, error) {
	return append([]ContainerUpdateItem(nil), a.updates...), nil
}

func (a *fakeActions) UpdateContainer(ctx context.Context, item ContainerUpdateItem) (string, error) {
	a.started = append(a.started, item.Name)
	return "task-" + item.Name, nil
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
	dispatcher := NewCommandDispatcher(Config{MarkdownEnabled: true}, sender, actions)
	err := dispatcher.Dispatch(context.Background(), IncomingCommand{Kind: CommandKindMessage, UserOpenID: "user-1", Content: "/status"})
	if err != nil {
		t.Fatalf("Dispatch() error = %v", err)
	}
	if len(sender.c2c) != 1 || sender.c2c[0].Markdown == nil {
		t.Fatalf("status reply = %#v", sender.c2c)
	}
	if sender.c2c[0].Markdown.Content != sender.c2c[0].Text {
		t.Fatalf("markdown content = %q, text = %q", sender.c2c[0].Markdown.Content, sender.c2c[0].Text)
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
