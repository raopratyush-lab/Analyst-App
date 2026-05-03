import { NextRequest, NextResponse } from 'next/server'
import { getAnthropicClient, DEFAULT_MODEL } from '@/lib/anthropic'
import * as pdfParseModule from 'pdf-parse'
// pdf-parse ships CommonJS; handle both default and named export
const pdfParse: (buf: Buffer, opts?: { max?: number }) => Promise<{ text: string }> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pdfParseModule as any).default ?? pdfParseModule

// Normalise a 4-digit year like 2026 → "26"
function shortYear(y: string): string {
  return y.length === 4 ? y.slice(-2) : y
}

// Attempt to extract quarter from filename — handles multiple formats
function quarterFromFilename(name: string): string | null {
  // Q4FY26, Q4FY2026, q4fy26
  const m1 = name.match(/[Qq]([1-4])\s*[Ff][Yy]\s*(\d{2,4})/i)
  if (m1) return `Q${m1[1]}FY${shortYear(m1[2])}`

  // Q4 2025-26, Q4 2025/26
  const m2 = name.match(/[Qq]([1-4])\s+(\d{4})[-/](\d{2,4})/i)
  if (m2) return `Q${m2[1]}FY${shortYear(m2[3])}`

  // Q4 2026
  const m3 = name.match(/[Qq]([1-4])\s+(\d{4})/i)
  if (m3) return `Q${m3[1]}FY${shortYear(m3[2])}`

  // FY26 Q4 or FY2026 Q4
  const m4 = name.match(/[Ff][Yy](\d{2,4})\s*[Qq]([1-4])/i)
  if (m4) return `Q${m4[2]}FY${shortYear(m4[1])}`

  return null
}

function docTypeFromFilename(name: string): string | null {
  const lower = name.toLowerCase()
  if (lower.includes('transcript') || lower.includes('concall') || lower.includes('conf_call') || lower.includes('earnings_call') || lower.includes('earnings call')) return 'transcript'
  if (lower.includes('analyst') || lower.includes('report') || lower.includes('research') || lower.includes('note') || lower.includes('initiat')) return 'analyst_report'
  if (lower.includes('press') || lower.includes('release')) return 'press_release'
  if (lower.includes('presentation') || lower.includes('ppt') || lower.includes('investor_pres')) return 'investor_presentation'
  if (lower.includes('result') || lower.includes('financials')) return 'results_announcement'
  return null
}

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const filename = file.name

  // --- Step 1: filename heuristics (free, instant) ---
  const quarterHint = quarterFromFilename(filename)
  const docTypeHint = docTypeFromFilename(filename)

  // --- Step 2: extract first 2 pages of PDF text ---
  const buffer = Buffer.from(await file.arrayBuffer())
  let firstPageText = ''
  try {
    const parsed = await pdfParse(buffer, { max: 2 })
    firstPageText = parsed.text.slice(0, 3000)
  } catch {
    firstPageText = ''
  }

  // If filename gave us everything, skip the API call
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

  // --- Step 3: ask Claude for anything we couldn't get from the filename ---
  try {
    const prompt = `You are extracting metadata from an Indian IT sector earnings document.

Filename: ${filename}
First pages text:
"""
${firstPageText || '(PDF text extraction failed — use filename only)'}
"""

${quarterHint ? `Quarter already identified: ${quarterHint}` : ''}
${docTypeHint ? `Document type already identified: ${docTypeHint}` : ''}

Return valid JSON only, no markdown, no explanation:
{
  "quarter": "Q4FY26",
  "fiscal_year": "FY26",
  "doc_type": "transcript" | "analyst_report" | "press_release" | "investor_presentation" | "results_announcement" | "other",
  "analyst_firm": "Firm name or null",
  "analyst_name": "Analyst full name or null"
}

Rules:
- quarter format: Q[1-4]FY[2-digit-year] — e.g. Q4FY26, Q1FY25
- "Q4 2025-26" and "Q4 FY2026" both map to Q4FY26
- doc_type "transcript" = earnings call / concall transcript
- analyst_firm and analyst_name only for analyst_report, otherwise null
- Use null for any field you cannot determine with confidence`

    const message = await getAnthropicClient().messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : '{}'
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const extracted = JSON.parse(cleaned)

    return NextResponse.json({ ...extracted, source: 'claude' })
  } catch (err) {
    console.error('[extract-metadata] Claude step failed:', err)
    // Never hard-error — return best-effort from filename so row goes to Ready
    return NextResponse.json({
      quarter: quarterHint ?? '',
      fiscal_year: quarterHint ? `FY${quarterHint.match(/FY(\d+)/)?.[1] ?? ''}` : '',
      doc_type: docTypeHint ?? '',
      analyst_firm: null,
      analyst_name: null,
      source: 'filename_fallback',
    })
  }
}
