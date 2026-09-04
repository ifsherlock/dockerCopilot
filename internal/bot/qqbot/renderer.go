package qqbot

import (
	"fmt"
	"math"
	"strings"
)

const (
	qqListPageSize       = 6
	qqListButtonsPerRow  = 2
	qqListButtonLabelMax = 14
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
	msg := Message{Text: homeText(cfg.ButtonsEnabled), PlainText: homeText(false)}
	if cfg.MarkdownEnabled && cfg.ButtonsEnabled {
		msg.Keyboard = homeKeyboard()
	}
	return enrichMarkdown(msg, cfg.MarkdownEnabled)
}

func homeText(compact bool) string {
	if compact {
		return strings.Join([]string{
			"DockerCopilot QQ 官方机器人",
			"",
			"选择功能：",
			"概览 / 容器 / 镜像 / 更新 / 备份 / 版本",
		}, "\n")
	}
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
	home.Text = renderNoticeText("按钮已失效", strings.TrimSpace(reason), "请选择下方按钮重新打开功能。", true)
	home.PlainText = renderNoticeText("按钮已失效", strings.TrimSpace(reason), "请选择下方按钮重新打开功能。", false)
	if home.Markdown != nil {
		home.Markdown.Content = home.Text
	}
	return home
}

func renderStatus(summary StatusSummary, cfg Config) Message {
	return richMessage(Message{
		Text:      renderStatusText(summary, cfg.MarkdownEnabled),
		PlainText: renderStatusText(summary, false),
		Keyboard: quickActionKeyboard([]quickAction{
			{Label: "查看更新", Command: "/updates", ID: "updates"},
			{Label: "容器列表", Command: "/containers", ID: "containers"},
			homeAction(),
		}),
	}, cfg)
}

func renderStatusText(summary StatusSummary, markdown bool) string {
	if markdown {
		var b strings.Builder
		b.WriteString("**DockerCopilot 状态**\n\n")
		b.WriteString(markdownKV("容器", fmt.Sprintf("%d", summary.Containers)))
		b.WriteString(markdownKV("🟢 运行中", fmt.Sprintf("%d", summary.Running)))
		b.WriteString(markdownKV("⚪ 已停止", fmt.Sprintf("%d", summary.Stopped)))
		b.WriteString(markdownKV("↑ 可更新", fmt.Sprintf("%d", summary.UpdateCount)))
		b.WriteString("\n" + renderHintText("点击“查看更新”或发送 `/updates` 查看详情。", true))
		return strings.TrimSpace(b.String())
	}
	return fmt.Sprintf(
		"DockerCopilot 状态\n\n容器: %d\n运行中: %d\n已停止: %d\n可更新: %d\n\n发送 /updates 查看可更新容器。",
		summary.Containers,
		summary.Running,
		summary.Stopped,
		summary.UpdateCount,
	)
}

func renderUpdates(items []ContainerUpdateItem, session updateSession, cfg Config) Message {
	instanceName := notificationInstanceName(session.InstanceName)
	updateCommand := updateCommandForInstance(instanceName)
	if len(items) == 0 {
		return richMessage(Message{
			Text:      renderNoticeText("可更新容器", "实例: "+instanceName+"\n当前没有可更新容器。", "可以点击刷新检测重新检查。", cfg.MarkdownEnabled),
			PlainText: renderNoticeText("可更新容器", "实例: "+instanceName+"\n当前没有可更新容器。", "可以点击刷新检测重新检查。", false),
			Keyboard:  quickActionKeyboard([]quickAction{{Label: "刷新检测", Command: "/check_updates " + instanceName, ID: "check"}, homeAction()}),
		}, cfg)
	}
	text := renderUpdatesText(items, instanceName, cfg.MarkdownEnabled, 8)
	plain := renderUpdatesText(items, instanceName, false, 8)
	if !cfg.ButtonsEnabled {
		text += "\n\n" + renderHintText("按钮未启用，可发送 "+updateCommand+" 刷新列表。", cfg.MarkdownEnabled)
		plain += "\n\n" + renderHintText("按钮未启用，可发送 "+updateCommand+" 刷新列表。", false)
		return richMessage(Message{Text: text, PlainText: plain}, cfg)
	}
	return richMessage(Message{
		Text:      text,
		PlainText: plain,
		Keyboard:  updatesKeyboard(items, session),
	}, cfg)
}

