package qqbot

import (
	"encoding/json"
	"testing"
)

func TestEventMapsC2CMessagePayload(t *testing.T) {
	payload := mustPayload(t, `{
		"id": "event-1",
		"op": 0,
		"t": "C2C_MESSAGE_CREATE",
		"d": {
			"id": "msg-1",
			"content": "/status",
			"author": {"user_openid": "user-openid"}
		}
	}`)
	cmd, ok, err := MapPayloadToCommand(payload)
	if err != nil || !ok {
		t.Fatalf("MapPayloadToCommand() ok=%v err=%v", ok, err)
	}
	if cmd.Kind != CommandKindMessage || cmd.UserOpenID != "user-openid" || cmd.MessageID != "msg-1" || cmd.Content != "/status" {
		t.Fatalf("command = %#v", cmd)
	}
}

func TestEventMapsGroupMessagePayload(t *testing.T) {
	payload := mustPayload(t, `{
		"id": "event-2",
		"op": 0,
		"t": "GROUP_AT_MESSAGE_CREATE",
		"d": {
			"id": "msg-2",
			"content": " /updates ",
			"group_openid": "group-openid",
			"author": {"member_openid": "member-openid"}
		}
	}`)
	cmd, ok, err := MapPayloadToCommand(payload)
	if err != nil || !ok {
		t.Fatalf("MapPayloadToCommand() ok=%v err=%v", ok, err)
	}
	if cmd.Kind != CommandKindMessage || cmd.GroupOpenID != "group-openid" || cmd.UserOpenID != "member-openid" || cmd.Content != "/updates" {
		t.Fatalf("command = %#v", cmd)
	}
}

func TestInteractionMapsButtonPayload(t *testing.T) {
	payload := mustPayload(t, `{
		"id": "interaction-event",
		"op": 0,
		"t": "INTERACTION_CREATE",
		"d": {
			"id": "interaction-id",
			"user_openid": "user-openid",
			"group_openid": "group-openid",
			"data": {"button_data": "updates:confirm"}
		}
	}`)
	cmd, ok, err := MapPayloadToCommand(payload)
	if err != nil || !ok {
		t.Fatalf("MapPayloadToCommand() ok=%v err=%v", ok, err)
	}
	if cmd.Kind != CommandKindInteraction || cmd.EventID != "interaction-event" || cmd.Action != "updates:confirm" || cmd.Content != "updates:confirm" {
		t.Fatalf("command = %#v", cmd)
	}
}

func TestInteractionMapsOfficialGroupButtonPayload(t *testing.T) {
	payload := mustPayload(t, `{
		"id": "interaction-event",
		"op": 0,
		"t": "INTERACTION_CREATE",
		"d": {
			"id": "interaction-id",
			"group_openid": "group-openid",
			"group_member_openid": "member-openid",
			"data": {"resolved": {"button_data": "cmd:/status"}}
		}
	}`)
	cmd, ok, err := MapPayloadToCommand(payload)
	if err != nil || !ok {
		t.Fatalf("MapPayloadToCommand() ok=%v err=%v", ok, err)
	}
	if cmd.Kind != CommandKindInteraction || cmd.GroupOpenID != "group-openid" || cmd.UserOpenID != "member-openid" || cmd.Action != "cmd:/status" {
		t.Fatalf("command = %#v", cmd)
	}
}

func mustPayload(t *testing.T, raw string) Payload {
	t.Helper()
	payload, err := ParsePayload([]byte(raw))
	if err != nil {
		t.Fatalf("ParsePayload() error = %v", err)
	}
	if !json.Valid(payload.Data) {
		t.Fatalf("payload data is not valid json: %s", payload.Data)
	}
	return payload
}
