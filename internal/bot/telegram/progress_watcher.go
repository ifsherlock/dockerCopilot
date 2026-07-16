package telegram

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/mymmrac/telego"
	tu "github.com/mymmrac/telego/telegoutil"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
)

type progressSnapshot struct {
	TaskID     string
	Percentage int
	Message    string
	Name       string
	DetailMsg  string
	IsDone     bool
	Logs       []string
}

func (r *Runtime) startTaskProgressWatcher(ctx context.Context, chatID int64, instance instanceConfig, title string, taskID string) {
	if taskID == "" {
		return
	}
	msg, err := r.bot.SendMessage(ctx, tu.Message(tu.ID(chatID), fmt.Sprintf("⏳ <b>%s</b>\n实例: <b>%s</b>\nTaskID: <code>%s</code>\n\n正在获取任务进度...", escapeHTML(title), escapeHTML(instance.Name), escapeHTML(taskID))).WithParseMode(telego.ModeHTML))
	if err != nil {
		return
	}
	go r.watchTaskProgress(ctx, chatID, msg.MessageID, instance, title, taskID)
}

func (r *Runtime) watchTaskProgress(ctx context.Context, chatID int64, messageID int, instance instanceConfig, title string, taskID string) {
	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()
	lastText := ""
	for i := 0; i < 120; i++ {
		snapshot, err := r.fetchTaskProgress(ctx, instance, taskID)
		if err != nil {
			text := fmt.Sprintf("⚠️ <b>%s</b>\n实例: <b>%s</b>\nTaskID: <code>%s</code>\n\n获取进度失败: <code>%s</code>", escapeHTML(title), escapeHTML(instance.Name), escapeHTML(taskID), escapeHTML(shorten(err.Error(), 160)))
			if text != lastText {
				r.editOrReplyText(ctx, chatID, messageID, text, nil)
				lastText = text
			}
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				continue
			}
		}
		text := r.renderProgressText(title, instance.Name, snapshot)
		if text != lastText {
			r.editOrReplyText(ctx, chatID, messageID, text, nil)
			lastText = text
		}
		if snapshot.IsDone {
			return
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
	text := fmt.Sprintf("⏱ <b>%s</b>\n实例: <b>%s</b>\nTaskID: <code>%s</code>\n\n进度轮询超时，请稍后手动检查。", escapeHTML(title), escapeHTML(instance.Name), escapeHTML(taskID))
	r.editOrReplyText(ctx, chatID, messageID, text, nil)
}

func (r *Runtime) fetchTaskProgress(ctx context.Context, instance instanceConfig, taskID string) (progressSnapshot, error) {
	if instance.Local {
		progress, ok := r.svcCtx.GetProgress(taskID)
		if !ok {
			return progressSnapshot{}, fmt.Errorf("taskID 未找到")
		}
		return progressSnapshot{
			TaskID: taskID, Percentage: progress.Percentage, Message: progress.Message, Name: progress.Name,
			DetailMsg: progress.DetailMsg, IsDone: progress.IsDone, Logs: progress.Logs,
		}, nil
	}
	data, err := newRemoteClient(instance).progress(ctx, taskID)
	if err != nil {
		return progressSnapshot{}, err
	}
	return progressSnapshot{
		TaskID:     svc.AsString(data["taskID"], taskID),
		Percentage: svc.AsInt(data["percentage"], 0),
		Message:    svc.AsString(data["message"], svc.AsString(data["msg"], "")),
		Name:       svc.AsString(data["name"], ""),
		DetailMsg:  svc.AsString(data["detailMsg"], ""),
		IsDone:     svc.AsBool(data["isDone"]),
		Logs:       svc.StringList(data["logs"]),
	}, nil
}

func (r *Runtime) renderProgressText(title string, instanceName string, snapshot progressSnapshot) string {
	status := "⏳ 进行中"
	if snapshot.IsDone {
		status = "✅ 已完成"
		if snapshot.Percentage < 100 {
			snapshot.Percentage = 100
		}
	}
	text := fmt.Sprintf("%s <b>%s</b>\n实例: <b>%s</b>\nTaskID: <code>%s</code>\n进度: <b>%d%%</b>\n状态: %s",
		status, escapeHTML(title), escapeHTML(instanceName), escapeHTML(snapshot.TaskID), snapshot.Percentage, escapeHTML(firstNonEmpty(snapshot.Message, "执行中")))
	if snapshot.Name != "" {
		text += fmt.Sprintf("\n目标: <code>%s</code>", escapeHTML(snapshot.Name))
	}
	detail := strings.TrimSpace(snapshot.DetailMsg)
	if detail == "" && len(snapshot.Logs) > 0 {
		detail = strings.Join(snapshot.Logs, "\n")
	}
	if detail != "" {
		text += fmt.Sprintf("\n\n详情:\n<code>%s</code>", escapeHTML(shorten(detail, 1200)))
	}
	return text
}

// batchTask 描述批量更新面板中的一个任务。
type batchTask struct {
	Name   string
	TaskID string
}

// startBatchProgressWatcher 用一条聚合消息展示一批任务的进度，
// 定期原地编辑刷新，替代“每个容器一条进度消息”的刷屏模式。
// failedSubmit 是提交阶段就失败的容器名，直接以失败状态列出。
func (r *Runtime) startBatchProgressWatcher(ctx context.Context, chatID int64, instance instanceConfig, title string, tasks []batchTask, failedSubmit []string) {
	if len(tasks) == 0 && len(failedSubmit) == 0 {
		return
	}
	text := r.renderBatchProgressText(title, instance.Name, tasks, map[string]progressSnapshot{}, failedSubmit, false)
	msg, err := r.bot.SendMessage(ctx, tu.Message(tu.ID(chatID), text).WithParseMode(telego.ModeHTML))
	if err != nil {
		return
	}
	if len(tasks) == 0 {
		return
	}
	go r.watchBatchProgress(ctx, chatID, msg.MessageID, instance, title, tasks, failedSubmit)
}

func (r *Runtime) watchBatchProgress(ctx context.Context, chatID int64, messageID int, instance instanceConfig, title string, tasks []batchTask, failedSubmit []string) {
	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()
	lastText := ""
	snapshots := map[string]progressSnapshot{}
	for i := 0; i < 240; i++ {
		allDone := true
		for _, task := range tasks {
			if snap, ok := snapshots[task.TaskID]; ok && snap.IsDone {
				continue
			}
			snap, err := r.fetchTaskProgress(ctx, instance, task.TaskID)
			if err == nil {
				snapshots[task.TaskID] = snap
			}
			if snap, ok := snapshots[task.TaskID]; !ok || !snap.IsDone {
				allDone = false
			}
		}
		text := r.renderBatchProgressText(title, instance.Name, tasks, snapshots, failedSubmit, allDone)
		if text != lastText {
			r.editOrReplyText(ctx, chatID, messageID, text, nil)
			lastText = text
		}
		if allDone {
			return
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
	text := r.renderBatchProgressText(title, instance.Name, tasks, snapshots, failedSubmit, false)
	text += "\n\n⏱ 进度轮询超时，未完成的任务请稍后手动检查。"
	r.editOrReplyText(ctx, chatID, messageID, text, nil)
}

func (r *Runtime) renderBatchProgressText(title string, instanceName string, tasks []batchTask, snapshots map[string]progressSnapshot, failedSubmit []string, allDone bool) string {
	done := 0
	for _, task := range tasks {
		if snap, ok := snapshots[task.TaskID]; ok && snap.IsDone {
			done++
		}
	}
	head := "⏳"
	if allDone {
		head = "✅"
	}
	var b strings.Builder
	b.WriteString(fmt.Sprintf("%s <b>%s</b>（%d/%d 完成）\n实例: <b>%s</b>\n", head, escapeHTML(title), done, len(tasks), escapeHTML(instanceName)))
	for _, task := range tasks {
		snap, ok := snapshots[task.TaskID]
		switch {
		case !ok:
			b.WriteString(fmt.Sprintf("\n⏳ <b>%s</b> 等待进度…", escapeHTML(task.Name)))
		case snap.IsDone && isProgressFailed(snap):
			b.WriteString(fmt.Sprintf("\n❌ <b>%s</b> %s", escapeHTML(task.Name), escapeHTML(shorten(firstNonEmpty(snap.Message, "失败"), 60))))
		case snap.IsDone:
			b.WriteString(fmt.Sprintf("\n✅ <b>%s</b> %s", escapeHTML(task.Name), escapeHTML(shorten(firstNonEmpty(snap.Message, "完成"), 60))))
		default:
			b.WriteString(fmt.Sprintf("\n⏳ <b>%s</b> %d%% %s", escapeHTML(task.Name), snap.Percentage, escapeHTML(shorten(firstNonEmpty(snap.Message, "执行中"), 48))))
		}
	}
	for _, name := range failedSubmit {
		b.WriteString(fmt.Sprintf("\n❌ <b>%s</b> 提交失败", escapeHTML(name)))
	}
	return b.String()
}

// isProgressFailed 依据任务文案粗略判断结束状态是否为失败。
func isProgressFailed(snapshot progressSnapshot) bool {
	msg := snapshot.Message + " " + snapshot.DetailMsg
	return strings.Contains(msg, "失败") || strings.Contains(strings.ToLower(msg), "error") || strings.Contains(msg, "异常")
}
