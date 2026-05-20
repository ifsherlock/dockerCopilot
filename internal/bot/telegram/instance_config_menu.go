package telegram

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/mymmrac/telego"
	tu "github.com/mymmrac/telego/telegoutil"
)

type instanceEditPayload struct {
	Name      string `json:"name"`
	APIURL    string `json:"api_url"`
	SecretKey string `json:"secret_key"`
	Timeout   int    `json:"timeout"`
}

func (r *Runtime) sendInstancesConfigMenu(ctx context.Context, chatID int64, messageID int) {
	instances, current, enabled, err := r.loadInstances(ctx, chatID)
	if err != nil {
		r.replyText(ctx, chatID, "❌ 获取实例配置失败: "+err.Error())
		return
	}
	var b strings.Builder
	b.WriteString("🧩 <b>实例配置管理</b>\n\n")
	b.WriteString(fmt.Sprintf("当前实例: <b>%s</b>\n", escapeHTML(current)))
	b.WriteString(fmt.Sprintf("多实例: %s\n", boolText(enabled)))
	b.WriteString(fmt.Sprintf("实例数: <b>%d</b>\n\n", len(instances)))
	b.WriteString("选择实例进入详情，或新增实例。")
	rows := make([][]telego.InlineKeyboardButton, 0, len(instances)+3)
	for _, inst := range instances {
		icon := "⚪"
		if inst.Name == current {
			icon = "✅"
		}
		rows = append(rows, tu.InlineKeyboardRow(
			tu.InlineKeyboardButton(icon+" "+trimButtonLabel(inst.Name)).WithCallbackData("instcfg_detail:"+inst.Name),
		))
	}
	rows = append(rows, tu.InlineKeyboardRow(
		tu.InlineKeyboardButton("➕ 新增实例").WithCallbackData("instcfg_add:"),
		tu.InlineKeyboardButton("🔄 刷新").WithCallbackData("instcfg_menu:"),
	))
	rows = append(rows, tu.InlineKeyboardRow(
		tu.InlineKeyboardButton("⬅️ 返回设置").WithCallbackData("settings_menu:"),
		tu.InlineKeyboardButton("❌ 关闭").WithCallbackData("cancel:"),
	))
	r.editOrReplyText(ctx, chatID, messageID, b.String(), tu.InlineKeyboard(rows...))
}

func (r *Runtime) sendInstanceConfigDetail(ctx context.Context, chatID int64, messageID int, name string) {
	instances, current, _, err := r.loadInstances(ctx, chatID)
	if err != nil {
		r.replyText(ctx, chatID, "❌ 获取实例配置详情失败: "+err.Error())
		return
	}
	var target *instanceConfig
	for _, inst := range instances {
		if inst.Name == name {
			copyInst := inst
			target = &copyInst
			break
		}
	}
	if target == nil {
		r.replyText(ctx, chatID, "❌ 实例不存在")
		return
	}
	var b strings.Builder
	b.WriteString("🧩 <b>实例配置详情</b>\n\n")
	b.WriteString(fmt.Sprintf("名称: <b>%s</b>\n", escapeHTML(target.Name)))
	b.WriteString(fmt.Sprintf("地址: <code>%s</code>\n", escapeHTML(target.APIURL)))
	b.WriteString(fmt.Sprintf("超时: <b>%d</b> 秒\n", target.Timeout))
	if target.Name == current {
		b.WriteString("当前实例: ✅ 是\n")
	} else {
		b.WriteString("当前实例: ❌ 否\n")
	}
	if info, err := r.instanceSummary(ctx, *target); err == nil {
		b.WriteString(fmt.Sprintf("连接测试: 🟢 在线（容器 %d 个 / 运行中 %d 个）\n", info.total, info.running))
	} else {
		b.WriteString(fmt.Sprintf("连接测试: 🔴 失败\n错误: <code>%s</code>\n", escapeHTML(shorten(err.Error(), 120))))
	}
	rows := [][]telego.InlineKeyboardButton{
		tu.InlineKeyboardRow(
			tu.InlineKeyboardButton("✏️ 编辑").WithCallbackData("instcfg_edit:"+target.Name),
			tu.InlineKeyboardButton("🧪 测试连接").WithCallbackData("instcfg_test:"+target.Name),
		),
	}
	if target.Name != "local" {
		rows = append(rows, tu.InlineKeyboardRow(
			tu.InlineKeyboardButton("🗑 删除实例").WithCallbackData("instcfg_delete_confirm:"+target.Name),
		))
	}
	rows = append(rows, tu.InlineKeyboardRow(
		tu.InlineKeyboardButton("⬅️ 返回实例配置").WithCallbackData("instcfg_menu:"),
		tu.InlineKeyboardButton("❌ 关闭").WithCallbackData("cancel:"),
	))
	r.editOrReplyText(ctx, chatID, messageID, b.String(), tu.InlineKeyboard(rows...))
}

func (r *Runtime) startAddInstanceConfig(ctx context.Context, chatID int64, messageID int) {
	template := `{"name":"demo","api_url":"http://127.0.0.1:12712","secret_key":"your-secret","timeout":30}`
	text := "➕ <b>新增实例</b>\n\n请发送单个实例 JSON：\n<code>" + escapeHTML(template) + "</code>\n\n发送 /cancel 可取消。"
	r.setChatState(chatID, userState{Action: "instance_add", MessageID: messageID})
	r.editOrReplyText(ctx, chatID, messageID, text, nil)
}

