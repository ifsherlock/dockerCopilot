package inventory

import (
	"fmt"
	"sort"
	"strings"
	"time"

	dockerImage "github.com/docker/docker/api/types/image"
)

func ImagesFromDocker(items []dockerImage.Summary, containers []Container) []Image {
	used := make(map[string]bool, len(containers))
	running := make(map[string]bool, len(containers))
	for _, container := range containers {
		if container.ImageID == "" {
			continue
		}
		used[container.ImageID] = true
		if container.IsRunning {
			running[container.ImageID] = true
		}
	}
	out := make([]Image, 0, len(items))
	for _, item := range items {
		out = append(out, ImageFromDocker(item, used[item.ID], running[item.ID]))
	}
	return out
}

func ImageFromDocker(item dockerImage.Summary, inUsed bool, running bool) Image {
	name, tag := PrimaryImageNameAndTag(item.RepoTags, item.RepoDigests)
	image := Image{
		ID:          item.ID,
		Name:        name,
		Tag:         tag,
		RepoTags:    append([]string(nil), item.RepoTags...),
		RepoDigests: append([]string(nil), item.RepoDigests...),
		Size:        item.Size,
		CreatedAt:   time.Unix(item.Created, 0),
		InUsed:      inUsed,
		MultiRef:    countMeaningfulRefs(item.RepoTags) > 1,
	}
	switch {
	case running:
		image.UsageState = "running"
	case inUsed:
		image.UsageState = "stopped"
	default:
		image.UsageState = "unused"
	}
	tagValue := strings.TrimSpace(strings.ToLower(image.Tag))
	noTag := tagValue == "" || tagValue == "none" || tagValue == "<none>"
	switch {
	case image.InUsed:
		image.CleanupCandidate = false
		if image.UsageState == "stopped" {
			image.CleanupReason = "in_use_stopped"
		} else {
			image.CleanupReason = "in_use_running"
		}
	case noTag:
		image.CleanupCandidate = true
		image.CleanupReason = "dangling"
	default:
		image.CleanupCandidate = true
		if image.MultiRef {
			image.CleanupReason = "unused_multi_ref"
		} else {
			image.CleanupReason = "unused"
		}
	}
	return image
}

func PrimaryImageNameAndTag(repoTags []string, repoDigests []string) (string, string) {
	bestTag := choosePreferredRepoTag(repoTags)
	if bestTag != "" {
		parts := strings.SplitN(bestTag, ":", 2)
		name := strings.TrimSpace(parts[0])
		tag := "None"
		if len(parts) > 1 && strings.TrimSpace(parts[1]) != "" {
			tag = strings.TrimSpace(parts[1])
		}
		if name == "" {
			name = "None"
		}
		return name, tag
	}
	for _, digest := range repoDigests {
		digest = strings.TrimSpace(digest)
		if digest == "" || strings.Contains(digest, "<none>") {
			continue
		}
		return strings.Split(digest, "@")[0], "None"
	}
	return "None", "None"
}

func SizeFormat(size int64) string {
	if size >= 1024*1024*1024 {
		return fmt.Sprintf("%d Gb", size/1024/1024/1024)
	}
	return fmt.Sprintf("%d Mb", size/1024/1024)
}

func choosePreferredRepoTag(repoTags []string) string {
	if len(repoTags) == 0 {
		return ""
	}
	candidates := make([]string, 0, len(repoTags))
	for _, tag := range repoTags {
		tag = strings.TrimSpace(tag)
		lower := strings.ToLower(tag)
		if tag == "" || lower == "<none>:<none>" || lower == "none:none" {
			continue
		}
		candidates = append(candidates, tag)
	}
	if len(candidates) == 0 {
		return ""
	}
	sort.SliceStable(candidates, func(i, j int) bool {
		a := strings.ToLower(candidates[i])
		b := strings.ToLower(candidates[j])
		aScore := preferredRepoTagScore(a)
		bScore := preferredRepoTagScore(b)
		if aScore != bScore {
			return aScore < bScore
		}
		return a < b
	})
	return candidates[0]
}

func preferredRepoTagScore(tag string) int {
	score := 100
	if strings.Contains(tag, "/") {
		score -= 10
	}
	if strings.Contains(tag, ":latest") {
		score -= 20
	}
	if strings.Contains(tag, "docker.io/") || strings.HasPrefix(tag, "library/") {
		score += 10
	}
	if strings.Contains(tag, "sha256") {
		score += 40
	}
	return score
}

func countMeaningfulRefs(repoTags []string) int {
	seen := map[string]struct{}{}
	count := 0
	for _, tag := range repoTags {
		t := strings.TrimSpace(strings.ToLower(tag))
		if t == "" || t == "<none>:<none>" || t == "none:none" {
			continue
		}
		if _, ok := seen[t]; ok {
			continue
		}
		seen[t] = struct{}{}
		count++
	}
	return count
}
