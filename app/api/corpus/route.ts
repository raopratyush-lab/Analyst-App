import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const { data, error } = await supabase
    .from('documents')
    .select(`
      id, file_name, doc_type, quarter, source,
      extraction_status, ingested_at,
      analyst_firm, analyst_name,
      companies!inner(name)
    `)
    .order('ingested_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ documents: data ?? [] })
}
