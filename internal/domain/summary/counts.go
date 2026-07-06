package summary

import (
	"strings"

	"github.com/onlyLTY/dockerCopilot/internal/domain/blacklist"
	"github.com/onlyLTY/dockerCopilot/internal/domain/inventory"
	"github.com/onlyLTY/dockerCopilot/internal/domain/updatecheck"
)

type ImageStateReader interface {
	GetImage(imageID string) (updatecheck.ImageState, bool)
}

func ContainerCounts(containers []inventory.Container, updates ImageStateReader, matcher blacklist.Matcher) ResourceCounts {
	counts := ResourceCounts{Total: len(containers)}
	for _, container := range containers {
		switch strings.ToLower(strings.TrimSpace(container.State)) {
		case "running":
			counts.Running++
		case "exited", "created", "dead":
			counts.Stopped++
		case "paused":
			counts.Paused++
		default:
			if strings.TrimSpace(container.State) != "" {
				counts.Error++
			}
		}
		hasUpdate := false
		if updates != nil {
			if state, ok := updates.GetImage(container.ImageID); ok && state.Status == updatecheck.StatusUpdateAvailable {
				hasUpdate = true
			}
		}
		if hasUpdate && matcher.MatchContainerUpdate(container.Name, container.UsingImage, container.CreatedImageRef).Matched {
			counts.Ignored++
			continue
		}
		if hasUpdate {
			counts.UpdateAvailable++
		}
	}
	return counts
}

func ImageCounts(images []inventory.Image, updates ImageStateReader, matcher blacklist.Matcher) ResourceCounts {
	counts := ResourceCounts{Total: len(images)}
	for _, image := range images {
		counts.Used += boolToInt(image.InUsed)
		counts.Unused += boolToInt(!image.InUsed)
		if image.CleanupReason == "dangling" {
			counts.Dangling++
		}
		hasUpdate := false
		if updates != nil {
			if state, ok := updates.GetImage(image.ID); ok && state.Status == updatecheck.StatusUpdateAvailable {
				hasUpdate = true
			}
		}
		if hasUpdate && ImageIgnored(image, matcher).Matched {
			counts.Ignored++
			continue
		}
		if hasUpdate {
			counts.UpdateAvailable++
		}
	}
	return counts
}

func ContainerIgnored(container inventory.Container, matcher blacklist.Matcher) blacklist.MatchResult {
	return matcher.MatchContainerUpdate(container.Name, container.UsingImage, container.CreatedImageRef)
}

func ImageIgnored(image inventory.Image, matcher blacklist.Matcher) blacklist.MatchResult {
	if result := matcher.Match(blacklist.Target{Scope: blacklist.ScopeImage, ImageRef: primaryImageRef(image)}); result.Matched {
		return result
	}
	for _, ref := range image.RepoTags {
		if result := matcher.Match(blacklist.Target{Scope: blacklist.ScopeImage, ImageRef: ref}); result.Matched {
			return result
		}
	}
	for _, ref := range image.RepoDigests {
		if result := matcher.Match(blacklist.Target{Scope: blacklist.ScopeImage, ImageRef: ref}); result.Matched {
			return result
		}
	}
	return blacklist.MatchResult{}
}

func primaryImageRef(image inventory.Image) string {
	if image.Name == "" || image.Name == "None" || image.Name == "<none>" {
		return ""
	}
	if image.Tag == "" || image.Tag == "None" || image.Tag == "<none>" {
		return image.Name
	}
	return image.Name + ":" + image.Tag
}

func boolToInt(v bool) int {
	if v {
		return 1
	}
	return 0
}
