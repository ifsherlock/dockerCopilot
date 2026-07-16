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
	tasks := make([]batchTask, 0, len(updates))
	failed := make([]string, 0)
	for _, item := range updates {
		name, taskID, err := r.updateContainerOnCurrent(ctx, chatID, item.ID)
		if err != nil {
			failed = append(failed, item.Name)
			continue
		}
		tasks = append(tasks, batchTask{Name: name, TaskID: taskID})
	}
	r.startBatchProgressWatcher(ctx, chatID, inst, "全部更新", tasks, failed)
}

func (r *Runtime) updateAllUpdateSessionItems(ctx context.Context, chatID int64, session updateSession) {
	inst, err := r.currentInstance(ctx, chatID)
	if err != nil {
		r.replyText(ctx, chatID, "❌ 获取当前实例失败: "+err.Error())
		return
	}
	tasks := make([]batchTask, 0, len(session.Items))
	failed := make([]string, 0)
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
		tasks = append(tasks, batchTask{Name: name, TaskID: taskID})
	}
	r.startBatchProgressWatcher(ctx, chatID, inst, "批量更新", tasks, failed)
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
	tasks := make([]batchTask, 0, len(updatable))
	failed := make([]string, 0)
	for _, item := range updatable {
		name, taskID, err := r.updateContainerOnCurrent(ctx, chatID, item.ID)
		if err != nil {
			failed = append(failed, item.Name)
			continue
		}
		tasks = append(tasks, batchTask{Name: name, TaskID: taskID})
	}
	r.startBatchProgressWatcher(ctx, chatID, inst, fmt.Sprintf("本页更新（第 %d 页）", page+1), tasks, failed)
}
