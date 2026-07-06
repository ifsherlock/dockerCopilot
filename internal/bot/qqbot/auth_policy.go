package qqbot

import (
	"fmt"
	"strings"

	"github.com/onlyLTY/dockerCopilot/internal/svc"
)

type AuthPolicy struct {
	allowedUsers  map[string]struct{}
	allowedGroups map[string]struct{}
}

func NewAuthPolicyFromRuntime(cfg svc.BackupRuntimeConfig) AuthPolicy {
	return AuthPolicy{
		allowedUsers:  stringSet(svc.StringList(cfg.QQBot["allowed_user_openids"])),
		allowedGroups: stringSet(svc.StringList(cfg.QQBot["allowed_group_openids"])),
	}
}

func NewAuthPolicy(allowedUsers []string, allowedGroups []string) AuthPolicy {
	return AuthPolicy{
		allowedUsers:  stringSet(allowedUsers),
		allowedGroups: stringSet(allowedGroups),
	}
}

func (p AuthPolicy) Authorize(cmd IncomingCommand) error {
	if cmd.GroupOpenID != "" {
		if len(p.allowedGroups) == 0 {
			return nil
		}
		if _, ok := p.allowedGroups[cmd.GroupOpenID]; ok {
			return nil
		}
		return fmt.Errorf("QQBot 群未授权")
	}
	if len(p.allowedUsers) == 0 {
		return nil
	}
	if _, ok := p.allowedUsers[cmd.UserOpenID]; ok {
		return nil
	}
	return fmt.Errorf("QQBot 用户未授权")
}

func stringSet(values []string) map[string]struct{} {
	set := make(map[string]struct{}, len(values))
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			set[trimmed] = struct{}{}
		}
	}
	return set
}
