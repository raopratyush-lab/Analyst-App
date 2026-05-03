import * as pdfParseModule from 'pdf-parse'
const pdfParse: (buf: Buffer, opts?: { max?: number }) => Promise<{ text: string }> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pdfParseModule as any).default ?? pdfParseModule

import { supabase } from '@/lib/supabase'
import { extractTranscript } from './transcript'
import { extractAnalystReport } from './report'

export async function runExtraction(documentId: string): Promise<{ ok: boolean; message: string }> {
  // 1. Fetch document record
  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .select('*, companies(name)')
    .eq('id', documentId)
    .single()

  if (docErr || !doc) return { ok: false, message: 'Document not found' }
  if (!['transcript', 'analyst_report'].includes(doc.doc_type)) {
    return { ok: false, message: `doc_type "${doc.doc_type}" does not need extraction` }
  }

  // 2. Mark as processing
  await supabase
    .from('documents')
    .update({ extraction_status: 'processing' })
    .eq('id', documentId)

  await supabase.from('ingestion_log').insert({
    event_type: 'extraction',
    company_id: doc.company_id,
    quarter: doc.quarter,
    document_id: documentId,
    status: 'started',
  })

  const start = Date.now()

  try {
    // 3. Download PDF from Supabase storage
    const { data: fileData, error: fileErr } = await supabase.storage
      .from('corpus')
      .download(doc.file_path)

    if (fileErr || !fileData) throw new Error(`Storage download failed: ${fileErr?.message}`)

    const buffer = Buffer.from(await fileData.arrayBuffer())
    const parsed = await pdfParse(buffer)
    const pdfText = parsed.text

    const companyName = (doc.companies as { name: string })?.name ?? ''

    // 4. Route to correct extraction function
    if (doc.doc_type === 'transcript') {
      await extractAndSaveTranscript(doc, pdfText, companyName)
    } else {
      await extractAndSaveReport(doc, pdfText, companyName)
    }

    // 5. Mark complete
    const duration = Date.now() - start
    await supabase.from('documents').update({ extraction_status: 'complete' }).eq('id', documentId)
    await supabase.from('ingestion_log').insert({
      event_type: 'extraction',
      company_id: doc.company_id,
      quarter: doc.quarter,
      document_id: documentId,
      status: 'complete',
      duration_ms: duration,
    })

    return { ok: true, message: `Extracted in ${(duration / 1000).toFixed(1)}s` }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await supabase.from('documents').update({ extraction_status: 'failed' }).eq('id', documentId)
    await supabase.from('ingestion_log').insert({
      event_type: 'extraction',
      company_id: doc.company_id,
      quarter: doc.quarter,
      document_id: documentId,
      status: 'failed',
      detail: msg,
    })
    return { ok: false, message: msg }
  }
}

async function extractAndSaveTranscript(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc: any,
  pdfText: string,
  companyName: string
) {
  const result = await extractTranscript(pdfText, companyName, doc.quarter)

  // Upsert each analyst and save their questions
  for (const q of result.questions) {
    if (!q.analyst_name || !q.question_text) continue

    // Upsert analyst
    const { data: analyst } = await supabase
      .from('analysts')
      .upsert({ name: q.analyst_name, firm: q.analyst_firm ?? null }, { onConflict: 'name,firm' })
      .select('id')
      .single()

    if (!analyst) continue

    // Resolve signal ID from name
    let signalId: string | null = null
    if (q.signal_name) {
      const { data: signal } = await supabase
        .from('taxonomy_signals')
        .select('id')
        .eq('name', q.signal_name)
        .eq('status', 'active')
        .single()
      signalId = signal?.id ?? null
    }

    // Save question
    await supabase.from('transcript_questions').insert({
      document_id: doc.id,
      company_id: doc.company_id,
      analyst_id: analyst.id,
      quarter: doc.quarter,
      question_text: q.question_text,
      question_index: q.question_index,
      is_followup: q.is_followup,
      signal_id: signalId,
    })

    // Update analyst history depth flag (>= 3 quarters)
    const { count } = await supabase
      .from('transcript_questions')
      .select('quarter', { count: 'exact', head: true })
      .eq('analyst_id', analyst.id)
    if ((count ?? 0) >= 3) {
      await supabase.from('analysts').update({ history_depth_flag: true }).eq('id', analyst.id)
    }
  }
}

async function extractAndSaveReport(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc: any,
  pdfText: string,
  companyName: string
) {
  const result = await extractAnalystReport(
    pdfText,
    companyName,
    doc.quarter,
    doc.analyst_name,
    doc.analyst_firm
  )

  // Upsert analyst if known
  let analystId: string | null = null
  const analystName = result.analyst_name ?? doc.analyst_name
  const analystFirm = result.analyst_firm ?? doc.analyst_firm

  if (analystName) {
    const { data: analyst } = await supabase
      .from('analysts')
      .upsert({ name: analystName, firm: analystFirm ?? null }, { onConflict: 'name,firm' })
      .select('id')
      .single()
    analystId = analyst?.id ?? null
  }

  // Save intent signals
  for (const signal of result.intent_signals ?? []) {
    if (!signal.exact_language) continue

    let signalId: string | null = null
    if (signal.signal_name) {
      const { data: sig } = await supabase
        .from('taxonomy_signals')
        .select('id')
        .eq('name', signal.signal_name)
        .eq('status', 'active')
        .single()
      signalId = sig?.id ?? null
    }

    await supabase.from('analyst_intent_signals').insert({
      document_id: doc.id,
      analyst_id: analystId,
      company_id: doc.company_id,
      quarter: doc.quarter,
      signal_id: signalId,
      intent_type: signal.intent_type,
      exact_language: signal.exact_language,
      was_raised_on_call: signal.was_raised_on_call,
    })
  }

  // Save company intelligence
  await supabase.from('company_intelligence').insert({
    document_id: doc.id,
    company_id: doc.company_id,
    analyst_id: analystId,
    quarter: doc.quarter,
    revenue_revision: result.revenue_revision,
    ebitda_revision: result.ebitda_revision,
    eps_revision: result.eps_revision,
    valuation_commentary: result.valuation_commentary,
    fair_value_change: result.fair_value_change,
    recommendation: result.recommendation,
    recommendation_change: result.recommendation_change,
    recommendation_rationale: result.recommendation_rationale,
    consensus_narrative: result.consensus_narrative,
  })

  // Update document with resolved analyst info
  if (analystName || analystFirm) {
    await supabase
      .from('documents')
      .update({ analyst_name: analystName, analyst_firm: analystFirm })
      .eq('id', doc.id)
  }
}
