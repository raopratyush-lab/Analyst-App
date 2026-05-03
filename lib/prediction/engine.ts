import { supabase } from '@/lib/supabase'
import { getAnthropicClient, DEFAULT_MODEL } from '@/lib/anthropic'
import { SIGNAL_TAXONOMY_TEXT } from '@/lib/extraction/signals'

export interface PredictionInput {
  targetCompanyId: string
  targetCompanyName: string
  quarter: string
  peerCompanyIds: string[]
  peerCompanyNames: string[]
}

export async function generatePredictions(input: PredictionInput): Promise<{
  ok: boolean
  message: string
  counts: { zone1: number; zone2: number; zone3: number }
}> {
  const { targetCompanyId, targetCompanyName, quarter, peerCompanyIds, peerCompanyNames } = input

  // Clear previous predictions for this company+quarter
  await supabase
    .from('predictions')
    .delete()
    .eq('company_id', targetCompanyId)
    .eq('quarter', quarter)

  // Count same-quarter peer transcripts already ingested
  const { count: peerTranscriptCount } = await supabase
    .from('transcript_questions')
    .select('id', { count: 'exact', head: true })
    .in('company_id', peerCompanyIds.length > 0 ? peerCompanyIds : ['none'])
    .eq('quarter', quarter)

  const peerCount = peerTranscriptCount ?? 0

  // ── ZONE 1: Analyst predictions ──────────────────────────────────────
  const zone1Count = await generateZone1(input, peerCount)

  // ── ZONE 2: Unasked signal flags ──────────────────────────────────────
  const zone2Count = await generateZone2(input)

  // ── ZONE 3: Unowned signals ──────────────────────────────────────────
  const zone3Count = await generateZone3(input, peerCount)

  // Update season record
  await supabase
    .from('seasons')
    .upsert({
      quarter,
      peer_count: peerCount,
      season_position: peerCount === 0 ? 'pre' : peerCount <= 2 ? 'early' : peerCount <= 5 ? 'mid' : 'late',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'quarter' })

  return {
    ok: true,
    message: `Generated ${zone1Count + zone2Count + zone3Count} predictions`,
    counts: { zone1: zone1Count, zone2: zone2Count, zone3: zone3Count },
  }
}

