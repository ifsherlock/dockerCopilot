package telegram

import (
	"strings"
	"testing"
	"time"

	"github.com/mymmrac/telego"
)

func TestUpdateSessionKeepsCollidingShortIDsSeparate(t *testing.T) {
	store := newUpdateSessionStore(time.Minute)
	items := []containerView{
		{ID: "abcdef123456000000000001", Name: "web"},
		{ID: "abcdef123456000000000002", Name: "db"},
	}
	session := store.put(100, "local", items)

	got, err := store.get(100, session.ID)
	if err != nil {
		t.Fatalf("get() error = %v", err)
	}
	if got.Items[0].ID == got.Items[1].ID || got.Items[0].ID[:12] != got.Items[1].ID[:12] {
		t.Fatalf("test fixture does not contain colliding short IDs: %#v", got.Items)
	}
	if got.Items[1].ID != "abcdef123456000000000002" {
		t.Fatalf("second item ID = %q, want exact second container", got.Items[1].ID)
	}
}

func TestUpdateSessionRejectsWrongChatAndExpiredSession(t *testing.T) {
	store := newUpdateSessionStore(10 * time.Millisecond)
	session := store.put(100, "local", []containerView{{ID: "c1", Name: "web"}})

	if _, err := store.get(200, session.ID); err == nil || !strings.Contains(err.Error(), "当前聊天") {
		t.Fatalf("wrong chat error = %v, want current chat rejection", err)
	}
	time.Sleep(20 * time.Millisecond)
	if _, err := store.get(100, session.ID); err == nil || !strings.Contains(err.Error(), "已更新") {
		t.Fatalf("expired session error = %v, want stale/expired rejection", err)
	}
}

func TestUpdateSessionCallbackDataLengthAndParse(t *testing.T) {
	sessionID := "abcdefghijkl"
	for _, data := range []string{
		updateSessionCallbackData(sessionID, "item", 123),
		updateSessionPageCallbackData(sessionID, 12),
		updateSessionAllCallbackData(sessionID),
		updateSessionRunAllCallbackData(sessionID),
	} {
		if len(data) > 64 {
			t.Fatalf("callback data too long: %q len=%d", data, len(data))
		}
		if _, ok := parseUpdateSessionCallback(data); !ok {
			t.Fatalf("parseUpdateSessionCallback(%q) failed", data)
		}
	}
}

func TestUpdateInstanceCallbackUsesStableShortToken(t *testing.T) {
	data := updateInstanceCallbackData("nas-ubuntu-production-with-a-very-long-name")
	if len(data) > 64 {
		t.Fatalf("callback data too long: %q len=%d", data, len(data))
	}
	token := strings.TrimPrefix(data, "updates_instance:")
	instances := []instanceConfig{
		{Name: "local", Local: true},
		{Name: "nas-ubuntu-production-with-a-very-long-name"},
	}
	got, ok := findUpdateInstanceByToken(instances, token)
	if !ok || got.Name != instances[1].Name {
		t.Fatalf("resolved instance = %#v, ok=%v", got, ok)
	}
	if updateInstanceToken("NAS-Ubuntu-Production-With-A-Very-Long-Name") != token {
		t.Fatal("instance token should be case-insensitive and stable")
	}
}

func TestConfirmSingleUpdateUsesSessionSnapshotAndReturnButton(t *testing.T) {
	r := &Runtime{}
	session := updateSession{
		ID:           "abcdefghijkl",
		InstanceName: "local",
		Items: []containerView{{
			ID:          "container-1",
			Name:        "web",
			UsingImage:  "nginx:latest",
			CreateImage: "nginx:latest",
		}},
	}

	text, markup := r.renderConfirmSingleUpdate(session, 0)
	if !strings.Contains(text, "确认更新容器") || !strings.Contains(text, "web") || !strings.Contains(text, "nginx:latest") {
		t.Fatalf("confirm text missing expected details: %s", text)
	}
	data := collectCallbackData(markup)
	if !containsString(data, updateSessionCallbackData(session.ID, "confirm_item", 0)) {
		t.Fatalf("confirm callbacks = %#v, want confirm_item callback", data)
	}
	if !containsString(data, updateSessionPageCallbackData(session.ID, 0)) {
		t.Fatalf("confirm callbacks = %#v, want return-to-list callback", data)
	}
}

func TestConfirmBatchUpdateShowsCountsAndRunAllCallback(t *testing.T) {
	r := &Runtime{}
	session := updateSession{
		ID:           "abcdefghijkl",
		InstanceName: "local",
		Items: []containerView{
			{ID: "c1", Name: "web", UsingImage: "nginx:latest"},
			{ID: "c2", Name: "db", UsingImage: "redis:latest", UpdateBlocked: true},
			{ID: "c3", Name: "api", UsingImage: "app:latest"},
		},
	}

	text, markup := r.renderConfirmBatchUpdate(session)
	if !strings.Contains(text, "确认批量更新") || !strings.Contains(text, "将更新: <b>2</b>") || !strings.Contains(text, "跳过/黑名单: <b>1</b>") {
		t.Fatalf("batch confirm text missing counts: %s", text)
	}
	data := collectCallbackData(markup)
	if !containsString(data, updateSessionRunAllCallbackData(session.ID)) {
		t.Fatalf("batch callbacks = %#v, want run_all callback", data)
	}
	if !containsString(data, updateSessionPageCallbackData(session.ID, 0)) {
		t.Fatalf("batch callbacks = %#v, want return-to-list callback", data)
	}
}

func TestRenderUpdatesPageUsesSessionCallbacks(t *testing.T) {
	r := &Runtime{updateSessions: newUpdateSessionStore(time.Minute)}
	_, markup := r.renderUpdatesPage(100, []containerView{
		{ID: "abcdef123456000000000001", Name: "web", UsingImage: "nginx:latest", Status: "running"},
		{ID: "abcdef123456000000000002", Name: "db", UsingImage: "redis:latest", Status: "running"},
	}, "local", 0)
	if markup == nil {
		t.Fatal("markup = nil, want inline keyboard")
	}
	for _, row := range markup.InlineKeyboard {
		for _, button := range row {
			data := button.CallbackData
			if data == "" {
				continue
			}
			if strings.HasPrefix(data, "update_pick:") || strings.HasPrefix(data, "updates_update_all:") || strings.HasPrefix(data, "updates_page:") {
				t.Fatalf("legacy update callback found: %q", data)
			}
			if strings.HasPrefix(data, "upd:") && len(data) > 64 {
				t.Fatalf("session callback too long: %q len=%d", data, len(data))
			}
		}
	}
}

func collectCallbackData(markup *telego.InlineKeyboardMarkup) []string {
	if markup == nil {
		return nil
	}
	data := make([]string, 0)
	for _, row := range markup.InlineKeyboard {
		for _, button := range row {
			if button.CallbackData != "" {
				data = append(data, button.CallbackData)
			}
		}
	}
	return data
}

func containsString(items []string, target string) bool {
	for _, item := range items {
		if item == target {
			return true
		}
	}
	return false
}
