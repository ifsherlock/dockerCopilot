package qqbot

import (
	"bytes"
	"crypto/ed25519"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
)

const (
	OpDispatch        = 0
	OpHTTPCallbackACK = 12
	OpValidation      = 13
)

type WebhookACK struct {
	Op   int         `json:"op"`
	Data interface{} `json:"d,omitempty"`
}

type ValidationRequest struct {
	PlainToken string `json:"plain_token"`
	EventTs    string `json:"event_ts"`
}

type ValidationResponse struct {
	PlainToken string `json:"plain_token"`
	Signature  string `json:"signature"`
}

func HTTPCallbackACK() WebhookACK {
	return WebhookACK{Op: OpHTTPCallbackACK}
}

func MarshalHTTPCallbackACK() ([]byte, error) {
	return json.Marshal(HTTPCallbackACK())
}

func SignValidation(botSecret string, req ValidationRequest) (ValidationResponse, error) {
	privateKey, err := privateKeyFromSecret(botSecret)
	if err != nil {
		return ValidationResponse{}, err
	}
	var msg bytes.Buffer
	msg.WriteString(req.EventTs)
	msg.WriteString(req.PlainToken)
	return ValidationResponse{
		PlainToken: req.PlainToken,
		Signature:  hex.EncodeToString(ed25519.Sign(privateKey, msg.Bytes())),
	}, nil
}

func VerifyRequestSignature(botSecret string, timestamp string, body []byte, signature string) bool {
	publicKey, err := publicKeyFromSecret(botSecret)
	if err != nil {
		return false
	}
	signature = strings.TrimSpace(signature)
	if signature == "" || strings.TrimSpace(timestamp) == "" {
		return false
	}
	sig, err := hex.DecodeString(signature)
	if err != nil || len(sig) != ed25519.SignatureSize || sig[63]&224 != 0 {
		return false
	}
	var msg bytes.Buffer
	msg.WriteString(timestamp)
	msg.Write(body)
	return ed25519.Verify(publicKey, msg.Bytes(), sig)
}

func privateKeyFromSecret(botSecret string) (ed25519.PrivateKey, error) {
	_, privateKey, err := keyPairFromSecret(botSecret)
	return privateKey, err
}

func publicKeyFromSecret(botSecret string) (ed25519.PublicKey, error) {
	publicKey, _, err := keyPairFromSecret(botSecret)
	return publicKey, err
}

func keyPairFromSecret(botSecret string) (ed25519.PublicKey, ed25519.PrivateKey, error) {
	seed := strings.TrimSpace(botSecret)
	if seed == "" {
		return nil, nil, fmt.Errorf("QQBot app_secret 不能为空")
	}
	for len(seed) < ed25519.SeedSize {
		seed = strings.Repeat(seed, 2)
	}
	return ed25519.GenerateKey(strings.NewReader(seed[:ed25519.SeedSize]))
}
