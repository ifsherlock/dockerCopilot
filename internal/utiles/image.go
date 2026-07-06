package utiles

import (
	"context"
	"fmt"
	"sort"
	"strings"

	dockerTypes "github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/image"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
	MyType "github.com/onlyLTY/dockerCopilot/internal/types"
	"log"
)

func GetImagesList(ctx *svc.ServiceContext, eagerUpdateCheck bool) ([]MyType.Image, error) {
	var imagesList []MyType.Image
	dockerImages, err := ctx.DockerClient.ImageList(context.Background(), image.ListOptions{})
	if err != nil {
		log.Fatalf("Unable to fetch docker images: %s", err)
	}

	for _, img := range dockerImages {
		i := MyType.Image{
			Summary:          img,
			ImageName:        "",
			ImageTag:         "",
			InUsed:           false,
			UsageState:       "unused",
			HaveUpdate:       false,
			SizeFormat:       "",
			CleanupCandidate: false,
			CleanupReason:    "",
			MultiRef:         false,
		}
		imagesList = append(imagesList, i)
	}
	imagesList = splitImageNameAndTag(calculateImageSize(imagesList))
	if eagerUpdateCheck {
		imagesList = enrichImageUpdateFlags(ctx, imagesList)
	} else {
		for i, imageInfo := range imagesList {
			if cached, ok := ctx.GetHubImageUpdate(imageInfo.ID); ok {
				imagesList[i].HaveUpdate = cached
			}
		}
	}
	imagesList, err = enrichImageCleanupFlags(ctx, imagesList)
	if err != nil {
		return imagesList, err
	}
	return imagesList, nil
}

func splitImageNameAndTag(imagesList []MyType.Image) []MyType.Image {
	for i, imageInfo := range imagesList {
		name, tag := primaryImageNameAndTag(imageInfo.RepoTags, imageInfo.RepoDigests)
		imagesList[i].ImageName = name
		imagesList[i].ImageTag = tag
	}
	return imagesList
}

func primaryImageNameAndTag(repoTags []string, repoDigests []string) (string, string) {
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

func PrimaryRepoTagFromInspect(inspect dockerTypes.ImageInspect) (string, string) {
	return primaryImageNameAndTag(inspect.RepoTags, inspect.RepoDigests)
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

func enrichImageUpdateFlags(svcCtx *svc.ServiceContext, imageList []MyType.Image) []MyType.Image {
	for i, imageInfo := range imageList {
		if cached, ok := svcCtx.GetHubImageUpdate(imageInfo.ID); ok {
			imageList[i].HaveUpdate = cached
			continue
		}
		imageRef := strings.TrimSpace(imageInfo.ImageName)
		tag := strings.TrimSpace(imageInfo.ImageTag)
		if imageRef == "" || imageRef == "None" || strings.HasPrefix(imageRef, "sha256:") || tag == "" || tag == "None" || tag == "<none>" {
			imageList[i].HaveUpdate = false
			continue
		}
		result, err := checkImageRefUpdateState(imageRef+":"+tag, imageInfo.RepoDigests)
		if err != nil {
			imageList[i].HaveUpdate = false
			continue
		}
		needUpdate := result.NeedUpdate
		imageList[i].HaveUpdate = needUpdate
		svcCtx.SetHubImageUpdate(imageInfo.ID, needUpdate)
	}
	return imageList
}

func enrichImageCleanupFlags(svc *svc.ServiceContext, imageList []MyType.Image) ([]MyType.Image, error) {
	list, err := GetContainerList(svc)
	if err != nil {
		return imageList, err
	}
	inUseMap := make(map[string]bool, len(list))
	runningMap := make(map[string]bool, len(list))
	for _, v := range list {
		inUseMap[v.ImageID] = true
		if strings.EqualFold(strings.TrimSpace(v.State), "running") {
			runningMap[v.ImageID] = true
		}
	}
	for i, imageInfo := range imageList {
		imageList[i].InUsed = inUseMap[imageInfo.ID]
		switch {
		case runningMap[imageInfo.ID]:
			imageList[i].UsageState = "running"
		case inUseMap[imageInfo.ID]:
			imageList[i].UsageState = "stopped"
		default:
			imageList[i].UsageState = "unused"
		}
		tag := strings.TrimSpace(strings.ToLower(imageInfo.ImageTag))
		noTag := tag == "" || tag == "none" || tag == "<none>"
		multiRef := countMeaningfulRefs(imageInfo) > 1
		imageList[i].MultiRef = multiRef
		switch {
		case imageList[i].InUsed:
			imageList[i].CleanupCandidate = false
			if imageList[i].UsageState == "stopped" {
				imageList[i].CleanupReason = "in_use_stopped"
			} else {
				imageList[i].CleanupReason = "in_use_running"
			}
		case noTag:
			imageList[i].CleanupCandidate = true
			imageList[i].CleanupReason = "dangling"
		default:
			imageList[i].CleanupCandidate = true
			if multiRef {
				imageList[i].CleanupReason = "unused_multi_ref"
			} else {
				imageList[i].CleanupReason = "unused"
			}
		}
	}
	return imageList, nil
}

func countMeaningfulRefs(img MyType.Image) int {
	seen := map[string]struct{}{}
	count := 0
	for _, tag := range img.RepoTags {
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

func calculateImageSize(imagesList []MyType.Image) []MyType.Image {
	for i := range imagesList {
		if imagesList[i].Size >= 1024*1024*1024 {
			imagesList[i].SizeFormat = fmt.Sprintf("%d Gb", imagesList[i].Size/1024/1024/1024)
		} else {
			imagesList[i].SizeFormat = fmt.Sprintf("%d Mb", imagesList[i].Size/1024/1024)
		}
	}
	return imagesList
}
