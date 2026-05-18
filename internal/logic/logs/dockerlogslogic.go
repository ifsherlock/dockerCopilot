package logs

import (
	"bufio"
	"bytes"
	"context"
	"io"
	"sort"
	"strconv"
	"strings"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/pkg/stdcopy"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"github.com/onlyLTY/dockerCopilot/internal/types"
	"github.com/zeromicro/go-zero/core/logx"
)

type DockerLogsLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

type DockerLogLine struct {
	Time    string `json:"time"`
	Level   string `json:"level"`
	Message string `json:"message"`
	Raw     string `json:"raw"`
}

func NewDockerLogsLogic(ctx context.Context, svcCtx *svc.ServiceContext) *DockerLogsLogic {
	return &DockerLogsLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func detectLevel(line string) string {
	lower := strings.ToLower(line)
	switch {
	case strings.Contains(lower, "panic"), strings.Contains(lower, "fatal"):
		return "fatal"
	case strings.Contains(lower, "error"), strings.Contains(lower, " err"), strings.Contains(lower, "失败"):
		return "error"
	case strings.Contains(lower, "warn"), strings.Contains(lower, "warning"), strings.Contains(lower, "警告"):
		return "warn"
	case strings.Contains(lower, "debug"):
		return "debug"
	default:
		return "info"
	}
}

func parseLogLine(line string) DockerLogLine {
	line = strings.TrimRight(line, "\r\n")
	clean := strings.TrimSpace(line)
	item := DockerLogLine{Raw: line, Message: clean, Level: detectLevel(clean)}
	if len(clean) > 20 && clean[4] == '-' && clean[7] == '-' && strings.Contains(clean[:20], "T") {
		item.Time = clean[:30]
		item.Message = strings.TrimSpace(clean[30:])
	}
	return item
}

func splitLevels(level string) map[string]bool {
	out := map[string]bool{}
	for _, item := range strings.Split(strings.ToLower(level), ",") {
		item = strings.TrimSpace(item)
		if item != "" && item != "all" {
			out[item] = true
		}
	}
	return out
}

func (l *DockerLogsLogic) findSelfContainerID() (string, error) {
	containers, err := l.svcCtx.DockerClient.ContainerList(l.ctx, container.ListOptions{All: true})
	if err != nil {
		return "", err
	}
	for _, c := range containers {
		for _, name := range c.Names {
			if strings.TrimPrefix(name, "/") == "dockercopilot-v213" {
				return c.ID, nil
			}
		}
	}
	for _, c := range containers {
		for _, name := range c.Names {
			if strings.Contains(strings.ToLower(strings.TrimPrefix(name, "/")), "dockercopilot") {
				return c.ID, nil
			}
		}
	}
	return "", nil
}

func (l *DockerLogsLogic) DockerLogs(req *types.GetLogsReq) (resp *types.Resp, err error) {
	resp = &types.Resp{}
	tail := req.Tail
	if tail <= 0 {
		tail = 300
	}
	if tail > 2000 {
		tail = 2000
	}
	containerID, err := l.findSelfContainerID()
	if err != nil {
		resp.Code = 500
		resp.Msg = err.Error()
		resp.Data = []DockerLogLine{}
		return resp, nil
	}
	if containerID == "" {
		resp.Code = 404
		resp.Msg = "未找到 DockerCopilot 容器"
		resp.Data = []DockerLogLine{}
		return resp, nil
	}

	reader, err := l.svcCtx.DockerClient.ContainerLogs(l.ctx, containerID, container.LogsOptions{
		ShowStdout: true,
		ShowStderr: true,
		Timestamps: true,
		Tail:       strconv.Itoa(tail),
	})
	if err != nil {
		resp.Code = 500
		resp.Msg = err.Error()
		resp.Data = []DockerLogLine{}
		return resp, nil
	}
	defer reader.Close()

	allowed := splitLevels(req.Level)
	var stdout, stderr bytes.Buffer
	if _, err := stdcopy.StdCopy(&stdout, &stderr, reader); err != nil {
		resp.Code = 500
		resp.Msg = err.Error()
		resp.Data = []DockerLogLine{}
		return resp, nil
	}
	merged := stdout.String() + stderr.String()

	items := []DockerLogLine{}
	scanner := bufio.NewScanner(strings.NewReader(merged))
	scanner.Buffer(make([]byte, 1024), 1024*1024)
	for scanner.Scan() {
		line := scanner.Text()
		item := parseLogLine(line)
		if len(allowed) == 0 || allowed[item.Level] {
			items = append(items, item)
		}
	}
	if scanner.Err() != nil && scanner.Err() != io.EOF {
		resp.Code = 500
		resp.Msg = scanner.Err().Error()
		resp.Data = items
		return resp, nil
	}
	if len(items) > tail {
		items = items[len(items)-tail:]
	}
	sort.SliceStable(items, func(i, j int) bool { return items[i].Time > items[j].Time })
	resp.Code = 200
	resp.Msg = "success"
	resp.Data = items
	return resp, nil
}
