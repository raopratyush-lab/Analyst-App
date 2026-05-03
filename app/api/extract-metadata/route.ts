import { NextRequest, NextResponse } from 'next/server'
import { getAnthropicClient, DEFAULT_MODEL } from '@/lib/anthropic'
import * as pdfParseModule from 'pdf-parse'
// pdf-parse ships CommonJS; handle both default and named export
const pdfParse: (buf: Buffer, opts?: { max?: number }) => Promise<{ text: string }> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pdfParseModule as any).default ?? pdfParseModule

// Attempt to extract quarter from filename as a cheap first pass
function quarterFromFilename(name: string): string | null {
  // Matches: Q4FY26, Q3FY25, Q1FY2025, q4fy26 etc.
  const m = name.match(/[Qq]([1-4])[Ff][Yy](\d{2,4})/i)
  if (m) {
    const fy = m[2].length === 2 ? `FY${m[2]}` : `FY${m[2].slice(-2)}`
    return `Q${m[1]}${fy}`
  }
  return null
}

function docTypeFromFilename(name: string): string | null {
  const lower = name.toLowerCase()
  if (lower.includes('transcript') || lower.includes('concall') || lower.includes('conf_call') || lower.includes('earnings_call')) return 'transcript'
  if (lower.includes('analyst') || lower.includes('report') || lower.includes('research') || lower.includes('note') || lower.includes('initiat')) return 'analyst_report'
  if (lower.includes('press') || lower.includes('release')) return 'press_release'
  if (lower.includes('presentation') || lower.includes('ppt') || lower.includes('investor_pres')) return 'investor_presentation'
  if (lower.includes('result') || lower.includes('financials')) return 'results_announcement'
  return null
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const filename = file.name

    // --- Step 1: try filename heuristics first (free, instant) ---
    const quarterHint = quarterFromFilename(filename)
    const docTypeHint = docTypeFromFilename(filename)

    // --- Step 2: extract first ~3000 chars of PDF text ---
    const buffer = Buffer.from(await file.arrayBuffer())
    let firstPageText = ''
    try {
      const parsed = await pdfParse(buffer, { max: 2 }) // first 2 pages only
      firstPageText = parsed.text.slice(0, 3000)
    } catch {
      // If PDF parse fails, fall back to filename hints only
      firstPageText = ''
    }

    // If we got everything from filename, skip the API call
    if (quarterHint && docTypeHint && docTypeHint !== 'other') {
      return NextResponse.json({
        quarter: quarterHint,
        fiscal_year: `FY${quarterHint.match(/FY(\d+)/)?.[1] ?? ''}`,
        doc_type: docTypeHint,
        analyst_firm: null,
        analyst_name: null,
        source: 'filename',
      })
    }

    // --- Step 3: ask Claude to extract the rest ---
    const prompt = `You are extracting metadata from an Indian IT sector earnings document.

Filename: ${filename}
First pages text:
"""
${firstPageText || '(PDF text extraction failed — use filename only)'}
"""

${quarterHint ? `Quarter already identified from filename: ${quarterHint}` : ''}
${docTypeHint ? `Document type already identified from filename: ${docTypeHint}` : ''}

Extract ONLY the following. Return valid JSON with no markdown:
{
  "quarter": "Q4FY26",
  "fiscal_year": "FY26",
  "doc_type": "transcript" | "analyst_report" | "press_release" | "investor_presentation" | "results_announcement" | "other",
  "analyst_firm": "Firm name or null",
  "analyst_name": "Analyst full name or null"
}

Rules:
- quarter format is always Q[1-4]FY[2-digit-year] e.g. Q4FY26, Q1FY25
- doc_type: transcript = earnings call transcript, analyst_report = sell-side research note
- analyst_firm and analyst_name only for analyst_report type, otherwise null
- If you cannot determine a field with confidence, use null`

    const message = await getAnthropicClient().messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
    // Strip markdown code fences if present
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const extracted = JSON.parse(cleaned)

    return NextResponse.json({ ...extracted, source: 'claude' })
  } catch (err) {
    console.error('[extract-metadata]', err)
    return NextResponse.json({ error: 'Extraction failed' }, { status: 500 })
  }
}