func renderUpdatesText(items []ContainerUpdateItem, instanceName string, markdown bool, limit int) string {
	if limit <= 0 || limit > len(items) {
		limit = len(items)
	}
	if markdown {
		var b strings.Builder
		b.WriteString(fmt.Sprintf("**可更新容器** · %d 个\n\n", len(items)))
		b.WriteString(markdownKV("实例", notificationInstanceName(instanceName)))
		b.WriteString("\n")
		for i := 0; i < limit; i++ {
			item := items[i]
			ref := firstNonEmpty(item.UsingImage, item.CreateImage)
			b.WriteString(fmt.Sprintf("%d. **%s**\n", i+1, markdownInline(shortenText(item.Name, 24))))
			if strings.TrimSpace(ref) != "" {
				b.WriteString("   `" + markdownCodeInline(shortenText(ref, 34)) + "`\n")
			}
		}
		if len(items) > limit {
			b.WriteString("\n" + renderHintText(fmt.Sprintf("还有 %d 个未显示，请发送 `/updates` 查看完整交互列表。", len(items)-limit), true))
		}
		return strings.TrimSpace(b.String())
	}
	var b strings.Builder
	b.WriteString(fmt.Sprintf("可更新容器：%d 个\n实例: %s\n\n", len(items), notificationInstanceName(instanceName)))
	for i := 0; i < limit; i++ {
		item := items[i]
		b.WriteString(fmt.Sprintf("%d. %s\n", i+1, item.Name))
		if ref := strings.TrimSpace(firstNonEmpty(item.UsingImage, item.CreateImage)); ref != "" {
			b.WriteString("   " + shortenText(ref, 52) + "\n")
		}
	}
	if len(items) > limit {
		b.WriteString(fmt.Sprintf("\n还有 %d 个未显示。", len(items)-limit))
	}
	return strings.TrimSpace(b.String())
}

func renderContainers(items []ContainerInfoLite, cfg Config) Message {
	session := containerSession{ID: "legacy", Items: append([]ContainerInfoLite(nil), items...)}
	return renderContainersPage(items, session, 0, cfg)
}

func renderContainersPage(items []ContainerInfoLite, session containerSession, page int, cfg Config) Message {
	if len(items) == 0 {
		return richMessage(Message{Text: "当前没有容器。", Keyboard: homeKeyboard()}, cfg)
	}
	start, end, page, pages := pageBounds(len(items), page, qqListPageSize)
	text := containersPageText(items, start, end, page, pages, true)
	plain := containersPageText(items, start, end, page, pages, false)
	if !cfg.ButtonsEnabled {
		text += "\n\n按钮未启用，可发送 /containers 重新查看。"
		plain += "\n\n按钮未启用，可发送 /containers 重新查看。"
		return richMessage(Message{Text: strings.TrimSpace(text), PlainText: strings.TrimSpace(plain)}, cfg)
	}
	return richMessage(Message{
		Text:      strings.TrimSpace(text),
		PlainText: strings.TrimSpace(plain),
		Keyboard:  containersPageKeyboard(items, session, page),
	}, cfg)
}

func containersPageText(items []ContainerInfoLite, start, end, page, pages int, markdown bool) string {
	var b strings.Builder
	if markdown {
		b.WriteString(fmt.Sprintf("**容器列表** · %d 个 · 第 %d/%d 页\n\n", len(items), page+1, pages))
		for i := start; i < end; i++ {
			item := items[i]
			b.WriteString(fmt.Sprintf("%d. %s **%s**\n", i+1, containerStatusEmoji(item.Status), markdownInline(shortenText(item.Name+containerUpdateBadge(item), 24))))
			if image := strings.TrimSpace(item.Image); image != "" {
				b.WriteString("   `" + markdownCodeInline(shortenText(image, 30)) + "`\n")
			}
		}
		return strings.TrimSpace(b.String())
	}
	b.WriteString(fmt.Sprintf("容器列表：%d 个（第 %d/%d 页）\n\n", len(items), page+1, pages))
	for i := start; i < end; i++ {
		item := items[i]
		b.WriteString(fmt.Sprintf("%d. %s %s%s\n", i+1, containerStatusEmoji(item.Status), item.Name, containerUpdateBadge(item)))
		if image := strings.TrimSpace(item.Image); image != "" {
			b.WriteString("   镜像: " + shortenText(image, 54) + "\n")
		}
	}
	return strings.TrimSpace(b.String())
}

func renderContainerDetail(item ContainerInfoLite, sessionID string, index int, page int, cfg Config) Message {
	keyboard := containerDetailKeyboard(item, sessionID, index, page)
	if !cfg.ButtonsEnabled {
		keyboard = nil
	}
	return richMessage(Message{
		Text:      containerDetailText(item, cfg.MarkdownEnabled),
		PlainText: containerDetailText(item, false),
		Keyboard:  keyboard,
	}, cfg)
}

