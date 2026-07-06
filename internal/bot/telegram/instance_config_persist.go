package telegram

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/mymmrac/telego"
	botlogic "github.com/onlyLTY/dockerCopilot/internal/logic/bot"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
	apptypes "github.com/onlyLTY/dockerCopilot/internal/types"
)

func (r *Runtime) persistInstancesConfig(ctx context.Context, cfg runtimeConfigView, instances []instanceConfig) error {
	instancesJSON, err := json.Marshal(instances)
	if err != nil {
		return err
	}
	logic := botlogic.NewConfigLogic(ctx, r.svcCtx)
	resp, err := logic.SaveConfig(&apptypes.BotConfigReq{
		BotToken:                svc.AsString(cfg.Telegram["bot_token"], ""),
		ChatIds:                 strings.Join(svc.StringList(cfg.Telegram["chat_ids"]), ","),
		UpdateCheckCron:         svc.AsString(cfg.Telegram["update_check_cron"], "0 18 * * *"),
		NotifyOnUpdate:          svc.AsBool(cfg.Telegram["notify_on_update"]),
		InteractiveEnabled:      svc.AsBool(cfg.Telegram["interactive_enabled"]),
		RichInteractionsEnabled: svc.AsBool(cfg.Telegram["rich_interactions_enabled"]),
		ParseMode:               svc.AsString(cfg.Telegram["parse_mode"], "HTML"),
		UpdateBlacklist:         strings.Join(svc.StringList(cfg.Telegram["update_blacklist"]), ","),
		AutoCleanImages:         svc.AsBool(cfg.Telegram["auto_clean_images"]),
		CleanImagesCron:         svc.AsString(cfg.Telegram["clean_images_cron"], "3 2 * * *"),
		AutoUpdateContainers:    svc.AsBool(cfg.Telegram["auto_update_containers"]),
		UpdateContainersCron:    svc.AsString(cfg.Telegram["update_containers_cron"], "0 */6 * * *"),
		AutoBackupJson:          svc.AsBool(cfg.Telegram["auto_backup_json"]),
		BackupJsonCron:          svc.AsString(cfg.Telegram["backup_json_cron"], "0 1 * * *"),
		AutoBackupCompose:       svc.AsBool(cfg.Telegram["auto_backup_compose"]),
		BackupComposeCron:       svc.AsString(cfg.Telegram["backup_compose_cron"], "30 1 * * *"),
		BackupMaxFiles:          svc.AsInt(cfg.Telegram["backup_max_files"], 20),
		ImageAccelerators:       strings.Join(svc.StringList(cfg.Telegram["image_accelerators"]), ","),
		DefaultImageAccelerator: svc.AsString(cfg.Telegram["default_image_accelerator"], ""),
		ProxyType:               svc.AsString(svc.ProxyMap(cfg.Telegram["proxy"])["type"], "none"),
		ProxyHost:               svc.AsString(svc.ProxyMap(cfg.Telegram["proxy"])["host"], ""),
		ProxyPort:               svc.AsInt(svc.ProxyMap(cfg.Telegram["proxy"])["port"], 0),
		ProxyUsername:           svc.AsString(svc.ProxyMap(cfg.Telegram["proxy"])["username"], ""),
		ProxyPassword:           svc.AsString(svc.ProxyMap(cfg.Telegram["proxy"])["password"], ""),
		DefaultInstance:         svc.AsString(cfg.Dockercopilot["default_instance"], "local"),
		MultiInstanceEnabled:    svc.AsBool(cfg.Dockercopilot["multi_instance_enabled"]),
		Instances:               string(instancesJSON),
	})
	if err != nil {
		return err
	}
	if resp == nil || resp.Code != 200 {
		return fmt.Errorf(firstNonEmpty(resp.Msg, "保存实例配置失败"))
	}
	return nil
}

func (r *Runtime) processInstanceConfigInput(ctx context.Context, msg *telego.Message, state userState) {
	input := strings.TrimSpace(msg.Text)
	if input == "/cancel" {
		r.clearChatState(msg.Chat.ID)
		r.sendInstancesConfigMenu(ctx, msg.Chat.ID, 0)
		return
	}
	var payload instanceEditPayload
	if err := json.Unmarshal([]byte(input), &payload); err != nil {
		r.replyText(ctx, msg.Chat.ID, "❌ JSON 格式错误: "+err.Error())
		return
	}
	mode := "add"
	if state.Action == "instance_edit" {
		mode = "edit"
	}
	if err := r.saveInstanceConfigAction(ctx, msg.Chat.ID, mode, state.Extra, payload); err != nil {
		r.replyText(ctx, msg.Chat.ID, "❌ 保存实例配置失败: "+err.Error())
		return
	}
	r.clearChatState(msg.Chat.ID)
	r.replyText(ctx, msg.Chat.ID, "✅ 实例配置已更新")
	r.sendInstancesConfigMenu(ctx, msg.Chat.ID, 0)
}
