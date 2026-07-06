package telegram

import (
	"context"
	"fmt"
	"strconv"
	"strings"
)

func (r *Runtime) selectContainerAndRefresh(ctx context.Context, chatID int64, messageID int, arg string) {
	parts := strings.Split(arg, ":")
	page := 0
	idx := -1
	if len(parts) > 0 {
		page = parsePage(parts[0])
	}
	if len(parts) > 1 {
		idx, _ = strconv.Atoi(strings.TrimSpace(parts[1]))
	}
	items, _, err := r.listCurrentContainers(ctx, chatID)
	if err != nil {
		r.replyText(ctx, chatID, "❌ 获取容器列表失败: "+err.Error())
		return
	}
	const pageSize = 8
	_, _, start, end := paginate(len(items), page, pageSize)
	if idx < start || idx >= end || idx < 0 || idx >= len(items) {
		r.replyText(ctx, chatID, "❌ 选中的容器不存在")
		return
	}
	selected := items[idx]
	r.setSelectedContainer(chatID, selected.ID)
	r.sendSelectedContainerDetail(ctx, chatID, messageID, page)
}

func (r *Runtime) startSelectedContainer(ctx context.Context, chatID int64) error {
	selectedID := r.selectedContainerID(chatID)
	if selectedID == "" {
		return fmt.Errorf("请先选择容器")
	}
	return r.startContainerOnCurrent(ctx, chatID, selectedID)
}

func (r *Runtime) stopSelectedContainer(ctx context.Context, chatID int64) error {
	selectedID := r.selectedContainerID(chatID)
	if selectedID == "" {
		return fmt.Errorf("请先选择容器")
	}
	return r.stopContainerOnCurrent(ctx, chatID, selectedID)
}

func (r *Runtime) restartSelectedContainer(ctx context.Context, chatID int64) error {
	selectedID := r.selectedContainerID(chatID)
	if selectedID == "" {
		return fmt.Errorf("请先选择容器")
	}
	return r.restartContainerOnCurrent(ctx, chatID, selectedID)
}

func (r *Runtime) updateSelectedContainer(ctx context.Context, chatID int64) {
	selectedID := r.selectedContainerID(chatID)
	if selectedID == "" {
		r.replyText(ctx, chatID, "❌ 请先选择容器")
		return
	}
	r.updateContainer(ctx, chatID, selectedID)
}

func (r *Runtime) updateContainerByPageIndex(ctx context.Context, chatID int64, arg string) {
	id := strings.TrimSpace(arg)
	if id == "" {
		r.replyText(ctx, chatID, "❌ 选中的容器不存在")
		return
	}
	items, _, err := r.listCurrentContainers(ctx, chatID)
	if err != nil {
		r.replyText(ctx, chatID, "❌ 获取容器列表失败: "+err.Error())
		return
	}
	updates := filterUpdatableContainers(items)
	match := ""
	for _, item := range updates {
		if item.ID == id || strings.HasPrefix(item.ID, id) {
			match = item.ID
			break
		}
	}
	if match == "" {
		r.replyText(ctx, chatID, "❌ 选中的容器不存在或已不在可更新列表中")
		return
	}
	r.updateContainer(ctx, chatID, match)
}

