package qqbot

import (
	"testing"

	"github.com/onlyLTY/dockerCopilot/internal/svc"
)

func TestNotificationTargetsPreferExplicitTargets(t *testing.T) {
	cfg := svc.BackupRuntimeConfig{QQBot: map[string]interface{}{
		"notify_targets":        []string{"user:user-1", "group:group-1", "user:user-1"},
		"allowed_user_openids":  []string{"user-2"},
		"allowed_group_openids": []string{"group-2"},
	}}

	targets := notificationTargets(cfg)
	if len(targets) != 2 {
		t.Fatalf("targets = %#v, want two explicit targets", targets)
	}
	if targets[0] != (notifyTarget{Kind: "user", OpenID: "user-1"}) || targets[1] != (notifyTarget{Kind: "group", OpenID: "group-1"}) {
		t.Fatalf("targets = %#v", targets)
	}
}

func TestNotificationTargetsFallbackToAllowlists(t *testing.T) {
	cfg := svc.BackupRuntimeConfig{QQBot: map[string]interface{}{
		"allowed_user_openids":  []string{"user-1"},
		"allowed_group_openids": []string{"group-1"},
	}}

	targets := notificationTargets(cfg)
	if len(targets) != 2 {
		t.Fatalf("targets = %#v, want two fallback targets", targets)
	}
	if targets[0].Kind != "user" || targets[0].OpenID != "user-1" || targets[1].Kind != "group" || targets[1].OpenID != "group-1" {
		t.Fatalf("targets = %#v", targets)
	}
}

func TestNotifyItemsFromUpdateItemsNormalizesRefs(t *testing.T) {
	items := notifyItemsFromUpdateItems([]ContainerUpdateItem{{
		Name:        "web",
		UsingImage:  "nginx:\nlatest",
		CreateImage: "nginx:latest",
	}})
	if len(items) != 1 || items[0].ImageRef != "nginx: latest" {
		t.Fatalf("items = %#v", items)
	}
}
