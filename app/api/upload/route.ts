import { NextRequest, NextResponse } from 'next/server'
import { supabase, DocType } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const companyName = formData.get('company_name') as string
    const docType = formData.get('doc_type') as DocType
    const quarter = formData.get('quarter') as string
    const analystFirm = (formData.get('analyst_firm') as string) || undefined
    const analystName = (formData.get('analyst_name') as string) || undefined

    if (!file || !companyName || !docType || !quarter) {
      return NextResponse.json(
        { error: 'Missing required fields: file, company_name, doc_type, quarter' },
        { status: 400 }
      )
    }

    // 1. Upsert company
    let { data: company, error: companyError } = await supabase
      .from('companies')
      .select('id')
      .eq('name', companyName)
      .single()

    if (companyError || !company) {
      const { data: newCompany, error: insertError } = await supabase
        .from('companies')
        .insert({ name: companyName })
        .select('id')
        .single()

      if (insertError || !newCompany) {
        return NextResponse.json({ error: 'Failed to upsert company' }, { status: 500 })
      }
      company = newCompany
    }

    // 2. Upload file to Supabase Storage
    const fileBuffer = await file.arrayBuffer()
    const fileBytes = new Uint8Array(fileBuffer)
    const storagePath = `${companyName}/${quarter}/${docType}/${Date.now()}_${file.name}`

    const { error: storageError } = await supabase.storage
      .from('corpus')
      .upload(storagePath, fileBytes, {
        contentType: file.type || 'application/pdf',
        upsert: false,
      })

    if (storageError) {
      return NextResponse.json(
        { error: `Storage upload failed: ${storageError.message}` },
        { status: 500 }
      )
    }

    // 3. Create document record
    const fiscalYear = quarter.match(/FY\d{2,4}/)?.[0] ?? undefined

    const { data: doc, error: docError } = await supabase
      .from('documents')
      .insert({
        company_id: company.id,
        quarter,
        fiscal_year: fiscalYear,
        doc_type: docType,
        source: 'pdf_upload',
        file_path: storagePath,
        file_name: file.name,
        extraction_status: 'pending',
        analyst_firm: analystFirm,
        analyst_name: analystName,
      })
      .select()
      .single()

    if (docError || !doc) {
      return NextResponse.json({ error: 'Failed to create document record' }, { status: 500 })
    }

    // 4. Log the ingestion event
    await supabase.from('ingestion_log').insert({
      event_type: 'pdf_upload',
      company_id: company.id,
      quarter,
      document_id: doc.id,
      status: 'complete',
      detail: `${file.name} (${docType})`,
    })

    return NextResponse.json({
      success: true,
      document: doc,
      message: `${file.name} uploaded and queued for extraction.`,
    })
  } catch (err) {
    console.error('[upload] Unexpected error:', err)
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 })
  }
}