// ── Zone 1: named analyst predictions ─────────────────────────────────────
async function generateZone1(input: PredictionInput, peerCount: number): Promise<number> {
  const { targetCompanyId, targetCompanyName, quarter, peerCompanyIds } = input

  // Fetch all analysts who have asked questions at this company or peers
  const { data: analysts } = await supabase
    .from('analysts')
    .select('id, name, firm, history_depth_flag')
    .order('name')

  if (!analysts || analysts.length === 0) return 0

  // Fetch target company transcript questions (historical)
  const { data: targetQuestions } = await supabase
    .from('transcript_questions')
    .select('analyst_id, quarter, question_text, signal_id, taxonomy_signals(name)')
    .eq('company_id', targetCompanyId)
    .order('quarter', { ascending: false })
    .limit(200)

  // Fetch peer transcript questions for this quarter
  const { data: peerQuestions } = peerCompanyIds.length > 0
    ? await supabase
        .from('transcript_questions')
        .select('analyst_id, quarter, question_text, signal_id, taxonomy_signals(name), companies(name)')
        .in('company_id', peerCompanyIds)
        .eq('quarter', quarter)
        .limit(300)
    : { data: [] }

  // Fetch intent signals for target company
  const { data: intentSignals } = await supabase
    .from('analyst_intent_signals')
    .select('analyst_id, signal_id, intent_type, exact_language, taxonomy_signals(name)')
    .eq('company_id', targetCompanyId)
    .order('quarter', { ascending: false })
    .limit(100)

  // Build context for Claude
  const tqByAnalyst = groupBy(targetQuestions ?? [], 'analyst_id')
  const pqByAnalyst = groupBy(peerQuestions ?? [], 'analyst_id')
  const intentByAnalyst = groupBy(intentSignals ?? [], 'analyst_id')

  const analystSummaries = analysts
    .filter(a => tqByAnalyst[a.id] || pqByAnalyst[a.id] || intentByAnalyst[a.id])
    .slice(0, 15) // limit to top 15 active analysts
    .map(analyst => {
      const histQuestions = (tqByAnalyst[analyst.id] ?? [])
        .slice(0, 5)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((q: any) => `  Q(${q.quarter}): "${q.question_text?.slice(0, 120)}" [Signal: ${(q.taxonomy_signals as any)?.name ?? 'none'}]`)
        .join('\n')

      const peerQs = (pqByAnalyst[analyst.id] ?? [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((q: any) => `  Peer Q(${quarter}): "${q.question_text?.slice(0, 120)}" at ${(q.companies as any)?.name}`)
        .join('\n')

      const intents = (intentByAnalyst[analyst.id] ?? [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((s: any) => `  [${s.intent_type}] "${s.exact_language?.slice(0, 120)}" [Signal: ${(s.taxonomy_signals as any)?.name ?? 'none'}]`)
        .join('\n')

      return `ANALYST: ${analyst.name} (${analyst.firm ?? 'Unknown firm'}) — history_depth_flag: ${analyst.history_depth_flag}
Historical questions at ${targetCompanyName}:
${histQuestions || '  (none)'}
Same-quarter peer questions:
${peerQs || '  (none)'}
Post-results report intent signals:
${intents || '  (none)'}`
    }).join('\n\n---\n\n')

  if (!analystSummaries) return 0

  const prompt = `You are generating Zone 1 analyst Q&A predictions for ${targetCompanyName} ${quarter}.

Same-quarter peer transcripts ingested: ${peerCount}
${peerCount === 0 ? 'Pre-season: predictions based on historical patterns only.' : peerCount <= 2 ? 'Early season: some peer corroboration available.' : 'Mid/late season: strong peer corroboration available.'}

SIGNAL TAXONOMY:
${SIGNAL_TAXONOMY_TEXT}

ANALYST PROFILES AND HISTORY:
${analystSummaries}

For each analyst with sufficient evidence, generate 1-2 predicted questions. Apply:
- Signal Strength gate: if the signal is not clearly present, cap possibility_score at 40
- insufficient_history_flag: true if history_depth_flag is false
- season_driven_flag: true if prediction is primarily from peer questions with low personal history

Return ONLY valid JSON array:
[
  {
    "analyst_name": "Name",
    "analyst_firm": "Firm",
    "zone": 1,
    "predicted_question": "The predicted question text",
    "signal_name": "exact signal from taxonomy or null",
    "possibility_score": 0-100,
    "signal_strength": "high" | "medium" | "low",
    "analyst_pattern_score": 0-100,
    "season_corroboration_score": 0-100,
    "insufficient_history_flag": true | false,
    "season_driven_flag": true | false,
    "evidence_type": "own_company_history" | "peer_derived" | "report_intent_signal",
    "evidence_source": "brief description of the evidence"
  }
]

Only include predictions where you have real evidence. Quality over quantity.`

  const message = await getAnthropicClient().messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : '[]'
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  const predictions = JSON.parse(cleaned) as Array<Record<string, unknown>>

  // Save each prediction to Supabase
  let saved = 0
  for (const p of predictions) {
    const { data: analyst } = await supabase
      .from('analysts')
      .select('id')
      .eq('name', p.analyst_name as string)
      .single()

    let signalId: string | null = null
    if (p.signal_name) {
      const { data: sig } = await supabase
        .from('taxonomy_signals')
        .select('id')
        .eq('name', p.signal_name as string)
        .single()
      signalId = sig?.id ?? null
    }

    await supabase.from('predictions').insert({
      company_id: targetCompanyId,
      quarter,
      analyst_id: analyst?.id ?? null,
      zone: 1,
      predicted_question: p.predicted_question,
      signal_id: signalId,
      possibility_score: p.possibility_score,
      signal_strength: p.signal_strength,
      analyst_pattern_score: p.analyst_pattern_score,
      season_corroboration_score: p.season_corroboration_score,
      peer_transcripts_count: peerCount,
      insufficient_history_flag: p.insufficient_history_flag,
      season_driven_flag: p.season_driven_flag,
      evidence_type: p.evidence_type,
      evidence_source: p.evidence_source as string,
    })
    saved++
  }
  return saved
}

// ── Zone 2: Unasked signal flags ────────────────────────────────────────────
async function generateZone2(input: PredictionInput): Promise<number> {
  const { targetCompanyId, quarter } = input

  // Fetch unasked flags from analyst reports
  const { data: unaskedFlags } = await supabase
    .from('analyst_intent_signals')
    .select('id, analyst_id, signal_id, exact_language, analysts(name, firm), taxonomy_signals(name)')
    .eq('company_id', targetCompanyId)
    .eq('intent_type', 'unasked_flag')
    .order('quarter', { ascending: false })
    .limit(50)

  if (!unaskedFlags || unaskedFlags.length === 0) return 0

  let saved = 0
  for (const flag of unaskedFlags) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const analyst = flag.analysts as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const signal = flag.taxonomy_signals as any

    await supabase.from('predictions').insert({
      company_id: targetCompanyId,
      quarter,
      analyst_id: flag.analyst_id,
      zone: 2,
      predicted_question: `[Unasked flag] ${flag.exact_language}`,
      signal_id: flag.signal_id,
      possibility_score: 65, // unasked flags have inherently high predictive value
      signal_strength: 'medium',
      analyst_pattern_score: 50,
      season_corroboration_score: 0,
      peer_transcripts_count: 0,
      insufficient_history_flag: false,
      season_driven_flag: false,
      evidence_type: 'unasked_flag',
      evidence_source: `${analyst?.name ?? 'Unknown'} (${analyst?.firm ?? ''}) flagged: "${flag.exact_language?.slice(0, 100)}"`,
    })
    saved++
  }
  return saved
}

// ── Zone 3: Unowned signals (model-generated) ────────────────────────────────
async function generateZone3(input: PredictionInput, peerCount: number): Promise<number> {
  const { targetCompanyId, targetCompanyName, quarter, peerCompanyIds } = input

  // Get all signals already covered in Zone 1 & 2 for this company/quarter
  const { data: existingPredictions } = await supabase
    .from('predictions')
    .select('signal_id')
    .eq('company_id', targetCompanyId)
    .eq('quarter', quarter)
    .in('zone', [1, 2])

  const coveredSignalIds = new Set((existingPredictions ?? []).map(p => p.signal_id).filter(Boolean))

  // Get transcript questions for all companies to find sector-wide patterns
  const allCompanyIds = [targetCompanyId, ...peerCompanyIds]
  const { data: allQuestions } = await supabase
    .from('transcript_questions')
    .select('signal_id, company_id, quarter, taxonomy_signals(name)')
    .in('company_id', allCompanyIds)
    .order('quarter', { ascending: false })
    .limit(500)

  // Find signals that are appearing frequently in peers but not yet covered in predictions
  const signalFrequency: Record<string, { count: number; name: string }> = {}
  for (const q of allQuestions ?? []) {
    if (!q.signal_id || coveredSignalIds.has(q.signal_id)) continue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const name = (q.taxonomy_signals as any)?.name
    if (!name) continue
    if (!signalFrequency[q.signal_id]) signalFrequency[q.signal_id] = { count: 0, name }
    signalFrequency[q.signal_id].count++
  }

  const uncoveredSignals = Object.entries(signalFrequency)
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 10)
    .map(([id, { name, count }]) => ({ id, name, count }))

  if (uncoveredSignals.length === 0) return 0

  const prompt = `You are identifying Zone 3 "Unowned Signals" for ${targetCompanyName} ${quarter}.

These are financial anomalies or sector patterns that no analyst has explicitly flagged yet for this company, but which warrant attention.

Peer transcripts this quarter: ${peerCount}

Signals appearing frequently across sector transcripts but not yet covered in analyst predictions:
${uncoveredSignals.map(s => `- ${s.name} (seen ${s.count} times across sector)`).join('\n')}

SIGNAL TAXONOMY:
${SIGNAL_TAXONOMY_TEXT}

For each signal that is genuinely worth flagging for ${targetCompanyName} this quarter, generate an unowned signal entry. Only include signals where there's a plausible reason they might matter for THIS company.

Return ONLY valid JSON array (max 5 entries):
[
  {
    "signal_name": "exact signal name from taxonomy",
    "predicted_question": "The question an analyst might ask about this signal",
    "anomaly_description": "Why the model flagged this — what pattern or anomaly triggered it",
    "likely_analysts": "Which analysts in the coverage universe are most likely to notice this, based on their known interests",
    "possibility_score": 20-60
  }
]`

  const message = await getAnthropicClient().messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : '[]'
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  const unownedSignals = JSON.parse(cleaned) as Array<Record<string, unknown>>

  let saved = 0
  for (const s of unownedSignals) {
    let signalId: string | null = null
    if (s.signal_name) {
      const { data: sig } = await supabase
        .from('taxonomy_signals')
        .select('id')
        .eq('name', s.signal_name as string)
        .single()
      signalId = sig?.id ?? null
    }

    await supabase.from('predictions').insert({
      company_id: targetCompanyId,
      quarter,
      analyst_id: null,
      zone: 3,
      predicted_question: s.predicted_question,
      signal_id: signalId,
      possibility_score: s.possibility_score,
      signal_strength: 'low',
      analyst_pattern_score: 0,
      season_corroboration_score: Math.min(50, (s.possibility_score as number) ?? 30),
      peer_transcripts_count: peerCount,
      insufficient_history_flag: false,
      season_driven_flag: true,
      evidence_type: 'model_generated',
      evidence_source: s.anomaly_description as string,
    })
    saved++
  }
  return saved
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function groupBy<T extends Record<string, any>>(arr: T[], key: string): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = item[key]
    if (!acc[k]) acc[k] = []
    acc[k].push(item)
    return acc
  }, {} as Record<string, T[]>)
}
