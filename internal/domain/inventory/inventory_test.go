package inventory

import (
	"testing"

	dockerTypes "github.com/docker/docker/api/types"
	dockerImage "github.com/docker/docker/api/types/image"
)

func TestContainersFromDockerBuildsSnapshotAndSelfFlag(t *testing.T) {
	items := []dockerTypes.Container{
		{ID: "abcdef123456", Names: []string{"/web"}, Image: "nginx:latest", ImageID: "sha256:img1", State: "running", Status: "Up", Created: 100},
		{ID: "deadbeef", Names: nil, ImageID: "sha256:img2", State: "exited", Status: "Exited", Created: 200},
	}
	got := ContainersFromDocker(items, map[string]string{"abcdef123456": "docker.io/library/nginx:latest"}, "abcdef")
	if len(got) != 2 {
		t.Fatalf("len = %d, want 2", len(got))
	}
	if got[0].Name != "web" || got[0].UsingImage != "nginx:latest" || got[0].CreatedImageRef != "docker.io/library/nginx:latest" {
		t.Fatalf("first container = %#v", got[0])
	}
	if !got[0].IsRunning || !got[0].IsSelf {
		t.Fatalf("first flags = running %v self %v", got[0].IsRunning, got[0].IsSelf)
	}
	if got[1].Name != "deadbeef" || got[1].UsingImage != "sha256:img2" || got[1].IsRunning || got[1].IsSelf {
		t.Fatalf("second container = %#v", got[1])
	}
}

func TestImagesFromDockerBuildsUsageAndCleanupState(t *testing.T) {
	containers := []Container{
		{ID: "c1", ImageID: "sha256:img1", IsRunning: true},
		{ID: "c2", ImageID: "sha256:img2", IsRunning: false},
	}
	images := []dockerImage.Summary{
		{ID: "sha256:img1", RepoTags: []string{"nginx:latest"}, Size: 1024 * 1024 * 1024, Created: 100},
		{ID: "sha256:img2", RepoTags: []string{"redis:7"}, Size: 10 * 1024 * 1024, Created: 200},
		{ID: "sha256:img3", RepoTags: []string{"<none>:<none>"}, RepoDigests: []string{"example/app@sha256:abc"}, Size: 10, Created: 300},
		{ID: "sha256:img4", RepoTags: []string{"a/app:1", "a/app:2"}, Size: 10, Created: 400},
	}
	got := ImagesFromDocker(images, containers)
	if len(got) != 4 {
		t.Fatalf("len = %d, want 4", len(got))
	}
	if got[0].Name != "nginx" || got[0].Tag != "latest" || got[0].UsageState != "running" || got[0].CleanupReason != "in_use_running" || got[0].CleanupCandidate {
		t.Fatalf("running image = %#v", got[0])
	}
	if got[1].UsageState != "stopped" || got[1].CleanupReason != "in_use_stopped" || got[1].CleanupCandidate {
		t.Fatalf("stopped image = %#v", got[1])
	}
	if got[2].Name != "example/app" || got[2].CleanupReason != "dangling" || !got[2].CleanupCandidate {
		t.Fatalf("dangling digest image = %#v", got[2])
	}
	if !got[3].MultiRef || got[3].CleanupReason != "unused_multi_ref" || !got[3].CleanupCandidate {
		t.Fatalf("multi ref image = %#v", got[3])
	}
}

func TestIsSelfContainerSupportsDockerHostnamePrefixCases(t *testing.T) {
	cases := []struct {
		containerID string
		selfID      string
		want        bool
	}{
		{containerID: "abcdef123456", selfID: "abcdef", want: true},
		{containerID: "abc", selfID: "abcdef123456", want: true},
		{containerID: "abcdef", selfID: "abcdef", want: true},
		{containerID: "abcdef", selfID: "123456", want: false},
		{containerID: "", selfID: "123456", want: false},
	}
	for _, tt := range cases {
		if got := IsSelfContainer(tt.containerID, tt.selfID); got != tt.want {
			t.Fatalf("IsSelfContainer(%q, %q) = %v, want %v", tt.containerID, tt.selfID, got, tt.want)
		}
	}
}

func TestContainerIDFromMountInfoSupportsCustomHostname(t *testing.T) {
	const containerID = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	mountInfo := "2137 2090 253:0 /var/snap/docker/common/var-lib-docker/containers/" + containerID + "/hostname /etc/hostname rw,relatime - ext4 /dev/mapper/vg-lv rw\n"

	if got := containerIDFromMountInfo(mountInfo); got != containerID {
		t.Fatalf("containerIDFromMountInfo() = %q, want %q", got, containerID)
	}
}

func TestContainerIDFromMountInfoRejectsUnrelatedAndShortIDs(t *testing.T) {
	mountInfo := "1 0 0:1 /var/lib/docker/containers/abcdef/hostname /etc/hostname rw - ext4 /dev/root rw\n" +
		"2 0 0:2 /var/lib/docker/containers/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef/hostname /tmp/hostname rw - ext4 /dev/root rw\n"

	if got := containerIDFromMountInfo(mountInfo); got != "" {
		t.Fatalf("containerIDFromMountInfo() = %q, want empty", got)
	}
}

func TestCurrentContainerIDPrefersExplicitOverride(t *testing.T) {
	t.Setenv(selfContainerIDEnv, " explicit-container-id ")

	if got := CurrentContainerID(); got != "explicit-container-id" {
		t.Fatalf("CurrentContainerID() = %q, want explicit override", got)
	}
}

func TestNewSnapshotConnectsContainersAndImages(t *testing.T) {
	snapshot := NewSnapshot(
		[]dockerTypes.Container{{ID: "c1", Names: []string{"/web"}, Image: "nginx:latest", ImageID: "sha256:img1", State: "running"}},
		[]dockerImage.Summary{{ID: "sha256:img1", RepoTags: []string{"nginx:latest"}}},
		map[string]string{"c1": "nginx:latest"},
		"c1",
	)
	if len(snapshot.Containers) != 1 || len(snapshot.Images) != 1 {
		t.Fatalf("snapshot = %#v", snapshot)
	}
	if !snapshot.Containers[0].IsSelf || snapshot.Images[0].UsageState != "running" {
		t.Fatalf("snapshot values = %#v", snapshot)
	}
}
