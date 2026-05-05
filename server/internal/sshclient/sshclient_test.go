package sshclient

import (
	"context"
	"strings"
	"testing"
)

func TestDialValidation(t *testing.T) {
	h := New(nil, nil)
	_, err := h.dial(context.Background(), connectMessage{Host: "", Username: "user", Password: "pw"})
	if err == nil || !strings.Contains(err.Error(), "host") {
		t.Fatalf("expected host validation error, got %v", err)
	}
	_, err = h.dial(context.Background(), connectMessage{Host: "example.com", Username: "user", Port: 70000, Password: "pw"})
	if err == nil || !strings.Contains(err.Error(), "invalid port") {
		t.Fatalf("expected port validation error, got %v", err)
	}
	_, err = h.dial(context.Background(), connectMessage{Host: "example.com", Username: "user"})
	if err == nil || !strings.Contains(err.Error(), "password") {
		t.Fatalf("expected password validation error, got %v", err)
	}
}
