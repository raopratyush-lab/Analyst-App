import { createClient } from '@supabase/supabase-js'

// Falls back to placeholder strings at build time so Next.js can compile
// without a .env.local present. Actual requests will fail with a clear
// Supabase error if the real keys aren't set at runtime.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ---- Type helpers ----

export type DocType =
  | 'transcript'
  | 'analyst_report'
  | 'press_release'
  | 'investor_presentation'
  | 'results_announcement'
  | 'other'

export type IngestionSource = 'ir_scraper' | 'pdf_upload' | 'manual_drop'

export interface Company {
  id: string
  name: string
  ticker?: string
  exchange?: string
  created_at: string
}

export interface DocumentRecord {
  id: string
  company_id: string
  quarter: string
  fiscal_year?: string
  doc_type: DocType
  source: IngestionSource
  file_path?: string
  file_name?: string
  ir_url?: string
  ingested_at: string
  extraction_status: 'pending' | 'processing' | 'complete' | 'failed'
  analyst_firm?: string
  analyst_name?: string
}
