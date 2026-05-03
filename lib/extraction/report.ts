import { getAnthropicClient, DEFAULT_MODEL } from '@/lib/anthropic'
import { SIGNAL_TAXONOMY_TEXT } from './signals'

export interface IntentSignal {
  signal_name: string | null
  intent_type: 'followup_intent' | 'unasked_flag'
  exact_language: string   // verbatim quote from the report
  was_raised_on_call: boolean
}

export interface ReportExtraction {
  analyst_name: string | null
  analyst_firm: string | null
  quarter: string
  // Intent signals
  intent_signals: IntentSignal[]
  // Company intelligence
  revenue_revision: string | null
  ebitda_revision: string | null
  eps_revision: string | null
  valuation_commentary: string | null
  fair_value_change: string | null
  recommendation: string | null
  recommendation_change: string | null
  recommendation_rationale: string | null
  consensus_narrative: string | null
}

export async function extractAnalystReport(
  pdfText: string,
  companyName: string,
  quarter: string,
  analystNameHint?: string,
  analystFirmHint?: string
): Promise<ReportExtraction> {
  const prompt = `You are extracting structured intelligence from an Indian IT sector sell-side analyst report.

Company: ${companyName}
Quarter: ${quarter}
${analystNameHint ? `Analyst (from upload metadata): ${analystNameHint}` : ''}
${analystFirmHint ? `Firm (from upload metadata): ${analystFirmHint}` : ''}

REPORT TEXT:
"""
${pdfText.slice(0, 40000)}
"""

SIGNAL TAXONOMY:
${SIGNAL_TAXONOMY_TEXT}

Extract the following. Return ONLY valid JSON, no markdown:

{
  "analyst_name": "Full name or null",
  "analyst_firm": "Firm name or null",
  "quarter": "Q4FY26",

  "intent_signals": [
    {
      "signal_name": "exact signal name from taxonomy or null",
      "intent_type": "followup_intent" | "unasked_flag",
      "exact_language": "verbatim quote from the report",
      "was_raised_on_call": true | false
    }
  ],

  "revenue_revision": "e.g. +2.1% vs prior estimate, or null",
  "ebitda_revision": "e.g. -0.5% vs prior, or null",
  "eps_revision": "e.g. maintained, or null",
  "valuation_commentary": "brief summary of valuation view or null",
  "fair_value_change": "e.g. raised to Rs 4,200 from Rs 3,900, or null",
  "recommendation": "buy" | "hold" | "sell" | "neutral" | "outperform" | "underperform" | "other" | null,
  "recommendation_change": "upgrade" | "downgrade" | "maintain" | "initiate" | null,
  "recommendation_rationale": "brief rationale or null",
  "consensus_narrative": "1-2 sentence summary of prevailing analyst view on this company this quarter or null"
}

Definitions:
- followup_intent: analyst asked a question on the call, got an unsatisfying answer, and explicitly flags they will revisit. Look for language like "we will watch", "we expect more detail", "management needs to clarify"
- unasked_flag: analyst noticed a metric/trend in the numbers but did NOT raise it on the call. Flagged in the report as a concern to monitor. These are the most valuable signals.
- For intent_signals, extract EVERY forward-looking concern you find. Even subtle ones.
- exact_language must be a direct quote from the text, not a paraphrase`

  const message = await getAnthropicClient().messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : '{}'
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  return JSON.parse(cleaned) as ReportExtraction
}
