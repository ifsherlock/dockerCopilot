package utiles

import (
	"context"
	"fmt"
	"github.com/docker/docker/api/types/image"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
	MyType "github.com/onlyLTY/dockerCopilot/internal/types"
	"log"
	"strings"
)

func GetImagesList(ctx *svc.ServiceContext) ([]MyType.Image, error) {
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
			SizeFormat:       "",
			CleanupCandidate: false,
			CleanupReason:    "",
			MultiRef:         false,
		}
		imagesList = append(imagesList, i)
	}
	imagesList = splitImageNameAndTag(calculateImageSize(imagesList))
	imagesList, err = enrichImageCleanupFlags(ctx, imagesList)
	if err != nil {
		return imagesList, err
	}
	return imagesList, nil
}

func splitImageNameAndTag(imagesList []MyType.Image) []MyType.Image {
	for i, imageInfo := range imagesList {
		if len(imageInfo.RepoTags) != 0 {
			parts := strings.SplitN(imageInfo.RepoTags[0], ":", 2)
			imagesList[i].ImageName = parts[0]
			if len(parts) > 1 {
				imagesList[i].ImageTag = parts[1]
			} else {
				imagesList[i].ImageTag = "None"
			}
		} else if len(imageInfo.RepoDigests) != 0 {
			imagesList[i].ImageName = strings.Split(imageInfo.RepoDigests[0], "@")[0]
			imagesList[i].ImageTag = "None"
		} else {
			imagesList[i].ImageName = "None"
			imagesList[i].ImageTag = "None"
		}
	}
	return imagesList
}

func enrichImageCleanupFlags(svc *svc.ServiceContext, imageList []MyType.Image) ([]MyType.Image, error) {
	list, err := GetContainerList(svc)
	if err != nil {
		return imageList, err
	}
	inUseMap := make(map[string]bool, len(list))
	for _, v := range list {
		inUseMap[v.ImageID] = true
	}
	for i, imageInfo := range imageList {
		imageList[i].InUsed = inUseMap[imageInfo.ID]
		tag := strings.TrimSpace(strings.ToLower(imageInfo.ImageTag))
		noTag := tag == "" || tag == "none" || tag == "<none>"
		multiRef := countMeaningfulRefs(imageInfo) > 1
		imageList[i].MultiRef = multiRef
		switch {
		case imageList[i].InUsed:
			imageList[i].CleanupCandidate = false
			imageList[i].CleanupReason = "in_use"
		case multiRef:
			imageList[i].CleanupCandidate = false
			imageList[i].CleanupReason = "multi_ref"
		case noTag:
			imageList[i].CleanupCandidate = true
			imageList[i].CleanupReason = "dangling"
		default:
			imageList[i].CleanupCandidate = true
			imageList[i].CleanupReason = "unused"
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
	for _, digest := range img.RepoDigests {
		d := strings.TrimSpace(strings.ToLower(digest))
		if d == "" || strings.Contains(d, "<none>") {
			continue
		}
		if _, ok := seen[d]; ok {
			continue
		}
		seen[d] = struct{}{}
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
