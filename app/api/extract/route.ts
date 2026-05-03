import { NextRequest, NextResponse } from 'next/server'
import { runExtraction } from '@/lib/extraction/orchestrator'

// POST /api/extract — trigger extraction for one or more documents
export async function POST(req: NextRequest) {
  try {
    const { document_ids } = await req.json()

    if (!document_ids || !Array.isArray(document_ids) || document_ids.length === 0) {
      return NextResponse.json({ error: 'document_ids array required' }, { status: 400 })
    }

    // Run extractions in parallel (up to 3 at a time to avoid overwhelming the API)
    const results = []
    for (let i = 0; i < document_ids.length; i += 3) {
      const batch = document_ids.slice(i, i + 3)
      const batchResults = await Promise.all(
        batch.map(async (id: string) => {
          const result = await runExtraction(id)
          return { document_id: id, ...result }
        })
      )
      results.push(...batchResults)
    }

    const succeeded = results.filter(r => r.ok).length
    const failed = results.filter(r => !r.ok).length

    return NextResponse.json({ results, succeeded, failed })
  } catch (err) {
    console.error('[api/extract]', err)
    return NextResponse.json({ error: 'Extraction failed' }, { status: 500 })
  }
}