func (r *Runtime) startEditInstanceConfig(ctx context.Context, chatID int64, messageID int, name string) {
	instances, _, _, err := r.loadInstances(ctx, chatID)
	if err != nil {
		r.replyText(ctx, chatID, "❌ 获取实例配置失败: "+err.Error())
		return
	}
	for _, inst := range instances {
		if inst.Name != name {
			continue
		}
		payload := instanceEditPayload{Name: inst.Name, APIURL: inst.APIURL, SecretKey: inst.SecretKey, Timeout: inst.Timeout}
		bs, _ := json.MarshalIndent(payload, "", "  ")
		text := "✏️ <b>编辑实例</b>\n\n请直接发送修改后的单个实例 JSON：\n<code>" + escapeHTML(string(bs)) + "</code>\n\n发送 /cancel 可取消。"
		r.setChatState(chatID, userState{Action: "instance_edit", Extra: name, MessageID: messageID})
		r.editOrReplyText(ctx, chatID, messageID, text, nil)
		return
	}
	r.replyText(ctx, chatID, "❌ 实例不存在")
}

func (r *Runtime) confirmDeleteInstanceConfig(ctx context.Context, chatID int64, messageID int, name string) {
	if strings.TrimSpace(name) == "" || name == "local" {
		r.replyText(ctx, chatID, "❌ local 实例不允许删除")
		return
	}
	text := fmt.Sprintf("⚠️ <b>确认删除实例</b>\n\n实例: <b>%s</b>\n\n删除后将从多实例配置中移除。是否继续？", escapeHTML(name))
	markup := tu.InlineKeyboard(
		tu.InlineKeyboardRow(
			tu.InlineKeyboardButton("🗑 确认删除").WithCallbackData("instcfg_delete:"+name),
			tu.InlineKeyboardButton("❌ 取消").WithCallbackData("instcfg_detail:"+name),
		),
	)
	r.editOrReplyText(ctx, chatID, messageID, text, markup)
}

func (r *Runtime) testInstanceConfig(ctx context.Context, chatID int64, name string) {
	instances, _, _, err := r.loadInstances(ctx, chatID)
	if err != nil {
		r.replyText(ctx, chatID, "❌ 获取实例失败: "+err.Error())
		return
	}
	for _, inst := range instances {
		if inst.Name != name {
			continue
		}
		if info, err := r.instanceSummary(ctx, inst); err == nil {
			r.replyText(ctx, chatID, fmt.Sprintf("✅ 实例 <b>%s</b> 连接正常\n容器总数: <b>%d</b>\n运行中: <b>%d</b>", escapeHTML(name), info.total, info.running))
		} else {
			r.replyText(ctx, chatID, fmt.Sprintf("❌ 实例 <b>%s</b> 连接失败\n错误: <code>%s</code>", escapeHTML(name), escapeHTML(shorten(err.Error(), 200))))
		}
		return
	}
	r.replyText(ctx, chatID, "❌ 实例不存在")
}

func (r *Runtime) saveInstanceConfigAction(ctx context.Context, chatID int64, mode string, oldName string, payload instanceEditPayload) error {
	cfg, err := r.getConfig(ctx)
	if err != nil {
		return err
	}
	instances, _, _, err := r.loadInstances(ctx, chatID)
	if err != nil {
		return err
	}
	payload.Name = strings.TrimSpace(payload.Name)
	payload.APIURL = strings.TrimSpace(payload.APIURL)
	payload.SecretKey = strings.TrimSpace(payload.SecretKey)
	if payload.Name == "" || payload.APIURL == "" || payload.SecretKey == "" {
		return fmt.Errorf("name / api_url / secret_key 不能为空")
	}
	if payload.Timeout <= 0 {
		payload.Timeout = 30
	}
	updated := make([]instanceConfig, 0, len(instances)+1)
	found := false
	for _, inst := range instances {
		if mode == "edit" && inst.Name == oldName {
			updated = append(updated, instanceConfig{Name: payload.Name, APIURL: payload.APIURL, SecretKey: payload.SecretKey, Timeout: payload.Timeout, Local: payload.Name == "local"})
			found = true
			continue
		}
		if inst.Name == payload.Name && !(mode == "edit" && inst.Name == oldName) {
			return fmt.Errorf("实例名已存在: %s", payload.Name)
		}
		updated = append(updated, inst)
	}
	if mode == "add" {
		updated = append(updated, instanceConfig{Name: payload.Name, APIURL: payload.APIURL, SecretKey: payload.SecretKey, Timeout: payload.Timeout, Local: payload.Name == "local"})
		found = true
	}
	if mode == "edit" && !found {
		return fmt.Errorf("实例不存在: %s", oldName)
	}
	sort.SliceStable(updated, func(i, j int) bool { return strings.ToLower(updated[i].Name) < strings.ToLower(updated[j].Name) })
	return r.persistInstancesConfig(ctx, cfg, updated)
}

func (r *Runtime) deleteInstanceConfig(ctx context.Context, chatID int64, name string) error {
	if name == "local" {
		return fmt.Errorf("local 实例不允许删除")
	}
	cfg, err := r.getConfig(ctx)
	if err != nil {
		return err
	}
	instances, current, _, err := r.loadInstances(ctx, chatID)
	if err != nil {
		return err
	}
	updated := make([]instanceConfig, 0, len(instances))
	found := false
	for _, inst := range instances {
		if inst.Name == name {
			found = true
			continue
		}
		updated = append(updated, inst)
	}
	if !found {
		return fmt.Errorf("实例不存在")
	}
	if current == name {
		r.setCurrentInstance(chatID, "local")
	}
	return r.persistInstancesConfig(ctx, cfg, updated)
}
