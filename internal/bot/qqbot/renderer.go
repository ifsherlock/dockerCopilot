package qqbot

import (
	"fmt"
	"strings"
)

type homeMenuItem struct {
	ID      string
	Label   string
	Command string
	Summary string
}

var homeMenuItems = []homeMenuItem{
	{ID: "status", Label: "概览", Command: "/status", Summary: "查看运行状态"},
	{ID: "containers", Label: "容器", Command: "/containers", Summary: "查看容器列表"},
	{ID: "images", Label: "镜像", Command: "/images", Summary: "查看镜像统计"},
	{ID: "updates", Label: "更新", Command: "/updates", Summary: "查看可更新容器"},
	{ID: "check", Label: "检测更新", Command: "/check_updates", Summary: "刷新更新检测"},
	{ID: "backups", Label: "备份", Command: "/backups", Summary: "查看备份列表"},
	{ID: "backup", Label: "立即备份", Command: "/backup", Summary: "创建 JSON 备份"},
	{ID: "compose", Label: "Compose备份", Command: "/backup_compose", Summary: "创建 Compose 备份"},
	{ID: "clean", Label: "清理镜像", Command: "/clean_images", Summary: "清理未使用镜像"},
	{ID: "version", Label: "版本", Command: "/version", Summary: "查看版本信息"},
}

func renderHome(cfg Config) Message {
	msg := Message{Text: homeText()}
	if cfg.MarkdownEnabled && cfg.ButtonsEnabled {
		msg.Keyboard = homeKeyboard()
	}
	return enrichMarkdown(msg, cfg.MarkdownEnabled)
}

func homeText() string {
	lines := []string{
		"DockerCopilot QQ 官方机器人",
		"",
		"点击下方按钮或发送命令：",
	}
	for _, item := range homeMenuItems {
		lines = append(lines, fmt.Sprintf("%s %s - %s", item.Command, item.Label, item.Summary))
	}
	return strings.Join(lines, "\n")
}

func homeKeyboard() *Keyboard {
	rows := make([]interface{}, 0, (len(homeMenuItems)+1)/2)
	for i := 0; i < len(homeMenuItems); i += 2 {
		buttons := []interface{}{
			button(homeMenuItems[i].Label, commandCallbackData(homeMenuItems[i].Command), homeMenuItems[i].ID),
		}
		if i+1 < len(homeMenuItems) {
			buttons = append(buttons, button(homeMenuItems[i+1].Label, commandCallbackData(homeMenuItems[i+1].Command), homeMenuItems[i+1].ID))
		}
		rows = append(rows, map[string]interface{}{"buttons": buttons})
	}
	return &Keyboard{Raw: map[string]interface{}{
		"content": map[string]interface{}{
			"rows": rows,
		},
	}}
}

func renderStaleInteraction(reason string) Message {
	home := renderHome(Config{MarkdownEnabled: true, ButtonsEnabled: true})
	home.Text = strings.TrimSpace(reason) + "\n\n" + home.Text
	if home.Markdown != nil {
		home.Markdown.Content = home.Text
	}
	return home
}

func renderStatus(summary StatusSummary, cfg Config) Message {
	return richMessage(Message{
		Text: fmt.Sprintf(
			"DockerCopilot 状态\n\n容器: %d\n运行中: %d\n已停止: %d\n可更新: %d\n\n发送 /updates 查看可更新容器。",
			summary.Containers,
			summary.Running,
			summary.Stopped,
			summary.UpdateCount,
		),
		Keyboard: quickActionKeyboard([]quickAction{
			{Label: "查看更新", Command: "/updates", ID: "updates"},
			{Label: "容器列表", Command: "/containers", ID: "containers"},
			homeAction(),
		}),
	}, cfg)
}

func renderUpdates(items []ContainerUpdateItem, session updateSession, cfg Config) Message {
	if len(items) == 0 {
		return richMessage(Message{
			Text:     "当前没有可更新容器。",
			Keyboard: quickActionKeyboard([]quickAction{{Label: "刷新检测", Command: "/check_updates", ID: "check"}, homeAction()}),
		}, cfg)
	}
	var b strings.Builder
	b.WriteString(fmt.Sprintf("可更新容器：%d 个\n\n", len(items)))
	limit := len(items)
	if limit > 8 {
		limit = 8
	}
	for i := 0; i < limit; i++ {
		item := items[i]
		b.WriteString(fmt.Sprintf("%d. %s\n", i+1, item.Name))
		if ref := strings.TrimSpace(firstNonEmpty(item.UsingImage, item.CreateImage)); ref != "" {
			b.WriteString("   " + shortenText(ref, 52) + "\n")
		}
	}
	if len(items) > limit {
		b.WriteString(fmt.Sprintf("\n还有 %d 个未显示。\n", len(items)-limit))
	}
	if !cfg.ButtonsEnabled {
		b.WriteString("\n按钮未启用，可发送 /updates 刷新列表。")
		return richMessage(Message{Text: b.String()}, cfg)
	}
	return richMessage(Message{
		Text:     b.String(),
		Keyboard: updatesKeyboard(items, session),
	}, cfg)
}

