package qqbot

import (
	"context"
	"fmt"
)

type Acknowledger interface {
	AckInteraction(ctx context.Context, cmd IncomingCommand) error
}

type Dispatcher interface {
	Dispatch(ctx context.Context, cmd IncomingCommand) error
}

type Router struct {
	auth       AuthPolicy
	acker      Acknowledger
	dispatcher Dispatcher
}

func NewRouter(auth AuthPolicy, acker Acknowledger, dispatcher Dispatcher) *Router {
	return &Router{auth: auth, acker: acker, dispatcher: dispatcher}
}

func (r *Router) HandlePayload(ctx context.Context, payload Payload) error {
	cmd, ok, err := MapPayloadToCommand(payload)
	if err != nil || !ok {
		return err
	}
	return r.HandleCommand(ctx, cmd)
}

func (r *Router) HandleCommand(ctx context.Context, cmd IncomingCommand) error {
	if err := r.auth.Authorize(cmd); err != nil {
		return err
	}
	if cmd.Kind == CommandKindInteraction {
		if r.acker == nil {
			return fmt.Errorf("QQBot interaction ack 未配置")
		}
		if err := r.acker.AckInteraction(ctx, cmd); err != nil {
			return fmt.Errorf("QQBot interaction ack 失败: %w", err)
		}
	}
	if r.dispatcher == nil {
		return nil
	}
	return r.dispatcher.Dispatch(ctx, cmd)
}
