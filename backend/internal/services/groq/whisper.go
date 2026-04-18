package groq

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"time"
)

type WhisperService struct {
	apiKey string
	model  string
	client *http.Client
}

type WhisperResponse struct {
	Text string `json:"text"`
}

// Optimized HTTP client with connection pooling for low latency
var optimizedTransport = &http.Transport{
	MaxIdleConns:        100,
	MaxIdleConnsPerHost: 10,
	IdleConnTimeout:     90 * time.Second,
	DisableCompression:  false,
	ForceAttemptHTTP2:   true,
}

func NewWhisperService(apiKey, model string) *WhisperService {
	return &WhisperService{
		apiKey: apiKey,
		model:  model,
		client: &http.Client{
			Transport: optimizedTransport,
			Timeout:   60 * time.Second, // 60s timeout for audio transcription
		},
	}
}

func (s *WhisperService) Transcribe(ctx context.Context, audioData []byte, language string) (string, error) {
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	// Add audio file
	part, err := writer.CreateFormFile("file", "audio.wav")
	if err != nil {
		return "", err
	}
	if _, err := part.Write(audioData); err != nil {
		return "", err
	}

	// Add model
	writer.WriteField("model", s.model)
	if language != "" {
		writer.WriteField("language", language)
	}
	writer.WriteField("response_format", "json")

	writer.Close()

	// Create request
	req, err := http.NewRequestWithContext(
		ctx,
		"POST",
		"https://api.groq.com/openai/v1/audio/transcriptions",
		body,
	)
	if err != nil {
		return "", err
	}

	req.Header.Set("Authorization", "Bearer "+s.apiKey)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	// Send request
	resp, err := s.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("groq whisper API error (status %d): %s", resp.StatusCode, string(bodyBytes))
	}

	var whisperResp WhisperResponse
	if err := json.NewDecoder(resp.Body).Decode(&whisperResp); err != nil {
		return "", err
	}

	return whisperResp.Text, nil
}