func renderContainers(items []ContainerInfoLite, cfg Config) Message {
	if len(items) == 0 {
		return richMessage(Message{Text: "当前没有容器。", Keyboard: homeKeyboard()}, cfg)
	}
	var b strings.Builder
	b.WriteString(fmt.Sprintf("容器列表：%d 个\n\n", len(items)))
	limit := len(items)
	if limit > 12 {
		limit = 12
	}
	for i := 0; i < limit; i++ {
		item := items[i]
		status := compactStatus(item.Status)
		updateSuffix := ""
		if item.HaveUpdate && !item.Ignored {
			updateSuffix = " · 可更新"
		} else if item.Ignored {
			updateSuffix = " · 已忽略更新"
		}
		b.WriteString(fmt.Sprintf("%d. %s [%s]%s\n", i+1, item.Name, status, updateSuffix))
		if image := strings.TrimSpace(item.Image); image != "" {
			b.WriteString("   " + shortenText(image, 54) + "\n")
		}
	}
	if len(items) > limit {
		b.WriteString(fmt.Sprintf("\n还有 %d 个未显示。", len(items)-limit))
	}
	return richMessage(Message{
		Text: strings.TrimSpace(b.String()),
		Keyboard: quickActionKeyboard([]quickAction{
			{Label: "概览", Command: "/status", ID: "status"},
			{Label: "可更新", Command: "/updates", ID: "updates"},
			homeAction(),
		}),
	}, cfg)
}

func renderImages(summary ImageSummary, cfg Config) Message {
	return richMessage(Message{
		Text: fmt.Sprintf(
			"镜像统计\n\n总数: %d\n使用中: %d\n未使用: %d\n可更新: %d\n\n发送 /clean_images 清理未使用镜像。",
			summary.Total,
			summary.InUse,
			summary.Unused,
			summary.Updatable,
		),
		Keyboard: quickActionKeyboard([]quickAction{
			{Label: "清理镜像", Command: "/clean_images", ID: "clean"},
			{Label: "概览", Command: "/status", ID: "status"},
			homeAction(),
		}),
	}, cfg)
}

func renderBackups(summary BackupSummary, cfg Config) Message {
	if len(summary.Files) == 0 {
		return richMessage(Message{
			Text: "当前没有备份文件。\n\n发送 /backup 或 /backup_compose 创建备份。",
			Keyboard: quickActionKeyboard([]quickAction{
				{Label: "JSON备份", Command: "/backup", ID: "backup"},
				{Label: "Compose备份", Command: "/backup_compose", ID: "compose"},
				homeAction(),
			}),
		}, cfg)
	}
	var b strings.Builder
	b.WriteString(fmt.Sprintf("备份列表：%d 个\n\n", len(summary.Files)))
	limit := len(summary.Files)
	if limit > 10 {
		limit = 10
	}
	for i := 0; i < limit; i++ {
		b.WriteString(fmt.Sprintf("%d. %s\n", i+1, shortenText(summary.Files[i], 58)))
	}
	if len(summary.Files) > limit {
		b.WriteString(fmt.Sprintf("\n还有 %d 个未显示。", len(summary.Files)-limit))
	}
	return richMessage(Message{
		Text: strings.TrimSpace(b.String()),
		Keyboard: quickActionKeyboard([]quickAction{
			{Label: "JSON备份", Command: "/backup", ID: "backup"},
			{Label: "Compose备份", Command: "/backup_compose", ID: "compose"},
			homeAction(),
		}),
	}, cfg)
}

func renderVersion(summary VersionSummary, cfg Config) Message {
	local := firstNonEmpty(summary.LocalVersion, "未知")
	remote := firstNonEmpty(summary.RemoteVersion, "未知")
	status := firstNonEmpty(summary.RemoteStatus, "未知")
	buildDate := firstNonEmpty(summary.BuildDate, "未知")
	return richMessage(Message{
		Text: fmt.Sprintf(
			"版本信息\n\n本地版本: %s\n构建时间: %s\n远端版本: %s\n状态: %s",
			local,
			buildDate,
			remote,
			status,
		),
		Keyboard: quickActionKeyboard([]quickAction{
			{Label: "刷新检测", Command: "/check_updates", ID: "check"},
			homeAction(),
		}),
	}, cfg)
}

