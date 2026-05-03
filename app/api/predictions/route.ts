import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const company = searchParams.get('company')
  const quarter = searchParams.get('quarter')

  if (!company || !quarter) {
    return NextResponse.json({ error: 'company and quarter required' }, { status: 400 })
  }

  const { data: companyRow } = await supabase
    .from('companies')
    .select('id')
    .eq('name', company)
    .single()

  if (!companyRow) return NextResponse.json({ predictions: [] })

  const { data, error } = await supabase
    .from('predictions')
    .select(`
      id, zone, possibility_score, predicted_question,
      signal_strength, analyst_pattern_score, season_corroboration_score,
      peer_transcripts_count, insufficient_history_flag, season_driven_flag,
      evidence_type, evidence_source, dismissed,
      analysts(name, firm),
      taxonomy_signals(name, topic_id)
    `)
    .eq('company_id', companyRow.id)
    .eq('quarter', quarter)
    .eq('dismissed', false)
    .order('zone')
    .order('possibility_score', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ predictions: data ?? [] })
}
