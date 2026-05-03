// Server-side only — never import this in client components
import Anthropic from '@anthropic-ai/sdk'

export const DEFAULT_MODEL = 'claude-opus-4-5'

// Lazy singleton — validates at call time, not at module load, so builds work without .env.local
let _client: Anthropic | null = null

export function getAnthropicClient(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        'Missing ANTHROPIC_API_KEY. Copy .env.local.example to .env.local and fill in your key.'
      )
    }
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return _client
}
