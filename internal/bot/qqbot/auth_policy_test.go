package qqbot

import "testing"

func TestAuthAllowsConfiguredOpenIDs(t *testing.T) {
	policy := NewAuthPolicy([]string{"user-1"}, []string{"group-1"})
	if err := policy.Authorize(IncomingCommand{UserOpenID: "user-1"}); err != nil {
		t.Fatalf("Authorize user error = %v", err)
	}
	if err := policy.Authorize(IncomingCommand{GroupOpenID: "group-1", UserOpenID: "member-1"}); err != nil {
		t.Fatalf("Authorize group error = %v", err)
	}
}

func TestAuthRejectsUnauthorizedOpenIDs(t *testing.T) {
	policy := NewAuthPolicy([]string{"user-1"}, []string{"group-1"})
	if err := policy.Authorize(IncomingCommand{UserOpenID: "user-2"}); err == nil {
		t.Fatalf("Authorize unauthorized user = nil, want error")
	}
	if err := policy.Authorize(IncomingCommand{GroupOpenID: "group-2", UserOpenID: "member-1"}); err == nil {
		t.Fatalf("Authorize unauthorized group = nil, want error")
	}
}

func TestAuthAllowsAllWhenListsEmpty(t *testing.T) {
	policy := NewAuthPolicy(nil, nil)
	if err := policy.Authorize(IncomingCommand{UserOpenID: "any-user"}); err != nil {
		t.Fatalf("Authorize empty user allowlist error = %v", err)
	}
	if err := policy.Authorize(IncomingCommand{GroupOpenID: "any-group"}); err != nil {
		t.Fatalf("Authorize empty group allowlist error = %v", err)
	}
}
