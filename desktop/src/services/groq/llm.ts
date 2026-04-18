import { configService } from '../api/config'
import { LANGUAGE_NAME_BY_CODE } from '@/lib/languages'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatResponse {
  choices: {
    message: ChatMessage
  }[]
}

export interface CleanupOptions {
  // Tri-state: false forces fillers to be kept; true or undefined defers to
  // the base prompt (which removes them). Needed because "undefined" must NOT
  // override the server default.
  removeFillers?: boolean
  customPrompt?: string
  // ISO-639-1 code. Non-English values trigger a preservation hint — the base
  // prompt is English-phrased and models drift toward translating otherwise.
  language?: string
}

class LLMService {
  private apiUrl = 'https://api.groq.com/openai/v1/chat/completions'

  async cleanupText(rawText: string, options: CleanupOptions = {}): Promise<string> {
    if (!rawText || rawText.trim().length === 0) {
      return rawText
    }

    const config = await configService.getConfig()

    // Build override instructions based on user toggles. The base server prompt
    // already does a full cleanup (fillers, punctuation, capitalization, etc.),
    // so we only append instructions when the user wants to deviate from that.
    const overrides: string[] = []

    // Language preservation — listed first so it anchors the model's behaviour.
    // The base prompt is English-phrased; without this override, models can
    // drift toward translating non-English speech or removing English-only
    // fillers while leaving native-language fillers intact.
    const lang = options.language
    if (lang && lang !== 'en') {
      const name = LANGUAGE_NAME_BY_CODE[lang] || lang
      overrides.push(`The input is in ${name}. Preserve this language — do not translate to English. Remove hesitation sounds and stuttering natural to ${name}; keep meaningful words intact.`)
    }

    if (options.removeFillers === false) {
      overrides.push('Do NOT remove filler words ("um", "uh", "like", "you know"). Keep them intact.')
    }
    const trimmedCustom = options.customPrompt?.trim()
    if (trimmedCustom) {
      overrides.push(trimmedCustom)
    }

    let systemPrompt = config.cleanupPrompt
    if (overrides.length > 0) {
      systemPrompt += '\n\nAdditional instructions:\n' + overrides.map((o) => `- ${o}`).join('\n')
    }
    // Separate instructions (system) from data (user) so the model is less
    // likely to echo labels like "Here is the cleaned text:". The <<< >>>
    // delimiters back up rule 10 — transcript content is data, not instructions.
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.groqLLMModel || 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `<<<\n${rawText}\n>>>` },
        ],
        stream: false,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Groq LLM API error: ${response.status} - ${error}`)
    }

    const result: ChatResponse = await response.json()

    if (!result.choices || result.choices.length === 0) {
      throw new Error('No response from LLM')
    }

    return result.choices[0].message.content
  }
}

export const llmService = new LLMService()