func containerDetailText(item ContainerInfoLite, markdown bool) string {
	var b strings.Builder
	if markdown {
		b.WriteString("**容器详情**\n\n")
		b.WriteString(markdownKV("名称", firstNonEmpty(item.Name, "未知")))
		b.WriteString(markdownKV("状态", containerStatusEmoji(item.Status)+" "+containerStatusLabel(item.Status)))
		if image := strings.TrimSpace(item.Image); image != "" {
			b.WriteString(markdownKV("镜像", image))
		}
		if runningFor := strings.TrimSpace(item.RunningFor); runningFor != "" {
			b.WriteString(markdownKV("运行时长", runningFor))
		}
		if createdAt := strings.TrimSpace(item.CreatedAt); createdAt != "" {
			b.WriteString(markdownKV("创建时间", createdAt))
		}
		if updateState := containerUpdateText(item); updateState != "" {
			b.WriteString(markdownKV("更新状态", updateState))
		}
	} else {
		b.WriteString("容器详情\n\n")
		b.WriteString("名称: " + firstNonEmpty(item.Name, "未知") + "\n")
		b.WriteString("状态: " + containerStatusEmoji(item.Status) + " " + containerStatusLabel(item.Status) + "\n")
		if image := strings.TrimSpace(item.Image); image != "" {
			b.WriteString("镜像: " + image + "\n")
		}
		if runningFor := strings.TrimSpace(item.RunningFor); runningFor != "" {
			b.WriteString("运行时长: " + runningFor + "\n")
		}
		if createdAt := strings.TrimSpace(item.CreatedAt); createdAt != "" {
			b.WriteString("创建时间: " + createdAt + "\n")
		}
		if updateState := containerUpdateText(item); updateState != "" {
			b.WriteString("更新状态: " + updateState + "\n")
		}
	}
	if item.IsSelf {
		b.WriteString("\n当前容器是 DockerCopilot 自身，已隐藏停止和重启按钮。")
	}
	return strings.TrimSpace(b.String())
}

func renderContainerActionResult(item ContainerInfoLite, msg string, sessionID string, index int, page int, cfg Config) Message {
	text := renderActionResultText("容器操作", firstNonEmpty(msg, "容器操作已提交"), "容器", firstNonEmpty(item.Name, "未知"), cfg.MarkdownEnabled)
	plain := renderActionResultText("容器操作", firstNonEmpty(msg, "容器操作已提交"), "容器", firstNonEmpty(item.Name, "未知"), false)
	keyboard := &Keyboard{Raw: map[string]interface{}{
		"content": map[string]interface{}{
			"rows": []interface{}{
				map[string]interface{}{"buttons": []interface{}{
					button("返回详情", containerCallbackData(sessionID, "item", index, page), "detail"),
					button("容器列表", containerCallbackData(sessionID, "page", -1, page), "list"),
				}},
				map[string]interface{}{"buttons": []interface{}{
					button("首页", commandCallbackData("/help"), "home"),
				}},
			},
		},
	}}
	return richMessage(Message{Text: text, PlainText: plain, Keyboard: keyboard}, cfg)
}

func renderImagesPage(items []ImageInfoLite, session imageSession, page int, cfg Config) Message {
	if len(items) == 0 {
		return richMessage(Message{Text: "当前没有镜像。", Keyboard: homeKeyboard()}, cfg)
	}
	start, end, page, pages := pageBounds(len(items), page, qqListPageSize)
	text := imagesPageText(items, start, end, page, pages, true)
	plain := imagesPageText(items, start, end, page, pages, false)
	if !cfg.ButtonsEnabled {
		text += "\n\n按钮未启用，可发送 /images 重新查看。"
		plain += "\n\n按钮未启用，可发送 /images 重新查看。"
		return richMessage(Message{Text: strings.TrimSpace(text), PlainText: strings.TrimSpace(plain)}, cfg)
	}
	return richMessage(Message{
		Text:      strings.TrimSpace(text),
		PlainText: strings.TrimSpace(plain),
		Keyboard:  imagesPageKeyboard(items, session, page),
	}, cfg)
}

