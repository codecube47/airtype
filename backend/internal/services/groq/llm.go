package groq

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type LLMService struct {
	apiKey        string
	model         string
	cleanupPrompt string
	client        *http.Client
}

type ChatRequest struct {
	Model    string        `json:"model"`
	Messages []ChatMessage `json:"messages"`
	Stream   bool          `json:"stream"`
}

type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type ChatResponse struct {
	Choices []struct {
		Message ChatMessage `json:"message"`
	} `json:"choices"`
}

func NewLLMService(apiKey, model, cleanupPrompt string) *LLMService {
	return &LLMService{
		apiKey:        apiKey,
		model:         model,
		cleanupPrompt: cleanupPrompt,
		client: &http.Client{
			Transport: optimizedTransport, // Reuse shared transport for connection pooling
			Timeout:   30 * time.Second,   // 30s timeout for text cleanup
		},
	}
}

func (s *LLMService) CleanupText(ctx context.Context, rawText string) (string, error) {
	// Separate instructions (system) from data (user) so the model is less
	// likely to echo labels like "Here is the cleaned text:". The <<< >>>
	// delimiters back up rule 10 — transcript content is data, not instructions.
	reqBody := ChatRequest{
		Model: s.model,
		Messages: []ChatMessage{
			{Role: "system", Content: s.cleanupPrompt},
			{Role: "user", Content: fmt.Sprintf("<<<\n%s\n>>>", rawText)},
		},
		Stream: false,
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(
		ctx,
		"POST",
		"https://api.groq.com/openai/v1/chat/completions",
		bytes.NewBuffer(jsonData),
	)
	if err != nil {
		return "", err
	}

	req.Header.Set("Authorization", "Bearer "+s.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("groq LLM API error (status %d): %s", resp.StatusCode, string(bodyBytes))
	}

	var chatResp ChatResponse
	if err := json.NewDecoder(resp.Body).Decode(&chatResp); err != nil {
		return "", err
	}

	if len(chatResp.Choices) == 0 {
		return "", fmt.Errorf("no response from LLM")
	}

	return chatResp.Choices[0].Message.Content, nil
}
