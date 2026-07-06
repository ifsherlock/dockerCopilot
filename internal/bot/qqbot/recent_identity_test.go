package qqbot

import (
	"testing"
	"time"
)

func TestMergeRecentIdentitiesDeduplicatesAndPrepends(t *testing.T) {
	now := time.Date(2026, 7, 6, 10, 0, 0, 0, time.UTC)
	existing := []map[string]interface{}{
		{"kind": "user", "openid": "user-1", "last_seen": "old"},
		{"kind": "group", "openid": "group-1", "last_seen": "old"},
	}
	got := mergeRecentIdentities(existing, []RecentIdentity{
		{Kind: "user", OpenID: "user-1", Label: "用户", EventType: EventC2CMessageCreate},
		{Kind: "group", OpenID: "group-2", Label: "群聊", EventType: EventGroupAtMessageCreate},
	}, now)
	if len(got) != 3 {
		t.Fatalf("len = %d, want 3", len(got))
	}
	if got[0]["kind"] != "group" || got[0]["openid"] != "group-2" {
		t.Fatalf("first = %#v, want new group", got[0])
	}
	if got[1]["kind"] != "user" || got[1]["openid"] != "user-1" || got[1]["last_seen"] != now.Format(time.RFC3339) {
		t.Fatalf("second = %#v, want refreshed user", got[1])
	}
}

func TestMergeRecentIdentitiesCapsList(t *testing.T) {
	existing := make([]map[string]interface{}, 0, maxRecentIdentities+5)
	for i := 0; i < maxRecentIdentities+5; i++ {
		existing = append(existing, map[string]interface{}{"kind": "user", "openid": string(rune('a' + i))})
	}
	got := mergeRecentIdentities(existing, []RecentIdentity{{Kind: "user", OpenID: "new"}}, time.Now())
	if len(got) != maxRecentIdentities {
		t.Fatalf("len = %d, want %d", len(got), maxRecentIdentities)
	}
	if got[0]["openid"] != "new" {
		t.Fatalf("first openid = %#v, want new", got[0]["openid"])
	}
}