func imagesPageText(items []ImageInfoLite, start, end, page, pages int, markdown bool) string {
	var b strings.Builder
	if markdown {
		b.WriteString(fmt.Sprintf("**镜像列表** · %d 个 · 第 %d/%d 页\n\n", len(items), page+1, pages))
		for i := start; i < end; i++ {
			item := items[i]
			b.WriteString(fmt.Sprintf("%d. %s **%s**\n", i+1, imageUsageEmoji(item), markdownInline(shortenText(imageDisplayName(item)+imageUpdateBadge(item), 30))))
			if size := strings.TrimSpace(item.Size); size != "" {
				b.WriteString("   大小 " + markdownInline(shortenText(size, 14)) + "\n")
			}
		}
		return strings.TrimSpace(b.String())
	}
	b.WriteString(fmt.Sprintf("镜像列表：%d 个（第 %d/%d 页）\n\n", len(items), page+1, pages))
	for i := start; i < end; i++ {
		item := items[i]
		b.WriteString(fmt.Sprintf("%d. %s %s%s\n", i+1, imageUsageEmoji(item), imageDisplayName(item), imageUpdateBadge(item)))
		if size := strings.TrimSpace(item.Size); size != "" {
			b.WriteString("   大小: " + size + "\n")
		}
	}
	return strings.TrimSpace(b.String())
}

func renderImageDetail(item ImageInfoLite, sessionID string, index int, page int, cfg Config) Message {
	keyboard := imageDetailKeyboard(item, sessionID, index, page)
	if !cfg.ButtonsEnabled {
		keyboard = nil
	}
	return richMessage(Message{
		Text:      imageDetailText(item, cfg.MarkdownEnabled),
		PlainText: imageDetailText(item, false),
		Keyboard:  keyboard,
	}, cfg)
}

func imageDetailText(item ImageInfoLite, markdown bool) string {
	var b strings.Builder
	if markdown {
		b.WriteString("**镜像详情**\n\n")
		b.WriteString(markdownKV("名称", imageDisplayName(item)))
		b.WriteString(markdownKV("状态", imageUsageEmoji(item)+" "+imageUsageLabel(item)))
		if size := strings.TrimSpace(item.Size); size != "" {
			b.WriteString(markdownKV("大小", size))
		}
		if reason := strings.TrimSpace(item.CleanupReason); reason != "" {
			b.WriteString(markdownKV("清理原因", reason))
		}
		if updateState := imageUpdateText(item); updateState != "" {
			b.WriteString(markdownKV("更新状态", updateState))
		}
	} else {
		b.WriteString("镜像详情\n\n")
		b.WriteString("名称: " + imageDisplayName(item) + "\n")
		b.WriteString("状态: " + imageUsageEmoji(item) + " " + imageUsageLabel(item) + "\n")
		if size := strings.TrimSpace(item.Size); size != "" {
			b.WriteString("大小: " + size + "\n")
		}
		if reason := strings.TrimSpace(item.CleanupReason); reason != "" {
			b.WriteString("清理原因: " + reason + "\n")
		}
		if updateState := imageUpdateText(item); updateState != "" {
			b.WriteString("更新状态: " + updateState + "\n")
		}
	}
	if item.InUse {
		b.WriteString("\n镜像仍在使用中，已隐藏删除按钮。")
	}
	return strings.TrimSpace(b.String())
}

func renderImageDeleteConfirm(item ImageInfoLite, sessionID string, index int, page int, cfg Config) Message {
	text := renderConfirmDeleteImageText(item, cfg.MarkdownEnabled)
	plain := renderConfirmDeleteImageText(item, false)
	keyboard := &Keyboard{Raw: map[string]interface{}{
		"content": map[string]interface{}{
			"rows": []interface{}{
				map[string]interface{}{"buttons": []interface{}{
					button("确认删除", imageCallbackData(sessionID, "delete", index, page), "delete"),
					button("返回详情", imageCallbackData(sessionID, "item", index, page), "detail"),
				}},
				map[string]interface{}{"buttons": []interface{}{
					button("镜像列表", imageCallbackData(sessionID, "page", -1, page), "list"),
					button("首页", commandCallbackData("/help"), "home"),
				}},
			},
		},
	}}
	return richMessage(Message{Text: text, PlainText: plain, Keyboard: keyboard}, cfg)
}

func renderImageActionResult(item ImageInfoLite, msg string, sessionID string, page int, cfg Config) Message {
	text := renderActionResultText("镜像操作", firstNonEmpty(msg, "镜像操作已完成"), "镜像", imageDisplayName(item), cfg.MarkdownEnabled)
	plain := renderActionResultText("镜像操作", firstNonEmpty(msg, "镜像操作已完成"), "镜像", imageDisplayName(item), false)
	keyboard := &Keyboard{Raw: map[string]interface{}{
		"content": map[string]interface{}{
			"rows": []interface{}{
				map[string]interface{}{"buttons": []interface{}{
					button("镜像列表", imageCallbackData(sessionID, "page", -1, page), "list"),
					button("首页", commandCallbackData("/help"), "home"),
				}},
			},
		},
	}}
	return richMessage(Message{Text: text, PlainText: plain, Keyboard: keyboard}, cfg)
}

