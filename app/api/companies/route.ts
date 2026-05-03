import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const { data, error } = await supabase
    .from('companies')
    .select('id, name, ticker')
    .order('name')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ companies: data ?? [] })
}

export async function POST(req: Request) {
  const { name, ticker } = await req.json()
  if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 })

  const { data, error } = await supabase
    .from('companies')
    .upsert({ name, ticker }, { onConflict: 'name' })
    .select('id, name, ticker')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ company: data })
}
