package qqbot

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strings"
)

const (
	EventC2CMessageCreate     = "C2C_MESSAGE_CREATE"
	EventGroupAtMessageCreate = "GROUP_AT_MESSAGE_CREATE"
	EventGroupMessageCreate   = "GROUP_MESSAGE_CREATE"
	EventInteractionCreate    = "INTERACTION_CREATE"
)

type Payload struct {
	ID   string          `json:"id"`
	Op   int             `json:"op"`
	Seq  int64           `json:"s,omitempty"`
	Type string          `json:"t,omitempty"`
	Data json.RawMessage `json:"d,omitempty"`
}

type CommandKind string

const (
	CommandKindMessage     CommandKind = "message"
	CommandKindInteraction CommandKind = "interaction"
)

type IncomingCommand struct {
	Kind        CommandKind
	EventID     string
	MessageID   string
	EventType   string
	UserOpenID  string
	GroupOpenID string
	Content     string
	Action      string
	// InteractionID 是按钮回调事件的 interaction id，用于 PUT /interactions/{id} 回执。
	InteractionID string
	RawData       json.RawMessage
}

func ParsePayload(data []byte) (Payload, error) {
	var payload Payload
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&payload); err != nil {
		return Payload{}, fmt.Errorf("解析 QQBot payload 失败: %w", err)
	}
	payload.Type = strings.TrimSpace(payload.Type)
	return payload, nil
}

func MapPayloadToCommand(payload Payload) (IncomingCommand, bool, error) {
	if payload.Op != 0 {
		return IncomingCommand{}, false, nil
	}
	switch payload.Type {
	case EventC2CMessageCreate:
		return mapC2CMessage(payload)
	case EventGroupAtMessageCreate, EventGroupMessageCreate:
		return mapGroupMessage(payload)
	case EventInteractionCreate:
		return mapInteraction(payload)
	default:
		return IncomingCommand{}, false, nil
	}
}

func mapC2CMessage(payload Payload) (IncomingCommand, bool, error) {
	var event struct {
		ID      string `json:"id"`
		Content string `json:"content"`
		Author  struct {
			UserOpenID string `json:"user_openid"`
		} `json:"author"`
	}
	if err := json.Unmarshal(payload.Data, &event); err != nil {
		return IncomingCommand{}, false, fmt.Errorf("解析 QQBot C2C 消息失败: %w", err)
	}
	return IncomingCommand{
		Kind:       CommandKindMessage,
		EventID:    firstNonEmpty(payload.ID, event.ID),
		MessageID:  event.ID,
		EventType:  payload.Type,
		UserOpenID: strings.TrimSpace(event.Author.UserOpenID),
		Content:    normalizeCommandText(event.Content),
		RawData:    payload.Data,
	}, true, nil
}

func mapGroupMessage(payload Payload) (IncomingCommand, bool, error) {
	var event struct {
		ID          string `json:"id"`
		Content     string `json:"content"`
		GroupOpenID string `json:"group_openid"`
		Author      struct {
			MemberOpenID string `json:"member_openid"`
			UserOpenID   string `json:"user_openid"`
		} `json:"author"`
	}
	if err := json.Unmarshal(payload.Data, &event); err != nil {
		return IncomingCommand{}, false, fmt.Errorf("解析 QQBot 群消息失败: %w", err)
	}
	return IncomingCommand{
		Kind:        CommandKindMessage,
		EventID:     firstNonEmpty(payload.ID, event.ID),
		MessageID:   event.ID,
		EventType:   payload.Type,
		UserOpenID:  firstNonEmpty(event.Author.MemberOpenID, event.Author.UserOpenID),
		GroupOpenID: strings.TrimSpace(event.GroupOpenID),
		Content:     normalizeCommandText(event.Content),
		RawData:     payload.Data,
	}, true, nil
}

func mapInteraction(payload Payload) (IncomingCommand, bool, error) {
	var raw map[string]interface{}
	if err := json.Unmarshal(payload.Data, &raw); err != nil {
		return IncomingCommand{}, false, fmt.Errorf("解析 QQBot interaction 失败: %w", err)
	}
	cmd := IncomingCommand{
		Kind:      CommandKindInteraction,
		EventID:   firstNonEmpty(payload.ID, stringValue(raw["id"]), stringValue(raw["event_id"])),
		EventType: payload.Type,
		RawData:   payload.Data,
	}
	cmd.InteractionID = firstNonEmpty(stringValue(raw["id"]), payload.ID, stringValue(raw["event_id"]))
	// 尽量提取按钮所在消息的 msg_id，用于被动回复；拿不到时回复走主动消息通道。
	cmd.MessageID = firstNonEmpty(
		stringValue(raw["message_id"]),
		nestedString(raw, "data", "resolved", "message_id"),
		nestedString(raw, "data", "message_id"),
		nestedString(raw, "resolved", "message_id"),
	)
	cmd.UserOpenID = firstNonEmpty(
		stringValue(raw["user_openid"]),
		stringValue(raw["group_member_openid"]),
		stringValue(raw["member_openid"]),
		stringValue(raw["openid"]),
		nestedString(raw, "author", "user_openid"),
		nestedString(raw, "author", "group_member_openid"),
		nestedString(raw, "author", "member_openid"),
	)
	cmd.GroupOpenID = firstNonEmpty(
		stringValue(raw["group_openid"]),
		nestedString(raw, "group", "group_openid"),
		nestedString(raw, "source", "group_openid"),
	)
	cmd.Action = firstNonEmpty(
		stringValue(raw["button_data"]),
		nestedString(raw, "data", "button_data"),
		nestedString(raw, "data", "custom_id"),
		nestedString(raw, "data", "resolved", "button_data"),
		nestedString(raw, "data", "resolved", "custom_id"),
		nestedString(raw, "resolved", "button_data"),
	)
	cmd.Content = normalizeCommandText(firstNonEmpty(cmd.Action, stringValue(raw["content"])))
	return cmd, true, nil
}

func normalizeCommandText(value string) string {
	return strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(value), "@"))
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func stringValue(value interface{}) string {
	switch v := value.(type) {
	case string:
		return strings.TrimSpace(v)
	case json.Number:
		return v.String()
	default:
		return ""
	}
}

func nestedString(root interface{}, path ...string) string {
	current := root
	for _, key := range path {
		m, ok := current.(map[string]interface{})
		if !ok {
			return ""
		}
		current = m[key]
	}
	return stringValue(current)
}