func renderConfirm(item ContainerUpdateItem, sessionID string, index int, cfg Config) Message {
	text := fmt.Sprintf("确认更新容器？\n\n%s\n%s", item.Name, firstNonEmpty(item.CreateImage, item.UsingImage))
	if !cfg.ButtonsEnabled {
		return richMessage(Message{Text: text + "\n\n按钮未启用，请发送 /updates 重新查看。"}, cfg)
	}
	return richMessage(Message{
		Text: text,
		Keyboard: &Keyboard{Raw: map[string]interface{}{
			"content": map[string]interface{}{
				"rows": []interface{}{
					map[string]interface{}{"buttons": []interface{}{
						button("确认更新", updateCallbackData(sessionID, "run_item", index), "1"),
						button("取消", updateCallbackData(sessionID, "cancel", -1), "2"),
					}},
				},
			},
		}},
	}, cfg)
}

func renderConfirmAll(items []ContainerUpdateItem, sessionID string, cfg Config) Message {
	text := fmt.Sprintf("确认批量更新 %d 个容器？", len(items))
	if !cfg.ButtonsEnabled {
		return richMessage(Message{Text: text + "\n\n按钮未启用，请发送 /updates 重新查看。"}, cfg)
	}
	return richMessage(Message{
		Text: text,
		Keyboard: &Keyboard{Raw: map[string]interface{}{
			"content": map[string]interface{}{
				"rows": []interface{}{
					map[string]interface{}{"buttons": []interface{}{
						button("确认全部", updateCallbackData(sessionID, "run_all", -1), "1"),
						button("取消", updateCallbackData(sessionID, "cancel", -1), "2"),
					}},
				},
			},
		}},
	}, cfg)
}

func updatesKeyboard(items []ContainerUpdateItem, session updateSession) *Keyboard {
	rows := make([]interface{}, 0)
	limit := len(items)
	if limit > 4 {
		limit = 4
	}
	for i := 0; i < limit; i++ {
		rows = append(rows, map[string]interface{}{"buttons": []interface{}{
			button("更新 "+shortenText(items[i].Name, 16), updateCallbackData(session.ID, "confirm_item", i), fmt.Sprintf("%d", i+1)),
		}})
	}
	if len(items) > 1 {
		rows = append(rows, map[string]interface{}{"buttons": []interface{}{
			button("全部更新", updateCallbackData(session.ID, "confirm_all", -1), "all"),
		}})
	}
	return &Keyboard{Raw: map[string]interface{}{
		"content": map[string]interface{}{
			"rows": rows,
		},
	}}
}

func button(label string, data string, id string) map[string]interface{} {
	return map[string]interface{}{
		"id": id,
		"render_data": map[string]interface{}{
			"label": label,
			"style": 1,
		},
		"action": map[string]interface{}{
			"type": 1,
			"data": data,
			"permission": map[string]interface{}{
				"type": 2,
			},
		},
	}
}

type quickAction struct {
	Label   string
	Command string
	ID      string
}

func homeAction() quickAction {
	return quickAction{Label: "首页", Command: "/help", ID: "home"}
}

func quickActionKeyboard(actions []quickAction) *Keyboard {
	if len(actions) == 0 {
		return nil
	}
	rows := make([]interface{}, 0, (len(actions)+1)/2)
	for i := 0; i < len(actions); i += 2 {
		buttons := []interface{}{
			button(actions[i].Label, commandCallbackData(actions[i].Command), actions[i].ID),
		}
		if i+1 < len(actions) {
			buttons = append(buttons, button(actions[i+1].Label, commandCallbackData(actions[i+1].Command), actions[i+1].ID))
		}
		rows = append(rows, map[string]interface{}{"buttons": buttons})
	}
	return &Keyboard{Raw: map[string]interface{}{
		"content": map[string]interface{}{"rows": rows},
	}}
}

func commandCallbackData(command string) string {
	return "cmd:" + strings.TrimSpace(command)
}

func parseCommandCallback(data string) (string, bool) {
	command := strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(data), "cmd:"))
	if command == "" || !strings.HasPrefix(command, "/") {
		return "", false
	}
	for _, item := range homeMenuItems {
		if command == item.Command {
			return command, true
		}
	}
	return "", false
}

func shortenText(value string, max int) string {
	runes := []rune(strings.TrimSpace(value))
	if max <= 0 || len(runes) <= max {
		return string(runes)
	}
	return string(runes[:max-1]) + "…"
}

func compactStatus(status string) string {
	value := strings.TrimSpace(status)
	if value == "" {
		return "unknown"
	}
	lower := strings.ToLower(value)
	switch {
	case strings.Contains(lower, "running"):
		return "running"
	case strings.Contains(lower, "exited"), strings.Contains(lower, "stopped"):
		return "stopped"
	default:
		return shortenText(value, 18)
	}
}

func enrichMarkdown(msg Message, enabled bool) Message {
	if !enabled || msg.Markdown != nil {
		return msg
	}
	msg.Markdown = &Markdown{Content: msg.Text}
	return msg
}

func richMessage(msg Message, cfg Config) Message {
	if !cfg.ButtonsEnabled {
		msg.Keyboard = nil
	}
	return enrichMarkdown(msg, cfg.MarkdownEnabled)
}
