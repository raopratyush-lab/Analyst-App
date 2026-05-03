import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const company = searchParams.get('company')
  const quarter = searchParams.get('quarter')
  const companies = searchParams.get('companies') // comma-separated list

  if (!quarter) return NextResponse.json({ error: 'quarter required' }, { status: 400 })

  // Build company filter
  let companyIds: string[] = []

  if (companies) {
    const names = companies.split(',').map(s => s.trim()).filter(Boolean)
    const { data } = await supabase.from('companies').select('id, name').in('name', names)
    companyIds = (data ?? []).map(c => c.id)
  } else if (company) {
    const { data } = await supabase.from('companies').select('id, name').eq('name', company).single()
    if (data) companyIds = [data.id]
  }

  if (companyIds.length === 0) return NextResponse.json({ documents: [] })

  const { data, error } = await supabase
    .from('documents')
    .select(`
      id, company_id, quarter, doc_type, source, file_name,
      ingested_at, extraction_status, analyst_firm, analyst_name,
      companies!inner(name)
    `)
    .in('company_id', companyIds)
    .eq('quarter', quarter)
    .order('ingested_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ documents: data ?? [] })
}
