import { NextRequest, NextResponse } from 'next/server'
import { getAnthropicClient, DEFAULT_MODEL } from '@/lib/anthropic'

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json()
    if (!prompt) {
      return NextResponse.json({ error: 'Missing prompt' }, { status: 400 })
    }

    const message = await getAnthropicClient().messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    })

    const text =
      message.content[0].type === 'text' ? message.content[0].text : '[non-text response]'

    return NextResponse.json({
      success: true,
      model: message.model,
      response: text,
      usage: message.usage,
    })
  } catch (err) {
    console.error('[api/test] Error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
