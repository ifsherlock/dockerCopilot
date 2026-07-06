package blacklist

import (
	"reflect"
	"testing"
)

func TestNormalizeLegacyStringsDeduplicatesDockerHubAliases(t *testing.T) {
	got := NormalizeLegacyStrings([]string{
		" nginx ",
		"nginx:latest",
		"docker.io/library/nginx",
		"registry-1.docker.io/library/nginx:latest",
		"https://docker.io/library/nginx:latest",
		"",
	})
	want := []string{"nginx:latest"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("NormalizeLegacyStrings() = %#v, want %#v", got, want)
	}
}

func TestLegacyStringsFromInterface(t *testing.T) {
	tests := []struct {
		name string
		in   interface{}
		want []string
	}{
		{name: "string slice", in: []string{"nginx", "docker.io/library/nginx:latest"}, want: []string{"nginx:latest"}},
		{name: "interface slice", in: []interface{}{"redis", 123, ""}, want: []string{"redis:latest", "123:latest"}},
		{name: "comma and newline string", in: "nginx, redis\nalpine", want: []string{"nginx:latest", "redis:latest", "alpine:latest"}},
		{name: "unsupported", in: map[string]string{"nginx": "latest"}, want: []string{}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := LegacyStringsFromInterface(tt.in); !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("LegacyStringsFromInterface() = %#v, want %#v", got, tt.want)
			}
		})
	}
}

func TestFromLegacyStringsBuildsScopedRules(t *testing.T) {
	got := FromLegacyStrings([]string{"docker.io/library/nginx:latest", "nginx"})
	want := []Rule{
		{Scope: ScopeContainer, Match: MatchExact, Key: "library/nginx:latest", Enabled: true},
		{Scope: ScopeContainer, Match: MatchExact, Key: "nginx", Enabled: true},
		{Scope: ScopeImage, Match: MatchRepo, Key: "library/nginx", Enabled: true},
		{Scope: ScopeImage, Match: MatchTag, Key: "nginx:latest", Enabled: true},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("FromLegacyStrings() = %#v, want %#v", got, want)
	}
}

func TestMatcherDoesNotMatchImageTailAgainstContainerName(t *testing.T) {
	matcher := NewMatcher([]Rule{{Scope: ScopeImage, Match: MatchRepo, Key: "media-server", Enabled: true}})
	got := matcher.Match(Target{
		Scope:           ScopeContainer,
		ContainerName:   "nginx",
		ImageRef:        "ghcr.io/example/media-server:latest",
		CreatedImageRef: "ghcr.io/example/media-server:latest",
	})
	if got.Matched {
		t.Fatalf("container target matched image rule: %#v", got)
	}
}

func TestMatchContainerUpdateSeparatesContainerAndImageScopes(t *testing.T) {
	matcher := NewMatcher(FromLegacyStrings([]string{"docker.io/library/nginx:latest"}))

	if !matcher.MatchContainerUpdate("nginx", "ghcr.io/example/other:latest", "ghcr.io/example/other:latest").Matched {
		t.Fatal("expected legacy nginx item to match nginx container name")
	}
	tailOnlyMatcher := NewMatcher(FromLegacyStrings([]string{"media-server"}))
	if tailOnlyMatcher.MatchContainerUpdate("nginx", "ghcr.io/example/media-server:latest", "ghcr.io/example/media-server:latest").Matched {
		t.Fatal("image tail media-server should not block container target nginx through container scope")
	}
	imageMatcher := NewMatcher(FromLegacyStrings([]string{"ghcr.io/example/media-server:latest"}))
	if !imageMatcher.Match(Target{Scope: ScopeImage, ImageRef: "ghcr.io/example/media-server:latest"}).Matched {
		t.Fatal("expected image scope media-server rule to match image target")
	}
}

func TestMatcherMatchesContainerNameAndImageAliases(t *testing.T) {
	matcher := NewMatcher([]Rule{
		{Scope: ScopeContainer, Match: MatchExact, Key: "nginx", Enabled: true},
		{Scope: ScopeImage, Match: MatchRepo, Key: "library/nginx", Enabled: true},
		{Scope: ScopeImage, Match: MatchTag, Key: "docker.io/library/redis:7", Enabled: true},
	})

	if !matcher.Match(Target{Scope: ScopeContainer, ContainerName: "nginx"}).Matched {
		t.Fatal("expected exact container rule to match")
	}
	if !matcher.Match(Target{Scope: ScopeImage, ImageRef: "docker.io/library/nginx:latest"}).Matched {
		t.Fatal("expected image repo rule to match docker hub alias")
	}
	if !matcher.Match(Target{Scope: ScopeImage, ImageRef: "redis:7"}).Matched {
		t.Fatal("expected image tag rule to match normalized docker hub tag")
	}
}

func TestMatcherIgnoresDisabledAndDeduplicatesRules(t *testing.T) {
	matcher := NewMatcher([]Rule{
		{Scope: ScopeContainer, Match: MatchExact, Key: "nginx", Enabled: false},
		{Scope: ScopeContainer, Match: MatchExact, Key: " nginx ", Enabled: true},
		{Scope: ScopeContainer, Match: MatchExact, Key: "nginx", Enabled: true},
	})
	if got := matcher.Rules(); len(got) != 1 {
		t.Fatalf("rules = %#v, want one enabled deduplicated rule", got)
	}
}
