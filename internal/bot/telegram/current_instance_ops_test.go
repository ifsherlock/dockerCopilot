package telegram

import (
	"strings"
	"testing"

	"github.com/onlyLTY/dockerCopilot/internal/domain/blacklist"
)

func TestIsContainerUpdateBlockedDoesNotMatchImageTailAgainstContainerName(t *testing.T) {
	matcher := blacklist.NewMatcher(blacklist.FromLegacyStrings([]string{"media-server"}))
	if isContainerUpdateBlocked(
		"nginx",
		"ghcr.io/example/media-server:latest",
		"ghcr.io/example/media-server:latest",
		matcher,
	) {
		t.Fatalf("container name nginx was blocked by unrelated image tail media-server")
	}
}

func TestIsContainerUpdateBlockedMatchesExactContainerNameAndImageAliases(t *testing.T) {
	if !isContainerUpdateBlocked("nginx", "ghcr.io/example/media-server:latest", "ghcr.io/example/media-server:latest", blacklist.NewMatcher(blacklist.FromLegacyStrings([]string{"nginx"}))) {
		t.Fatalf("expected exact container name blacklist to block")
	}
	if !isContainerUpdateBlocked("web", "docker.io/library/nginx:latest", "docker.io/library/nginx:latest", blacklist.NewMatcher(blacklist.FromLegacyStrings([]string{"library/nginx"}))) {
		t.Fatalf("expected image repository alias blacklist to block")
	}
	if !isContainerUpdateBlocked("web", "docker.io/library/nginx:latest", "docker.io/library/nginx:latest", blacklist.NewMatcher(blacklist.FromLegacyStrings([]string{"library/nginx:latest"}))) {
		t.Fatalf("expected image tag alias blacklist to block")
	}
}

func TestLegacyBlacklistStillSupportsTailContainerName(t *testing.T) {
	matcher := blacklist.NewMatcher(blacklist.FromLegacyStrings([]string{"docker.io/library/nginx:latest"}))
	if !isContainerUpdateBlocked("nginx", "ghcr.io/example/other:latest", "ghcr.io/example/other:latest", matcher) {
		t.Fatal("expected legacy docker hub item to block same tail container name")
	}
}

func TestSelfUpdateConfirmationExplainsRelayRestart(t *testing.T) {
	item := containerView{ID: "self", Name: "dockercopilot", UsingImage: "jaysherlock/dockercopilot:latest", IsSelf: true}
	session := updateSession{InstanceName: "local", Items: []containerView{item}}
	r := &Runtime{}
	text, _ := r.renderConfirmSingleUpdate(session, 0)
	if !strings.Contains(text, "接力容器") || !strings.Contains(text, "短暂重启") {
		t.Fatalf("confirmation text = %q, want relay restart warning", text)
	}
}
