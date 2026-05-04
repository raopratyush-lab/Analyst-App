'use client'

import { useState, useRef } from 'react'

type RowStatus = 'queued' | 'uploading' | 'extracting' | 'done' | 'error'

interface FileRow {
  file: File
  status: RowStatus
  error?: string
}

export default function UploadPage() {
  const [rows, setRows] = useState<FileRow[]>([])
  const [dragging, setDragging] = useState(false)
  const [running, setRunning] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function addFiles(files: File[]) {
    const pdfs = files.filter(f => f.type === 'application/pdf' || f.name.endsWith('.pdf'))
    setRows(prev => [
      ...prev,
      ...pdfs
        .filter(f => !prev.some(r => r.file.name === f.name && r.file.size === f.size))
        .map(f => ({ file: f, status: 'queued' as RowStatus })),
    ])
  }

  function removeRow(i: number) {
    setRows(prev => prev.filter((_, idx) => idx !== i))
  }

  function updateRow(i: number, patch: Partial<FileRow>) {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  }

  async function ingestAll() {
    const queued = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.status === 'queued')
    if (queued.length === 0) return
    setRunning(true)

    for (const { r, i } of queued) {
      try {
        // Step 1: classify silently (no review)
        updateRow(i, { status: 'uploading' })
        const metaFd = new FormData()
        metaFd.append('file', r.file)
        const metaRes = await fetch('/api/extract-metadata', { method: 'POST', body: metaFd })
        const meta = await metaRes.json()

        // Upload with whatever metadata was extracted
        const fd = new FormData()
        fd.append('file', r.file)
        fd.append('company_name', meta.company || 'Unknown')
        fd.append('doc_type', meta.doc_type || 'other')
        fd.append('quarter', meta.quarter || 'Unknown')
        if (meta.analyst_firm) fd.append('analyst_firm', meta.analyst_firm)
        if (meta.analyst_name) fd.append('analyst_name', meta.analyst_name)

        const uploadRes = await fetch('/api/upload', { method: 'POST', body: fd })
        const uploadData = await uploadRes.json()
        if (!uploadRes.ok) throw new Error(uploadData.error)

        const documentId = uploadData.document?.id
        if (!documentId) throw new Error('Upload failed — no document ID returned')

        // Step 2: extract in background (transcripts + analyst reports only)
        if (['transcript', 'analyst_report'].includes(meta.doc_type)) {
          updateRow(i, { status: 'extracting' })
          const extractRes = await fetch('/api/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ document_ids: [documentId] }),
          })
          const extractData = await extractRes.json()
          if (extractData.failed > 0) {
            // Don't fail the whole row — doc is uploaded, extraction can be retried from Corpus
            console.warn('Extraction failed for', r.file.name, extractData)
          }
        }

        updateRow(i, { status: 'done', error: undefined })
      } catch (err) {
        updateRow(i, { status: 'error', error: err instanceof Error ? err.message : 'Failed' })
      }
    }

    setRunning(false)
  }

  const queuedCount = rows.filter(r => r.status === 'queued').length
  const doneCount   = rows.filter(r => r.status === 'done').length
  const allSettled  = rows.length > 0 && rows.every(r => r.status === 'done' || r.status === 'error')

  return (
    <div className="max-w-2xl mx-auto py-10 px-4">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Upload Documents</h1>
        <p className="text-sm text-gray-500">
          Drop any PDFs — transcripts, analyst reports, results, presentations.
          Company, quarter, and document type are detected automatically.
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); addFiles(Array.from(e.dataTransfer.files)) }}
        onClick={() => !running && fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors mb-6 ${
          running ? 'cursor-default border-gray-200 bg-gray-50' :
          dragging ? 'border-blue-400 bg-blue-50 cursor-copy' :
          'border-gray-300 hover:border-blue-400 hover:bg-gray-50 cursor-pointer'
        }`}
      >
        <div className="text-4xl mb-3">📂</div>
        <p className="text-sm font-medium text-gray-700">
          {running ? 'Processing…' : 'Drop PDFs here or click to browse'}
        </p>
        <p className="text-xs text-gray-400 mt-1">Any company · Any quarter · Mix of document types</p>
        <input ref={fileInputRef} type="file" accept=".pdf" multiple className="hidden"
          onChange={e => { addFiles(Array.from(e.target.files ?? [])); e.target.value = '' }} />
      </div>

      {/* File list */}
      {rows.length > 0 && (
        <div className="mb-5 rounded-xl border border-gray-200 overflow-hidden">
          <ul className="divide-y divide-gray-100">
            {rows.map((row, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-3">
                <FileIcon status={row.status} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 truncate font-medium" title={row.file.name}>
                    {row.file.name}
                  </p>
                  {row.error && <p className="text-xs text-red-500 mt-0.5 truncate">{row.error}</p>}
                </div>
                <StatusPill status={row.status} />
                {row.status === 'queued' && !running && (
                  <button onClick={() => removeRow(i)} className="text-gray-300 hover:text-red-400 text-xs flex-shrink-0">✕</button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-4">
        {queuedCount > 0 && (
          <button
            onClick={ingestAll}
            disabled={running}
            className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            {running ? 'Ingesting…' : `Ingest ${queuedCount} file${queuedCount > 1 ? 's' : ''}`}
          </button>
        )}
        {allSettled && doneCount > 0 && (
          <a href="/corpus" className="text-sm text-blue-600 hover:text-blue-800 font-medium">
            View in corpus →
          </a>
        )}
        {allSettled && (
          <button
            onClick={() => setRows([])}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  )
}

function FileIcon({ status }: { status: RowStatus }) {
  const icons: Record<RowStatus, string> = {
    queued: '📄', uploading: '⬆️', extracting: '🧠', done: '✅', error: '❌'
  }
  return <span className="text-lg flex-shrink-0">{icons[status]}</span>
}

function StatusPill({ status }: { status: RowStatus }) {
  const config: Record<RowStatus, { label: string; className: string }> = {
    queued:     { label: 'Queued',     className: 'text-gray-400' },
    uploading:  { label: 'Uploading…', className: 'text-blue-500 animate-pulse' },
    extracting: { label: 'Extracting…',className: 'text-blue-600 animate-pulse font-medium' },
    done:       { label: 'Done',       className: 'text-green-600 font-medium' },
    error:      { label: 'Error',      className: 'text-red-500 font-medium' },
  }
  const c = config[status]
  return <span className={`text-xs flex-shrink-0 ${c.className}`}>{c.label}</span>
}
