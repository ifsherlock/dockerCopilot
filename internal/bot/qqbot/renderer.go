package qqbot

import (
	"fmt"
	"strings"
)

func renderHome() Message {
	return enrichMarkdown(Message{Text: "DockerCopilot QQ 官方机器人\n\n/start 帮助\n/status 查看概览\n/updates 查看可更新容器"}, false)
}

func renderStatus(summary StatusSummary, markdownEnabled bool) Message {
	return enrichMarkdown(Message{Text: fmt.Sprintf(
		"DockerCopilot 状态\n\n容器: %d\n运行中: %d\n已停止: %d\n可更新: %d\n\n发送 /updates 查看可更新容器。",
		summary.Containers,
		summary.Running,
		summary.Stopped,
		summary.UpdateCount,
	)}, markdownEnabled)
}

func renderUpdates(items []ContainerUpdateItem, session updateSession, cfg Config) Message {
	if len(items) == 0 {
		return enrichMarkdown(Message{Text: "当前没有可更新容器。"}, cfg.MarkdownEnabled)
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
		return enrichMarkdown(Message{Text: b.String()}, cfg.MarkdownEnabled)
	}
	return enrichMarkdown(Message{
		Text:     b.String(),
		Keyboard: updatesKeyboard(items, session),
	}, cfg.MarkdownEnabled)
}

func renderConfirm(item ContainerUpdateItem, sessionID string, index int, cfg Config) Message {
	text := fmt.Sprintf("确认更新容器？\n\n%s\n%s", item.Name, firstNonEmpty(item.CreateImage, item.UsingImage))
	if !cfg.ButtonsEnabled {
		return enrichMarkdown(Message{Text: text + "\n\n按钮未启用，请发送 /updates 重新查看。"}, cfg.MarkdownEnabled)
	}
	return enrichMarkdown(Message{
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
	}, cfg.MarkdownEnabled)
}

func renderConfirmAll(items []ContainerUpdateItem, sessionID string, cfg Config) Message {
	text := fmt.Sprintf("确认批量更新 %d 个容器？", len(items))
	if !cfg.ButtonsEnabled {
		return enrichMarkdown(Message{Text: text + "\n\n按钮未启用，请发送 /updates 重新查看。"}, cfg.MarkdownEnabled)
	}
	return enrichMarkdown(Message{
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
	}, cfg.MarkdownEnabled)
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
			"type": 2,
			"data": data,
		},
	}
}

func shortenText(value string, max int) string {
	runes := []rune(strings.TrimSpace(value))
	if max <= 0 || len(runes) <= max {
		return string(runes)
	}
	return string(runes[:max-1]) + "…"
}

func enrichMarkdown(msg Message, enabled bool) Message {
	if !enabled || msg.Markdown != nil {
		return msg
	}
	msg.Markdown = &Markdown{Content: msg.Text}
	return msg
}
