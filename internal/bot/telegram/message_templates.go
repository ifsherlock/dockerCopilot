package telegram

import (
	"fmt"
	"time"
)

func telegramAccessDeniedMessage(err error) string {
	if err == nil {
		return "⛔ 操作被拒绝\n\n发送 /help 查看可用菜单"
	}
	return "⛔ " + err.Error() + "\n\n发送 /help 查看可用菜单"
}

func updateCacheHeader(instanceName string, cacheAge time.Duration, running bool) string {
	checkState := "仍在进行"
	if !running {
		checkState = "刚结束，正在读取最终结果"
	}
	return fmt.Sprintf(
		"🕒 先展示缓存结果\n实例: <b>%s</b>\n缓存年龄: <b>%s</b>\n实时检测: <b>%s</b>，稍后会自动刷新。\n\n",
		escapeHTML(instanceName),
		formatCacheAge(cacheAge),
		checkState,
	)
}
