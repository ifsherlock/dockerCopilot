package qqbot

import (
	"fmt"
	"strings"
	"time"

	"github.com/onlyLTY/dockerCopilot/internal/domain/runtimeconfig"
)

const maxRecentIdentities = 20

type RecentIdentity struct {
	Kind      string `json:"kind"`
	OpenID    string `json:"openid"`
	Label     string `json:"label,omitempty"`
	EventType string `json:"event_type,omitempty"`
	LastSeen  string `json:"last_seen"`
}

func recordRecentIdentity(cmd IncomingCommand) error {
	if cmd.UserOpenID == "" && cmd.GroupOpenID == "" {
		return nil
	}
	store := runtimeconfig.NewStore("", "")
	cfg, err := store.Read()
	if err != nil {
		return fmt.Errorf("读取 QQBot 最近入站身份配置失败: %w", err)
	}
	cfg.QQBot["recent_identities"] = mergeRecentIdentities(cfg.QQBot["recent_identities"], identitiesFromCommand(cmd), time.Now().UTC())
	if err := store.Write(cfg); err != nil {
		return fmt.Errorf("写入 QQBot 最近入站身份配置失败: %w", err)
	}
	return nil
}

func identitiesFromCommand(cmd IncomingCommand) []RecentIdentity {
	items := make([]RecentIdentity, 0, 2)
	if groupID := strings.TrimSpace(cmd.GroupOpenID); groupID != "" {
		items = append(items, RecentIdentity{
			Kind:      "group",
			OpenID:    groupID,
			Label:     "群聊",
			EventType: cmd.EventType,
		})
	}
	if userID := strings.TrimSpace(cmd.UserOpenID); userID != "" {
		items = append(items, RecentIdentity{
			Kind:      "user",
			OpenID:    userID,
			Label:     "用户",
			EventType: cmd.EventType,
		})
	}
	return items
}

func mergeRecentIdentities(existing interface{}, incoming []RecentIdentity, now time.Time) []map[string]interface{} {
	result := recentIdentityMaps(existing)
	seenAt := now.Format(time.RFC3339)
	for _, item := range incoming {
		kind := strings.TrimSpace(item.Kind)
		openID := strings.TrimSpace(item.OpenID)
		if kind == "" || openID == "" {
			continue
		}
		next := map[string]interface{}{
			"kind":       kind,
			"openid":     openID,
			"label":      strings.TrimSpace(item.Label),
			"event_type": strings.TrimSpace(item.EventType),
			"last_seen":  seenAt,
		}
		result = prependUniqueRecentIdentity(result, next)
	}
	if len(result) > maxRecentIdentities {
		return result[:maxRecentIdentities]
	}
	return result
}

func recentIdentityMaps(value interface{}) []map[string]interface{} {
	raw, ok := value.([]map[string]interface{})
	if ok {
		return cloneRecentIdentityMaps(raw)
	}
	list, ok := value.([]interface{})
	if !ok {
		return []map[string]interface{}{}
	}
	result := make([]map[string]interface{}, 0, len(list))
	for _, item := range list {
		if m, ok := item.(map[string]interface{}); ok {
			result = append(result, cloneRecentIdentityMap(m))
		}
	}
	return result
}

func cloneRecentIdentityMaps(items []map[string]interface{}) []map[string]interface{} {
	result := make([]map[string]interface{}, 0, len(items))
	for _, item := range items {
		result = append(result, cloneRecentIdentityMap(item))
	}
	return result
}

func cloneRecentIdentityMap(item map[string]interface{}) map[string]interface{} {
	clone := make(map[string]interface{}, len(item))
	for key, value := range item {
		clone[key] = value
	}
	return clone
}

func prependUniqueRecentIdentity(items []map[string]interface{}, next map[string]interface{}) []map[string]interface{} {
	kind := stringField(next, "kind")
	openID := stringField(next, "openid")
	result := []map[string]interface{}{next}
	for _, item := range items {
		if stringField(item, "kind") == kind && stringField(item, "openid") == openID {
			continue
		}
		result = append(result, item)
	}
	return result
}

func stringField(item map[string]interface{}, key string) string {
	if item == nil {
		return ""
	}
	value, ok := item[key].(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(value)
}
