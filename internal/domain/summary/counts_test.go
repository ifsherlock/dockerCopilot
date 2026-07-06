package summary

import (
	"testing"

	"github.com/onlyLTY/dockerCopilot/internal/domain/blacklist"
	"github.com/onlyLTY/dockerCopilot/internal/domain/inventory"
	"github.com/onlyLTY/dockerCopilot/internal/domain/updatecheck"
)

type fakeImageStates map[string]updatecheck.ImageState

func (s fakeImageStates) GetImage(imageID string) (updatecheck.ImageState, bool) {
	state, ok := s[imageID]
	return state, ok
}

func TestContainerCountsExcludesIgnoredUpdates(t *testing.T) {
	containers := []inventory.Container{
		{ID: "c1", Name: "web", State: "running", UsingImage: "nginx:latest", CreatedImageRef: "nginx:latest", ImageID: "img-web"},
		{ID: "c2", Name: "db", State: "exited", UsingImage: "postgres:16", CreatedImageRef: "postgres:16", ImageID: "img-db"},
		{ID: "c3", Name: "paused", State: "paused", UsingImage: "redis:7", CreatedImageRef: "redis:7", ImageID: "img-redis"},
		{ID: "c4", Name: "bad", State: "weird", UsingImage: "bad:latest", CreatedImageRef: "bad:latest", ImageID: "img-bad"},
	}
	updates := fakeImageStates{
		"img-web": {Status: updatecheck.StatusUpdateAvailable},
		"img-db":  {Status: updatecheck.StatusUpdateAvailable},
		"img-bad": {Status: updatecheck.StatusUpdateAvailable},
	}
	matcher := blacklist.NewMatcher(blacklist.FromLegacyStrings([]string{"postgres:16"}))

	got := ContainerCounts(containers, updates, matcher)
	if got.Total != 4 || got.Running != 1 || got.Stopped != 1 || got.Paused != 1 || got.Error != 1 {
		t.Fatalf("state counts = %#v", got)
	}
	if got.Ignored != 1 {
		t.Fatalf("ignored = %d, want 1", got.Ignored)
	}
	if got.UpdateAvailable != 2 {
		t.Fatalf("update available = %d, want 2", got.UpdateAvailable)
	}
}

func TestImageCountsExcludesIgnoredUpdates(t *testing.T) {
	images := []inventory.Image{
		{ID: "img-web", Name: "nginx", Tag: "latest", InUsed: true},
		{ID: "img-db", Name: "postgres", Tag: "16", InUsed: false},
		{ID: "img-dangling", Name: "None", Tag: "None", CleanupReason: "dangling"},
	}
	updates := fakeImageStates{
		"img-web": {Status: updatecheck.StatusUpdateAvailable},
		"img-db":  {Status: updatecheck.StatusUpdateAvailable},
	}
	matcher := blacklist.NewMatcher(blacklist.FromLegacyStrings([]string{"postgres:16"}))

	got := ImageCounts(images, updates, matcher)
	if got.Total != 3 || got.Used != 1 || got.Unused != 2 || got.Dangling != 1 {
		t.Fatalf("image counts = %#v", got)
	}
	if got.Ignored != 1 {
		t.Fatalf("ignored = %d, want 1", got.Ignored)
	}
	if got.UpdateAvailable != 1 {
		t.Fatalf("update available = %d, want 1", got.UpdateAvailable)
	}
}

func TestImageCountsMatchesAnyRepoTagForIgnoredUpdates(t *testing.T) {
	images := []inventory.Image{
		{
			ID:       "img-multi",
			Name:     "example/app",
			Tag:      "stable",
			RepoTags: []string{"example/app:stable", "mirror/app:latest"},
		},
	}
	updates := fakeImageStates{
		"img-multi": {Status: updatecheck.StatusUpdateAvailable},
	}
	matcher := blacklist.NewMatcher(blacklist.FromLegacyStrings([]string{"mirror/app:latest"}))

	got := ImageCounts(images, updates, matcher)
	if got.Ignored != 1 {
		t.Fatalf("ignored = %d, want 1", got.Ignored)
	}
	if got.UpdateAvailable != 0 {
		t.Fatalf("update available = %d, want 0", got.UpdateAvailable)
	}
}
