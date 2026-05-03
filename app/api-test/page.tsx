'use client'

import { useState } from 'react'

export default function ApiTestPage() {
  const [prompt, setPrompt] = useState(
    'You are the Analyst Q&A Prediction Agent. Say hello and confirm you are connected.'
  )
  const [response, setResponse] = useState<{
    response?: string
    model?: string
    usage?: { input_tokens: number; output_tokens: number }
    error?: string
  } | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleTest() {
    setLoading(true)
    setResponse(null)
    try {
      const res = await fetch('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      })
      const json = await res.json()
      setResponse(json)
    } catch {
      setResponse({ error: 'Network error — check your connection.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-10 px-4">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Anthropic API Test</h1>
      <p className="text-sm text-gray-500 mb-8">
        Send a prompt to the Anthropic API and confirm the connection is working end to end.
      </p>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Prompt</label>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            rows={4}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
          />
        </div>

        <button
          onClick={handleTest}
          disabled={loading || !prompt.trim()}
          className="w-full py-2.5 px-4 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Calling API…' : 'Test API connection'}
        </button>

        {response && (
          <div className="rounded-md border mt-4">
            {response.error ? (
              <div className="bg-red-50 border-red-200 rounded-md p-4">
                <p className="text-sm font-medium text-red-800">Error</p>
                <p className="text-sm text-red-700 mt-1">{response.error}</p>
              </div>
            ) : (
              <div className="bg-green-50 border border-green-200 rounded-md p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                    ✓ Connected
                  </span>
                  <span className="text-xs text-gray-500">model: {response.model}</span>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Response</p>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{response.response}</p>
                </div>
                {response.usage && (
                  <div className="text-xs text-gray-400 border-t border-green-200 pt-2">
                    Tokens — input: {response.usage.input_tokens} · output: {response.usage.output_tokens}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