func renderBackups(summary BackupSummary, cfg Config) Message {
	if len(summary.Files) == 0 {
		return richMessage(Message{
			Text:      renderNoticeText("备份列表", "当前没有备份文件。", "可以点击下方按钮创建备份。", cfg.MarkdownEnabled),
			PlainText: renderNoticeText("备份列表", "当前没有备份文件。", "可以点击下方按钮创建备份。", false),
			Keyboard: quickActionKeyboard([]quickAction{
				{Label: "JSON备份", Command: "/backup", ID: "backup"},
				{Label: "Compose备份", Command: "/backup_compose", ID: "compose"},
				homeAction(),
			}),
		}, cfg)
	}
	return richMessage(Message{
		Text:      renderBackupsText(summary, cfg.MarkdownEnabled),
		PlainText: renderBackupsText(summary, false),
		Keyboard: quickActionKeyboard([]quickAction{
			{Label: "JSON备份", Command: "/backup", ID: "backup"},
			{Label: "Compose备份", Command: "/backup_compose", ID: "compose"},
			homeAction(),
		}),
	}, cfg)
}

func renderBackupsText(summary BackupSummary, markdown bool) string {
	limit := len(summary.Files)
	if limit > 10 {
		limit = 10
	}
	if markdown {
		var b strings.Builder
		b.WriteString(fmt.Sprintf("**备份列表** · %d 个\n\n", len(summary.Files)))
		for i := 0; i < limit; i++ {
			b.WriteString(fmt.Sprintf("%d. `%s`\n", i+1, markdownCodeInline(shortenText(summary.Files[i], 58))))
		}
		if len(summary.Files) > limit {
			b.WriteString("\n" + renderHintText(fmt.Sprintf("还有 %d 个未显示。", len(summary.Files)-limit), true))
		}
		return strings.TrimSpace(b.String())
	}
	var b strings.Builder
	b.WriteString(fmt.Sprintf("备份列表：%d 个\n\n", len(summary.Files)))
	for i := 0; i < limit; i++ {
		b.WriteString(fmt.Sprintf("%d. %s\n", i+1, shortenText(summary.Files[i], 58)))
	}
	if len(summary.Files) > limit {
		b.WriteString(fmt.Sprintf("\n还有 %d 个未显示。", len(summary.Files)-limit))
	}
	return strings.TrimSpace(b.String())
}

func renderVersion(summary VersionSummary, cfg Config) Message {
	local := firstNonEmpty(summary.LocalVersion, "未知")
	remote := firstNonEmpty(summary.RemoteVersion, "未知")
	status := firstNonEmpty(summary.RemoteStatus, "未知")
	buildDate := firstNonEmpty(summary.BuildDate, "未知")
	return richMessage(Message{
		Text:      renderVersionText(local, buildDate, remote, status, cfg.MarkdownEnabled),
		PlainText: renderVersionText(local, buildDate, remote, status, false),
		Keyboard: quickActionKeyboard([]quickAction{
			{Label: "刷新检测", Command: "/check_updates", ID: "check"},
			homeAction(),
		}),
	}, cfg)
}

func renderVersionText(local string, buildDate string, remote string, status string, markdown bool) string {
	if markdown {
		var b strings.Builder
		b.WriteString("**版本信息**\n\n")
		b.WriteString(markdownKV("本地版本", local))
		b.WriteString(markdownKV("构建时间", buildDate))
		b.WriteString(markdownKV("远端版本", remote))
		b.WriteString(markdownKV("状态", status))
		return strings.TrimSpace(b.String())
	}
	return fmt.Sprintf("版本信息\n\n本地版本: %s\n构建时间: %s\n远端版本: %s\n状态: %s", local, buildDate, remote, status)
}

