package utiles

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"strings"

	dockercontainer "github.com/docker/docker/api/types/container"
	"github.com/docker/docker/pkg/stdcopy"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
)

func GetContainerLogs(ctx *svc.ServiceContext, id string, tail string) (string, error) {
	if strings.TrimSpace(id) == "" {
		return "", fmt.Errorf("container id is required")
	}
	if strings.TrimSpace(tail) == "" {
		tail = "300"
	}

	reader, err := ctx.DockerClient.ContainerLogs(context.Background(), id, dockercontainer.LogsOptions{
		ShowStdout: true,
		ShowStderr: true,
		Timestamps: true,
		Tail:       tail,
	})
	if err != nil {
		return "", err
	}
	defer reader.Close()

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	if _, err := stdcopy.StdCopy(&stdout, &stderr, reader); err != nil {
		data, readErr := io.ReadAll(reader)
		if readErr != nil {
			return "", err
		}
		return string(data), nil
	}

	result := stdout.String()
	if stderr.Len() > 0 {
		if result != "" && !strings.HasSuffix(result, "\n") {
			result += "\n"
		}
		result += stderr.String()
	}
	return result, nil
}
