import { NextRequest, NextResponse } from 'next/server'
import { generatePredictions } from '@/lib/prediction/engine'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { company, quarter, peers } = await req.json()
    if (!company || !quarter) {
      return NextResponse.json({ error: 'company and quarter required' }, { status: 400 })
    }

    // Resolve company IDs
    const { data: targetCompany } = await supabase
      .from('companies')
      .select('id, name')
      .eq('name', company)
      .single()

    if (!targetCompany) {
      return NextResponse.json({ error: `Company "${company}" not found in corpus` }, { status: 404 })
    }

    const peerNames: string[] = peers ?? []
    let peerIds: string[] = []

    if (peerNames.length > 0) {
      const { data: peerCompanies } = await supabase
        .from('companies')
        .select('id, name')
        .in('name', peerNames)
      peerIds = (peerCompanies ?? []).map(c => c.id)
    }

    const result = await generatePredictions({
      targetCompanyId: targetCompany.id,
      targetCompanyName: targetCompany.name,
      quarter,
      peerCompanyIds: peerIds,
      peerCompanyNames: peerNames,
    })

    return NextResponse.json(result)
  } catch (err) {
    console.error('[api/predict]', err)
    return NextResponse.json({ error: 'Prediction generation failed' }, { status: 500 })
  }
}
