package qqbot

import (
	"context"
	"testing"
)

type recordingAcker struct {
	events *[]string
}

func (a recordingAcker) AckInteraction(ctx context.Context, cmd IncomingCommand) error {
	*a.events = append(*a.events, "ack:"+cmd.Action)
	return nil
}

type recordingDispatcher struct {
	events *[]string
}

func (d recordingDispatcher) Dispatch(ctx context.Context, cmd IncomingCommand) error {
	*d.events = append(*d.events, "dispatch:"+cmd.Action)
	return nil
}

func TestInteractionAcksBeforeDispatch(t *testing.T) {
	var events []string
	router := NewRouter(
		NewAuthPolicy([]string{"user-1"}, nil),
		recordingAcker{events: &events},
		recordingDispatcher{events: &events},
	)
	err := router.HandleCommand(context.Background(), IncomingCommand{
		Kind:       CommandKindInteraction,
		UserOpenID: "user-1",
		Action:     "updates:confirm",
	})
	if err != nil {
		t.Fatalf("HandleCommand() error = %v", err)
	}
	if got := joinEvents(events); got != "ack:updates:confirm,dispatch:updates:confirm" {
		t.Fatalf("events = %s", got)
	}
}

func TestInteractionAuthRejectsBeforeAck(t *testing.T) {
	var events []string
	router := NewRouter(
		NewAuthPolicy([]string{"user-1"}, nil),
		recordingAcker{events: &events},
		recordingDispatcher{events: &events},
	)
	err := router.HandleCommand(context.Background(), IncomingCommand{
		Kind:       CommandKindInteraction,
		UserOpenID: "user-2",
		Action:     "updates:confirm",
	})
	if err == nil {
		t.Fatalf("HandleCommand() error = nil, want unauthorized")
	}
	if len(events) != 0 {
		t.Fatalf("events = %#v, want none before auth passes", events)
	}
}

func joinEvents(events []string) string {
	out := ""
	for i, event := range events {
		if i > 0 {
			out += ","
		}
		out += event
	}
	return out
}