func renderConfirm(item ContainerUpdateItem, sessionID string, index int, cfg Config) Message {
	text := renderConfirmUpdateText(item, cfg.MarkdownEnabled)
	plain := renderConfirmUpdateText(item, false)
	if !cfg.ButtonsEnabled {
		return richMessage(Message{
			Text:      text + "\n\n" + renderHintText("按钮未启用，请发送 `/updates` 重新查看。", cfg.MarkdownEnabled),
			PlainText: plain + "\n\n" + renderHintText("按钮未启用，请发送 /updates 重新查看。", false),
		}, cfg)
	}
	return richMessage(Message{
		Text:      text,
		PlainText: plain,
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
	text := renderConfirmAllText(items, cfg.MarkdownEnabled)
	plain := renderConfirmAllText(items, false)
	if !cfg.ButtonsEnabled {
		return richMessage(Message{
			Text:      text + "\n\n" + renderHintText("按钮未启用，请发送 `/updates` 重新查看。", cfg.MarkdownEnabled),
			PlainText: plain + "\n\n" + renderHintText("按钮未启用，请发送 /updates 重新查看。", false),
		}, cfg)
	}
	return richMessage(Message{
		Text:      text,
		PlainText: plain,
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

func renderConfirmUpdateText(item ContainerUpdateItem, markdown bool) string {
	ref := firstNonEmpty(item.CreateImage, item.UsingImage)
	instanceName := notificationInstanceName(item.InstanceName)
	if markdown {
		var b strings.Builder
		b.WriteString("**确认更新容器？**\n\n")
		b.WriteString(markdownKV("实例", instanceName))
		b.WriteString(markdownKV("容器", item.Name))
		if ref != "" {
			b.WriteString(markdownKV("镜像", ref))
		}
		return strings.TrimSpace(b.String())
	}
	return fmt.Sprintf("确认更新容器？\n\n实例: %s\n%s\n%s", instanceName, item.Name, ref)
}

func renderConfirmAllText(items []ContainerUpdateItem, markdown bool) string {
	instanceName := "local"
	if len(items) > 0 {
		instanceName = notificationInstanceName(items[0].InstanceName)
	}
	if markdown {
		var b strings.Builder
		b.WriteString(fmt.Sprintf("**确认批量更新？** · %d 个容器\n\n", len(items)))
		b.WriteString(markdownKV("实例", instanceName))
		b.WriteString("\n")
		limit := len(items)
		if limit > 8 {
			limit = 8
		}
		for i := 0; i < limit; i++ {
			b.WriteString(fmt.Sprintf("%d. **%s**\n", i+1, markdownInline(shortenText(items[i].Name, 32))))
		}
		if len(items) > limit {
			b.WriteString("\n" + renderHintText(fmt.Sprintf("还有 %d 个未显示。", len(items)-limit), true))
		}
		return strings.TrimSpace(b.String())
	}
	return fmt.Sprintf("确认批量更新 %d 个容器？\n实例: %s", len(items), instanceName)
}

func renderConfirmDeleteImageText(item ImageInfoLite, markdown bool) string {
	if markdown {
		var b strings.Builder
		b.WriteString("**确认删除镜像？**\n\n")
		b.WriteString(markdownKV("镜像", imageDisplayName(item)))
		b.WriteString(markdownKV("状态", imageUsageEmoji(item)+" "+imageUsageLabel(item)))
		return strings.TrimSpace(b.String())
	}
	return fmt.Sprintf("确认删除镜像？\n\n%s\n状态: %s", imageDisplayName(item), imageUsageLabel(item))
}

func renderActionResultText(title string, message string, key string, value string, markdown bool) string {
	if markdown {
		var b strings.Builder
		b.WriteString("**" + markdownInline(title) + "**\n\n")
		b.WriteString(markdownKV("结果", message))
		b.WriteString(markdownKV(key, value))
		return strings.TrimSpace(b.String())
	}
	return fmt.Sprintf("%s\n\n%s: %s", message, key, value)
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

func containersPageKeyboard(items []ContainerInfoLite, session containerSession, page int) *Keyboard {
	start, end, page, pages := pageBounds(len(items), page, qqListPageSize)
	rows := make([]interface{}, 0, 5)
	for i := start; i < end; i += qqListButtonsPerRow {
		buttons := make([]interface{}, 0, qqListButtonsPerRow)
		for j := i; j < end && j < i+qqListButtonsPerRow; j++ {
			label := fmt.Sprintf("%d %s", j+1, shortenText(items[j].Name, qqListButtonLabelMax))
			buttons = append(buttons, button(label, containerCallbackData(session.ID, "item", j, page), fmt.Sprintf("c%d", j)))
		}
		rows = append(rows, map[string]interface{}{"buttons": buttons})
	}
	rows = append(rows, containerListFooterRows(session.ID, page, pages)...)
	return &Keyboard{Raw: map[string]interface{}{"content": map[string]interface{}{"rows": rows}}}
}

func containerDetailKeyboard(item ContainerInfoLite, sessionID string, index int, page int) *Keyboard {
	rows := make([]interface{}, 0, 3)
	ops := make([]interface{}, 0, 3)
	if !item.IsSelf {
		status := compactStatus(item.Status)
		if status == "running" {
			ops = append(ops,
				button("停止", containerCallbackData(sessionID, "stop", index, page), "stop"),
				button("重启", containerCallbackData(sessionID, "restart", index, page), "restart"),
			)
		} else {
			ops = append(ops, button("启动", containerCallbackData(sessionID, "start", index, page), "start"))
		}
	}
	if item.HaveUpdate && !item.Ignored {
		ops = append(ops, button("更新", commandCallbackData("/updates"), "updates"))
	}
	if len(ops) > 0 {
		rows = append(rows, map[string]interface{}{"buttons": ops})
	}
	rows = append(rows, map[string]interface{}{"buttons": []interface{}{
		button("返回列表", containerCallbackData(sessionID, "page", -1, page), "list"),
		button("刷新列表", commandCallbackData("/containers"), "refresh"),
		button("首页", commandCallbackData("/help"), "home"),
	}})
	return &Keyboard{Raw: map[string]interface{}{"content": map[string]interface{}{"rows": rows}}}
}

func imagesPageKeyboard(items []ImageInfoLite, session imageSession, page int) *Keyboard {
	start, end, page, pages := pageBounds(len(items), page, qqListPageSize)
	rows := make([]interface{}, 0, 5)
	for i := start; i < end; i += qqListButtonsPerRow {
		buttons := make([]interface{}, 0, qqListButtonsPerRow)
		for j := i; j < end && j < i+qqListButtonsPerRow; j++ {
			label := fmt.Sprintf("%d %s", j+1, shortenText(imageDisplayName(items[j]), qqListButtonLabelMax))
			buttons = append(buttons, button(label, imageCallbackData(session.ID, "item", j, page), fmt.Sprintf("i%d", j)))
		}
		rows = append(rows, map[string]interface{}{"buttons": buttons})
	}
	rows = append(rows, imageListFooterRows(session.ID, page, pages)...)
	return &Keyboard{Raw: map[string]interface{}{"content": map[string]interface{}{"rows": rows}}}
}

func imageDetailKeyboard(item ImageInfoLite, sessionID string, index int, page int) *Keyboard {
	rows := make([]interface{}, 0, 3)
	if !item.InUse {
		rows = append(rows, map[string]interface{}{"buttons": []interface{}{
			button("删除镜像", imageCallbackData(sessionID, "confirm_delete", index, page), "delete"),
			button("清理镜像", commandCallbackData("/clean_images"), "clean"),
		}})
	}
	rows = append(rows, map[string]interface{}{"buttons": []interface{}{
		button("返回列表", imageCallbackData(sessionID, "page", -1, page), "list"),
		button("刷新列表", commandCallbackData("/images"), "refresh"),
		button("首页", commandCallbackData("/help"), "home"),
	}})
	return &Keyboard{Raw: map[string]interface{}{"content": map[string]interface{}{"rows": rows}}}
}

func containerListFooterRows(sessionID string, page int, pages int) []interface{} {
	nav := make([]interface{}, 0, 2)
	if page > 0 {
		nav = append(nav, button("上一页", containerCallbackData(sessionID, "page", -1, page-1), "prev"))
	}
	if page+1 < pages {
		nav = append(nav, button("下一页", containerCallbackData(sessionID, "page", -1, page+1), "next"))
	}
	rows := make([]interface{}, 0, 2)
	if len(nav) > 0 {
		rows = append(rows, map[string]interface{}{"buttons": nav})
	}
	rows = append(rows, map[string]interface{}{"buttons": []interface{}{
		button("刷新", commandCallbackData("/containers"), "refresh"),
		button("可更新", commandCallbackData("/updates"), "updates"),
		button("首页", commandCallbackData("/help"), "home"),
	}})
	return rows
}

func imageListFooterRows(sessionID string, page int, pages int) []interface{} {
	nav := make([]interface{}, 0, 2)
	if page > 0 {
		nav = append(nav, button("上一页", imageCallbackData(sessionID, "page", -1, page-1), "prev"))
	}
	if page+1 < pages {
		nav = append(nav, button("下一页", imageCallbackData(sessionID, "page", -1, page+1), "next"))
	}
	rows := make([]interface{}, 0, 2)
	if len(nav) > 0 {
		rows = append(rows, map[string]interface{}{"buttons": nav})
	}
	rows = append(rows, map[string]interface{}{"buttons": []interface{}{
		button("刷新", commandCallbackData("/images"), "refresh"),
		button("清理", commandCallbackData("/clean_images"), "clean"),
		button("首页", commandCallbackData("/help"), "home"),
	}})
	return rows
}

func button(label string, data string, id string) map[string]interface{} {
	return map[string]interface{}{
		"id": id,
		"render_data": map[string]interface{}{
			"label":         label,
			"visited_label": label,
			"style":         1,
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

func containerStatusEmoji(status string) string {
	switch compactStatus(status) {
	case "running":
		return "🟢"
	case "stopped":
		return "⚪"
	default:
		return "🟡"
	}
}

func containerStatusLabel(status string) string {
	switch compactStatus(status) {
	case "running":
		return "运行中"
	case "stopped":
		return "已停止"
	case "unknown":
		return "未知"
	default:
		return compactStatus(status)
	}
}

func containerUpdateBadge(item ContainerInfoLite) string {
	if item.HaveUpdate && !item.Ignored {
		return " ↑"
	}
	if item.Ignored {
		return " ⛔"
	}
	return ""
}

func containerUpdateText(item ContainerInfoLite) string {
	if item.HaveUpdate && !item.Ignored {
		return "↑ 可更新"
	}
	if item.Ignored {
		return "⛔ 已忽略"
	}
	return ""
}

func pageBounds(total int, page int, size int) (int, int, int, int) {
	if size <= 0 {
		size = qqListPageSize
	}
	if total <= 0 {
		return 0, 0, 0, 1
	}
	pages := int(math.Ceil(float64(total) / float64(size)))
	if page < 0 {
		page = 0
	}
	if page >= pages {
		page = pages - 1
	}
	start := page * size
	end := start + size
	if end > total {
		end = total
	}
	return start, end, page, pages
}

func imageDisplayName(item ImageInfoLite) string {
	name := strings.TrimSpace(item.Name)
	tag := strings.TrimSpace(item.Tag)
	switch {
	case name == "" && tag == "":
		return firstNonEmpty(shortenID(item.ID), "未知镜像")
	case name == "":
		return tag
	case tag == "", tag == "<none>":
		return name
	default:
		return name + ":" + tag
	}
}

func imageUsageLabel(item ImageInfoLite) string {
	if value := strings.TrimSpace(item.UsageState); value != "" {
		return value
	}
	if item.InUse {
		return "使用中"
	}
	if item.CleanupCandidate {
		return "可清理"
	}
	return "未使用"
}

func imageUsageEmoji(item ImageInfoLite) string {
	if item.InUse {
		return "🟢"
	}
	if item.CleanupCandidate {
		return "🧹"
	}
	return "⚪"
}

func imageUpdateBadge(item ImageInfoLite) string {
	if item.HaveUpdate && !item.Ignored {
		return " ↑"
	}
	if item.Ignored {
		return " ⛔"
	}
	return ""
}

func imageUpdateText(item ImageInfoLite) string {
	if item.HaveUpdate && !item.Ignored {
		return "↑ 可更新"
	}
	if item.Ignored {
		return "⛔ 已忽略"
	}
	return ""
}

func shortenID(id string) string {
	value := strings.TrimPrefix(strings.TrimSpace(id), "sha256:")
	return shortenText(value, 12)
}

func markdownKV(key string, value string) string {
	return fmt.Sprintf("**%s**：%s\n", markdownInline(key), markdownInline(value))
}

func markdownInline(value string) string {
	value = strings.TrimSpace(value)
	value = strings.ReplaceAll(value, "|", "\\|")
	value = strings.ReplaceAll(value, "\n", " ")
	value = strings.ReplaceAll(value, "*", "\\*")
	return value
}

func markdownCodeInline(value string) string {
	value = strings.TrimSpace(value)
	value = strings.ReplaceAll(value, "\n", " ")
	value = strings.ReplaceAll(value, "`", "'")
	return value
}

func renderNoticeText(title string, message string, hint string, markdown bool) string {
	if !markdown {
		parts := make([]string, 0, 3)
		if strings.TrimSpace(title) != "" {
			parts = append(parts, strings.TrimSpace(title))
		}
		if strings.TrimSpace(message) != "" {
			parts = append(parts, strings.TrimSpace(message))
		}
		if strings.TrimSpace(hint) != "" {
			parts = append(parts, strings.TrimSpace(hint))
		}
		return strings.Join(parts, "\n\n")
	}
	var b strings.Builder
	b.WriteString("**" + markdownInline(title) + "**\n\n")
	if strings.TrimSpace(message) != "" {
		b.WriteString(markdownInline(message))
	}
	if strings.TrimSpace(hint) != "" {
		b.WriteString("\n\n" + renderHintText(hint, true))
	}
	return strings.TrimSpace(b.String())
}

func renderHintText(text string, markdown bool) string {
	text = strings.TrimSpace(text)
	if text == "" {
		return ""
	}
	if markdown {
		return "> " + strings.ReplaceAll(text, "\n", "\n> ")
	}
	return text
}

func renderErrorText(text string, markdown bool) string {
	if markdown {
		return renderNoticeText("操作失败", text, "请检查配置或稍后重试。", true)
	}
	return text
}

func renderSuccessText(text string, markdown bool) string {
	if markdown {
		return renderNoticeText("操作完成", text, "", true)
	}
	return text
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