func (r *Runtime) updateAllUpdatableContainers(ctx context.Context, chatID int64) {
	items, inst, err := r.listCurrentContainers(ctx, chatID)
	if err != nil {
		r.replyText(ctx, chatID, "❌ 获取容器列表失败: "+err.Error())
		return
	}
	updates := filterUpdatableContainers(items)
	if len(updates) == 0 {
		r.replyText(ctx, chatID, "✅ 当前没有可更新容器")
		return
	}
	failed := make([]string, 0)
	started := make([]string, 0)
	for _, item := range updates {
		name, taskID, err := r.updateContainerOnCurrent(ctx, chatID, item.ID)
		if err != nil {
			failed = append(failed, item.Name)
			continue
		}
		if taskID != "" {
			r.startTaskProgressWatcher(ctx, chatID, inst, "更新容器: "+name, taskID)
		}
		started = append(started, name)
	}
	var b strings.Builder
	b.WriteString("⚡ 全部更新结果\n")
	if len(started) > 0 {
		b.WriteString("\n✅ 已提交:\n")
		for _, name := range started {
			b.WriteString("• " + name + "\n")
		}
	}
	if len(failed) > 0 {
		b.WriteString("\n❌ 提交失败:\n")
		for _, name := range failed {
			b.WriteString("• " + name + "\n")
		}
	}
	r.replyText(ctx, chatID, b.String())
	r.sendUpdates(ctx, chatID)
}

func (r *Runtime) updateAllUpdateSessionItems(ctx context.Context, chatID int64, session updateSession) {
	inst, err := r.currentInstance(ctx, chatID)
	if err != nil {
		r.replyText(ctx, chatID, "❌ 获取当前实例失败: "+err.Error())
		return
	}
	failed := make([]string, 0)
	started := make([]string, 0)
	for _, item := range session.Items {
		if item.UpdateBlocked {
			failed = append(failed, item.Name)
			continue
		}
		name, taskID, err := r.updateContainerOnCurrent(ctx, chatID, item.ID)
		if err != nil {
			failed = append(failed, item.Name)
			continue
		}
		if taskID != "" {
			r.startTaskProgressWatcher(ctx, chatID, inst, "更新容器: "+name, taskID)
		}
		started = append(started, name)
	}
	var b strings.Builder
	b.WriteString("⚡ 批量更新结果\n")
	if len(started) > 0 {
		b.WriteString("\n✅ 已提交:\n")
		for _, name := range started {
			b.WriteString("• " + name + "\n")
		}
	}
	if len(failed) > 0 {
		b.WriteString("\n❌ 提交失败:\n")
		for _, name := range failed {
			b.WriteString("• " + name + "\n")
		}
	}
	r.replyText(ctx, chatID, b.String())
	r.sendUpdates(ctx, chatID)
}

func (r *Runtime) updateAllContainersOnPage(ctx context.Context, chatID int64, messageID int, page int) {
	items, inst, err := r.listCurrentContainers(ctx, chatID)
	if err != nil {
		r.replyText(ctx, chatID, "❌ 获取容器列表失败: "+err.Error())
		return
	}
	const pageSize = 8
	page, _, start, end := paginate(len(items), page, pageSize)
	pageItems := items[start:end]
	updatable := make([]containerView, 0)
	for _, item := range pageItems {
		if item.HaveUpdate && !item.UpdateBlocked {
			updatable = append(updatable, item)
		}
	}
	if len(updatable) == 0 {
		r.replyText(ctx, chatID, "💡 当前页没有可更新容器")
		return
	}
	failed := make([]string, 0)
	started := make([]string, 0)
	for _, item := range updatable {
		name, taskID, err := r.updateContainerOnCurrent(ctx, chatID, item.ID)
		if err != nil {
			failed = append(failed, item.Name)
			continue
		}
		if taskID != "" {
			r.startTaskProgressWatcher(ctx, chatID, inst, "更新容器: "+name, taskID)
		}
		started = append(started, name)
	}
	var b strings.Builder
	b.WriteString(fmt.Sprintf("🆙 本页更新结果（第 %d 页）\n", page+1))
	if len(started) > 0 {
		b.WriteString("\n✅ 已提交:\n")
		for _, name := range started {
			b.WriteString("• " + name + "\n")
		}
	}
	if len(failed) > 0 {
		b.WriteString("\n❌ 提交失败:\n")
		for _, name := range failed {
			b.WriteString("• " + name + "\n")
		}
	}
	r.replyText(ctx, chatID, b.String())
	r.sendContainersPage(ctx, chatID, messageID, page)
}
