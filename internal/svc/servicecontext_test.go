package svc

import (
	"testing"

	"github.com/onlyLTY/dockerCopilot/internal/config"
)

func TestServiceContextPersistsRuntimeLogs(t *testing.T) {
	t.Setenv("DOCKERCOPILOT_LOG_DIR", t.TempDir())

	ctx := NewServiceContext(config.Config{})
	ctx.AddOperationLog("compose", "Compose up done", "demo")
	ctx.UpdateProgress("task-1", TaskProgress{
		TaskID:     "task-1",
		Percentage: 30,
		Message:    "pulling",
		Name:       "demo",
	})
	ctx.AppendProgressLog("task-1", "pull image: nginx:latest")

	reloaded := NewServiceContext(config.Config{})
	operationLogs := reloaded.GetOperationLogs()
	if len(operationLogs) != 1 {
		t.Fatalf("operation log count = %d, want 1", len(operationLogs))
	}
	if operationLogs[0].Type != "compose" || operationLogs[0].Title != "Compose up done" || operationLogs[0].Message != "demo" {
		t.Fatalf("operation log = %#v, want persisted compose log", operationLogs[0])
	}

	progress, ok := reloaded.GetProgress("task-1")
	if !ok {
		t.Fatalf("persisted task progress not found")
	}
	if progress.Message != "pulling" || progress.DetailMsg != "pull image: nginx:latest" {
		t.Fatalf("progress = %#v, want persisted task log", progress)
	}
	if progress.CreatedAt == "" || progress.UpdatedAt == "" {
		t.Fatalf("progress timestamps were not persisted: %#v", progress)
	}
}
