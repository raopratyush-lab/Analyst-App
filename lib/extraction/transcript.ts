import { getAnthropicClient, DEFAULT_MODEL } from '@/lib/anthropic'
import { SIGNAL_TAXONOMY_TEXT } from './signals'

export interface ExtractedQuestion {
  analyst_name: string
  analyst_firm: string
  question_text: string
  question_index: number
  is_followup: boolean
  signal_name: string | null  // matched to taxonomy
}

export interface TranscriptExtraction {
  quarter: string
  fiscal_year: string
  questions: ExtractedQuestion[]
  raw_analyst_list: string[]  // all unique analysts seen
}

export async function extractTranscript(
  pdfText: string,
  companyName: string,
  quarter: string
): Promise<TranscriptExtraction> {
  const prompt = `You are extracting structured data from an Indian IT sector earnings call transcript.

Company: ${companyName}
Quarter: ${quarter}

TRANSCRIPT TEXT:
"""
${pdfText.slice(0, 40000)}
"""

SIGNAL TAXONOMY (use EXACTLY these names when tagging):
${SIGNAL_TAXONOMY_TEXT}

Extract ALL analyst questions from the Q&A section. For each question return:
- analyst_name: full name (e.g. "Moshe Katri")
- analyst_firm: brokerage/research firm (e.g. "Wedbush Securities")
- question_text: the verbatim question text
- question_index: sequential position (1, 2, 3...)
- is_followup: true if this is a follow-up to a previous question in the same exchange
- signal_name: the single best matching signal from the taxonomy above, or null if no clear match

Return ONLY valid JSON, no markdown:
{
  "quarter": "Q4FY26",
  "fiscal_year": "FY26",
  "questions": [...],
  "raw_analyst_list": ["Name — Firm", ...]
}

Rules:
- Include ALL questions, even short clarifying ones
- Do NOT include management responses
- is_followup = true when the analyst says "follow up", "just to clarify", "one more" etc or when it's their second question in the same exchange
- For signal_name, pick the closest match from the taxonomy. If truly none applies, use null
- raw_analyst_list should be deduplicated: "Analyst Name — Firm"`

  const message = await getAnthropicClient().messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 8096,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : '{}'
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  return JSON.parse(cleaned) as TranscriptExtraction
}
