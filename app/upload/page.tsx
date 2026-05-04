'use client'

import { useState, useRef } from 'react'

const DOC_TYPE_LABELS: Record<string, string> = {
  transcript: 'Transcript',
  analyst_report: 'Analyst Report',
  press_release: 'Press Release',
  investor_presentation: 'Investor Presentation',
  results_announcement: 'Results Announcement',
  other: 'Other',
}

const DOC_TYPES = Object.keys(DOC_TYPE_LABELS)

type RowStatus = 'pending' | 'classifying' | 'ready' | 'uploading' | 'extracting' | 'done' | 'error'

interface FileRow {
  file: File
  status: RowStatus
  company: string
  quarter: string
  doc_type: string
  analyst_firm: string
  analyst_name: string
  error?: string
}

export default function UploadPage() {
  const [rows, setRows] = useState<FileRow[]>([])
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function addFiles(files: File[]) {
    const pdfs = files.filter(f => f.type === 'application/pdf' || f.name.endsWith('.pdf'))
    setRows(prev => [
      ...prev,
      ...pdfs.map(f => ({
        file: f, status: 'pending' as RowStatus,
        company: '', quarter: '', doc_type: '', analyst_firm: '', analyst_name: '',
      })),
    ])
  }

  function updateRow(i: number, patch: Partial<FileRow>) {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  }

  function removeRow(i: number) {
    setRows(prev => prev.filter((_, idx) => idx !== i))
  }

  async function classifyAll() {
    const pending = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.status === 'pending')
    await Promise.all(pending.map(async ({ r, i }) => {
      updateRow(i, { status: 'classifying' })
      try {
        const fd = new FormData()
        fd.append('file', r.file)
        const res = await fetch('/api/extract-metadata', { method: 'POST', body: fd })
        const data = await res.json()
        if (data.error) throw new Error(data.error)
        updateRow(i, {
          status: 'ready',
          company: data.company ?? '',
          quarter: data.quarter ?? '',
          doc_type: data.doc_type ?? '',
          analyst_firm: data.analyst_firm ?? '',
          analyst_name: data.analyst_name ?? '',
        })
      } catch (err) {
        updateRow(i, {
          status: 'ready', // still go to ready so user can fix manually
          error: err instanceof Error ? err.message : 'Classification failed',
        })
      }
    }))
  }

  async function processAll() {
    const ready = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.status === 'ready' && r.company && r.quarter)

    // Process sequentially to avoid overwhelming the API
    for (const { r, i } of ready) {
      // Step 1: Upload
      updateRow(i, { status: 'uploading' })
      try {
        const fd = new FormData()
        fd.append('file', r.file)
        fd.append('company_name', r.company)
        fd.append('doc_type', r.doc_type || 'other')
        fd.append('quarter', r.quarter)
        if (r.analyst_firm) fd.append('analyst_firm', r.analyst_firm)
        if (r.analyst_name) fd.append('analyst_name', r.analyst_name)

        const uploadRes = await fetch('/api/upload', { method: 'POST', body: fd })
        const uploadData = await uploadRes.json()
        if (!uploadRes.ok) throw new Error(uploadData.error)

        const documentId = uploadData.document?.id
        if (!documentId) throw new Error('No document ID returned')

        // Step 2: Extract (only for transcripts and analyst reports)
        if (['transcript', 'analyst_report'].includes(r.doc_type)) {
          updateRow(i, { status: 'extracting' })
          const extractRes = await fetch('/api/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ document_ids: [documentId] }),
          })
          const extractData = await extractRes.json()
          if (extractData.failed > 0) {
            const failedResult = extractData.results?.find((r: { ok: boolean }) => !r.ok)
            throw new Error(failedResult?.message ?? 'Extraction failed')
          }
        }

        updateRow(i, { status: 'done', error: undefined })
      } catch (err) {
        updateRow(i, { status: 'error', error: err instanceof Error ? err.message : 'Failed' })
      }
    }
  }

  const hasPending = rows.some(r => r.status === 'pending')
  const hasReady = rows.some(r => r.status === 'ready' && r.company && r.quarter)
  const isProcessing = rows.some(r => r.status === 'uploading' || r.status === 'extracting' || r.status === 'classifying')
  const allDone = rows.length > 0 && rows.every(r => r.status === 'done' || r.status === 'error')
  const readyCount = rows.filter(r => r.status === 'ready' && r.company && r.quarter).length

  return (
    <div className="max-w-5xl mx-auto py-10 px-4">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Upload Documents</h1>
        <p className="text-sm text-gray-500">
          Drop any mix of transcripts, analyst reports, or results documents across any companies.
          The AI classifies each file automatically — review, correct if needed, then process.
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); addFiles(Array.from(e.dataTransfer.files)) }}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors mb-6 ${
          dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
        }`}
      >
        <div className="text-4xl mb-3">📂</div>
        <p className="text-sm font-medium text-gray-700">Drop PDFs here or click to browse</p>
        <p className="text-xs text-gray-400 mt-1">Any company · Any quarter · Multiple files</p>
        <input ref={fileInputRef} type="file" accept=".pdf" multiple className="hidden"
          onChange={e => addFiles(Array.from(e.target.files ?? []))} />
      </div>

      {/* File table */}
      {rows.length > 0 && (
        <div className="mb-5 rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500">
                <th className="text-left px-4 py-3">File</th>
                <th className="text-left px-4 py-3">Company</th>
                <th className="text-left px-4 py-3">Quarter</th>
                <th className="text-left px-4 py-3">Type</th>
                <th className="text-left px-4 py-3">Analyst firm</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="px-4 py-3 w-6" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row, i) => (
                <tr key={i} className={
                  row.status === 'done' ? 'bg-green-50' :
                  row.status === 'error' ? 'bg-red-50' :
                  row.status === 'extracting' || row.status === 'uploading' ? 'bg-blue-50' : 'bg-white'
                }>
                  <td className="px-4 py-3 max-w-[180px]">
                    <span className="truncate block text-xs text-gray-700 font-medium" title={row.file.name}>
                      {row.file.name}
                    </span>
                    {row.error && <span className="text-xs text-red-500 block mt-0.5 truncate" title={row.error}>{row.error}</span>}
                  </td>

                  {/* Company */}
                  <td className="px-4 py-3">
                    {row.status === 'ready' ? (
                      <input value={row.company} onChange={e => updateRow(i, { company: e.target.value })}
                        placeholder="Company"
                        className="w-32 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
                    ) : (
                      <span className="text-xs text-gray-700">{row.company || '—'}</span>
                    )}
                  </td>

                  {/* Quarter */}
                  <td className="px-4 py-3">
                    {row.status === 'ready' ? (
                      <input value={row.quarter} onChange={e => updateRow(i, { quarter: e.target.value })}
                        placeholder="Q4FY26"
                        className="w-20 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
                    ) : (
                      <span className="text-xs text-gray-700">{row.quarter || '—'}</span>
                    )}
                  </td>

                  {/* Doc type */}
                  <td className="px-4 py-3">
                    {row.status === 'ready' ? (
                      <select value={row.doc_type} onChange={e => updateRow(i, { doc_type: e.target.value })}
                        className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400">
                        <option value="">Select…</option>
                        {DOC_TYPES.map(t => <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>)}
                      </select>
                    ) : (
                      <span className="text-xs text-gray-700">{DOC_TYPE_LABELS[row.doc_type] || '—'}</span>
                    )}
                  </td>

                  {/* Analyst firm */}
                  <td className="px-4 py-3">
                    {row.status === 'ready' ? (
                      <input value={row.analyst_firm} onChange={e => updateRow(i, { analyst_firm: e.target.value })}
                        placeholder="Firm (optional)"
                        className="w-28 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
                    ) : (
                      <span className="text-xs text-gray-500">{row.analyst_firm || '—'}</span>
                    )}
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    {row.status === 'pending'     && <span className="text-xs text-gray-400">Pending</span>}
                    {row.status === 'classifying' && <span className="text-xs text-blue-500 animate-pulse">Classifying…</span>}
                    {row.status === 'ready'       && <span className="text-xs text-amber-600 font-medium">Review</span>}
                    {row.status === 'uploading'   && <span className="text-xs text-blue-500 animate-pulse">Uploading…</span>}
                    {row.status === 'extracting'  && <span className="text-xs text-blue-600 animate-pulse font-medium">Extracting…</span>}
                    {row.status === 'done'        && <span className="text-xs text-green-700 font-medium">✓ Done</span>}
                    {row.status === 'error'       && <span className="text-xs text-red-600 font-medium">✕ Error</span>}
                  </td>

                  <td className="px-4 py-3">
                    {!['done', 'uploading', 'extracting', 'classifying'].includes(row.status) && (
                      <button onClick={() => removeRow(i)} className="text-gray-300 hover:text-red-400 text-xs">✕</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Actions */}
      {rows.length > 0 && !allDone && (
        <div className="flex gap-3 items-center">
          {hasPending && !isProcessing && (
            <button onClick={classifyAll}
              className="px-5 py-2.5 bg-gray-800 text-white text-sm font-medium rounded-lg hover:bg-gray-900 transition-colors">
              Classify {rows.filter(r => r.status === 'pending').length} file{rows.filter(r => r.status === 'pending').length > 1 ? 's' : ''}
            </button>
          )}
          {hasReady && !isProcessing && (
            <button onClick={processAll}
              className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
              Upload &amp; extract {readyCount} file{readyCount > 1 ? 's' : ''} →
            </button>
          )}
          {isProcessing && (
            <span className="text-sm text-gray-500 animate-pulse">Processing…</span>
          )}
          <p className="text-xs text-gray-400">
            Transcripts and analyst reports are fully extracted during upload.
          </p>
        </div>
      )}

      {allDone && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-sm text-green-800 flex items-center justify-between">
          <span>✓ All files uploaded and extracted. Ready for predictions.</span>
          <div className="flex gap-3">
            <a href="/" className="text-green-700 underline hover:text-green-900 text-xs">Start session →</a>
            <button onClick={() => setRows([])} className="text-green-600 underline hover:text-green-900 text-xs">Upload more</button>
          </div>
        </div>
      )}
    </div>
  )
}
