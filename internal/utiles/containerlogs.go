package utiles

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"regexp"
	"strings"
	"time"
	"unicode"

	dockercontainer "github.com/docker/docker/api/types/container"
	"github.com/docker/docker/pkg/stdcopy"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
)

var ansiRegexp = regexp.MustCompile(`\x1b\[[0-9;?]*[ -/]*[@-~]`)

type structuredLogLine struct {
	Timestamp string `json:"@timestamp"`
	Time      string `json:"time"`
	Caller    string `json:"caller"`
	Content   string `json:"content"`
	Duration  string `json:"duration"`
	Level     string `json:"level"`
	Span      string `json:"span"`
	Trace     string `json:"trace"`
	Message   string `json:"message"`
	Module    string `json:"module"`
}

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
		return sanitizeLogText(string(data)), nil
	}

	result := stdout.String()
	if stderr.Len() > 0 {
		if result != "" && !strings.HasSuffix(result, "\n") {
			result += "\n"
		}
		result += stderr.String()
	}
	return sanitizeLogText(result), nil
}

func sanitizeLogText(raw string) string {
	if raw == "" {
		return ""
	}
	raw = strings.ReplaceAll(raw, "\x00", "")
	raw = strings.ReplaceAll(raw, "\r\n", "\n")
	raw = strings.ReplaceAll(raw, "\r", "\n")
	raw = ansiRegexp.ReplaceAllString(raw, "")
	var b strings.Builder
	b.Grow(len(raw))
	for _, r := range raw {
		switch {
		case r == '\n' || r == '\t':
			b.WriteRune(r)
		case unicode.IsPrint(r):
			b.WriteRune(r)
		}
	}
	cleaned := b.String()
	lines := strings.Split(cleaned, "\n")
	for i, line := range lines {
		lines[i] = formatStructuredLogLine(strings.TrimSpace(line))
	}
	return strings.TrimSpace(strings.Join(lines, "\n"))
}

func formatStructuredLogLine(line string) string {
	if line == "" {
		return ""
	}
	dockerTS, payload := splitDockerTimestampPrefix(line)
	var item structuredLogLine
	if err := json.Unmarshal([]byte(payload), &item); err != nil {
		return line
	}

	msg := strings.TrimSpace(item.Content)
	if msg == "" {
		msg = strings.TrimSpace(item.Message)
	}
	ts := firstNonEmpty(item.Timestamp, item.Time, dockerTS)
	parts := make([]string, 0, 6)
	if ts != "" {
		parts = append(parts, ts)
	}
	if lvl := strings.ToUpper(strings.TrimSpace(item.Level)); lvl != "" {
		parts = append(parts, "["+lvl+"]")
	}
	if item.Module != "" {
		parts = append(parts, "["+strings.TrimSpace(item.Module)+"]")
	}
	if msg != "" {
		parts = append(parts, msg)
	}
	meta := make([]string, 0, 3)
	if item.Caller != "" {
		meta = append(meta, item.Caller)
	}
	if item.Duration != "" {
		meta = append(meta, item.Duration)
	}
	if item.Trace != "" {
		meta = append(meta, "trace="+item.Trace)
	}
	if len(meta) > 0 {
		parts = append(parts, "("+strings.Join(meta, " | ")+")")
	}
	if len(parts) == 0 {
		return line
	}
	return strings.Join(parts, " ")
}

func splitDockerTimestampPrefix(line string) (string, string) {
	line = strings.TrimSpace(line)
	idx := strings.IndexByte(line, ' ')
	if idx <= 0 {
		return "", line
	}
	prefix := strings.TrimSpace(line[:idx])
	payload := strings.TrimSpace(line[idx+1:])
	if payload == "" || !strings.HasPrefix(payload, "{") {
		return "", line
	}
	if _, err := time.Parse(time.RFC3339Nano, prefix); err != nil {
		return "", line
	}
	return prefix, payload
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		v = strings.TrimSpace(v)
		if v != "" {
			return v
		}
	}
	return ""
}
