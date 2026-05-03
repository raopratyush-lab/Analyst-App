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

const COMPANIES = [
  'TCS', 'Infosys', 'Wipro', 'HCL Technologies', 'Tech Mahindra',
  'LTIMindtree', 'Mphasis', 'Coforge', 'Persistent Systems', 'KPIT Technologies',
]

interface FileRow {
  file: File
  status: 'pending' | 'extracting' | 'ready' | 'uploading' | 'done' | 'error'
  quarter: string
  doc_type: string
  analyst_firm: string
  analyst_name: string
  error?: string
}

export default function UploadPage() {
  const [company, setCompany] = useState('')
  const [customCompany, setCustomCompany] = useState('')
  const [rows, setRows] = useState<FileRow[]>([])
  const [dragging, setDragging] = useState(false)
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'done'>('idle')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const effectiveCompany = company === '__custom__' ? customCompany : company

  function addFiles(files: File[]) {
    const pdfs = files.filter(f => f.type === 'application/pdf' || f.name.endsWith('.pdf'))
    const newRows: FileRow[] = pdfs.map(f => ({
      file: f,
      status: 'pending',
      quarter: '',
      doc_type: '',
      analyst_firm: '',
      analyst_name: '',
    }))
    setRows(prev => [...prev, ...newRows])
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    addFiles(Array.from(e.dataTransfer.files))
  }

  function updateRow(index: number, patch: Partial<FileRow>) {
    setRows(prev => prev.map((r, i) => i === index ? { ...r, ...patch } : r))
  }

  function removeRow(index: number) {
    setRows(prev => prev.filter((_, i) => i !== index))
  }

  async function extractAll() {
    const pending = rows.map((r, i) => ({ row: r, i })).filter(({ row }) => row.status === 'pending')
    await Promise.all(pending.map(async ({ row, i }) => {
      updateRow(i, { status: 'extracting' })
      try {
        const fd = new FormData()
        fd.append('file', row.file)
        const res = await fetch('/api/extract-metadata', { method: 'POST', body: fd })
        const data = await res.json()
        if (data.error) throw new Error(data.error)
        updateRow(i, {
          status: 'ready',
          quarter: data.quarter ?? '',
          doc_type: data.doc_type ?? '',
          analyst_firm: data.analyst_firm ?? '',
          analyst_name: data.analyst_name ?? '',
        })
      } catch (err) {
        updateRow(i, { status: 'error', error: err instanceof Error ? err.message : 'Extraction failed' })
      }
    }))
  }

  async function uploadAll() {
    const ready = rows.filter(r => r.status === 'ready')
    if (!effectiveCompany || ready.length === 0) return
    setUploadStatus('uploading')

    await Promise.all(rows.map(async (row, i) => {
      if (row.status !== 'ready') return
      updateRow(i, { status: 'uploading' })
      try {
        const fd = new FormData()
        fd.append('file', row.file)
        fd.append('company_name', effectiveCompany)
        fd.append('doc_type', row.doc_type || 'other')
        fd.append('quarter', row.quarter)
        if (row.analyst_firm) fd.append('analyst_firm', row.analyst_firm)
        if (row.analyst_name) fd.append('analyst_name', row.analyst_name)

        const res = await fetch('/api/upload', { method: 'POST', body: fd })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        updateRow(i, { status: 'done' })
      } catch (err) {
        updateRow(i, { status: 'error', error: err instanceof Error ? err.message : 'Upload failed' })
      }
    }))
    setUploadStatus('done')
  }

  const hasPending = rows.some(r => r.status === 'pending')
  const hasReady = rows.some(r => r.status === 'ready')
  const allDone = rows.length > 0 && rows.every(r => r.status === 'done' || r.status === 'error')

  return (
    <div className="max-w-4xl mx-auto py-10 px-4">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Batch Upload</h1>
        <p className="text-sm text-gray-500">
          Drop multiple PDFs — quarter, document type, and analyst details are extracted automatically.
        </p>
      </div>

      {/* Company selector */}
      <div className="mb-6 flex gap-3 items-end">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Company <span className="text-red-400">*</span>
          </label>
          <select
            value={company}
            onChange={e => setCompany(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select company…</option>
            {COMPANIES.map(c => <option key={c} value={c}>{c}</option>)}
            <option value="__custom__">Other — type below</option>
          </select>
        </div>
        {company === '__custom__' && (
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Company name</label>
            <input
              type="text"
              value={customCompany}
              onChange={e => setCustomCompany(e.target.value)}
              placeholder="Enter company name"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors mb-6 ${
          dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
        }`}
      >
        <div className="text-3xl mb-2">📂</div>
        <p className="text-sm font-medium text-gray-700">Drop PDFs here or click to browse</p>
        <p className="text-xs text-gray-400 mt-1">Multiple files supported</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          multiple
          className="hidden"
          onChange={e => addFiles(Array.from(e.target.files ?? []))}
        />
      </div>

      {/* File table */}
      {rows.length > 0 && (
        <div className="mb-6">
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600 text-xs">File</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600 text-xs">Quarter</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600 text-xs">Type</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600 text-xs">Analyst firm</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600 text-xs">Analyst name</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600 text-xs">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row, i) => (
                  <tr key={i} className={row.status === 'done' ? 'bg-green-50' : row.status === 'error' ? 'bg-red-50' : 'bg-white'}>
                    <td className="px-4 py-2.5 max-w-[180px]">
                      <span className="truncate block text-xs text-gray-700" title={row.file.name}>
                        {row.file.name}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {row.status === 'ready' || row.status === 'error' ? (
                        <input
                          value={row.quarter}
                          onChange={e => updateRow(i, { quarter: e.target.value })}
                          placeholder="Q4FY26"
                          className="w-20 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                      ) : (
                        <span className="text-xs text-gray-500">{row.quarter || '—'}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {row.status === 'ready' || row.status === 'error' ? (
                        <select
                          value={row.doc_type}
                          onChange={e => updateRow(i, { doc_type: e.target.value })}
                          className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                        >
                          <option value="">Select…</option>
                          {DOC_TYPES.map(t => <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>)}
                        </select>
                      ) : (
                        <span className="text-xs text-gray-500">{DOC_TYPE_LABELS[row.doc_type] || '—'}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {row.status === 'ready' ? (
                        <input
                          value={row.analyst_firm}
                          onChange={e => updateRow(i, { analyst_firm: e.target.value })}
                          placeholder="Firm"
                          className="w-28 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                      ) : (
                        <span className="text-xs text-gray-500">{row.analyst_firm || '—'}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {row.status === 'ready' ? (
                        <input
                          value={row.analyst_name}
                          onChange={e => updateRow(i, { analyst_name: e.target.value })}
                          placeholder="Name"
                          className="w-28 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                      ) : (
                        <span className="text-xs text-gray-500">{row.analyst_name || '—'}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {row.status === 'pending' && <span className="text-xs text-gray-400">Pending</span>}
                      {row.status === 'extracting' && <span className="text-xs text-blue-500 animate-pulse">Extracting…</span>}
                      {row.status === 'ready' && <span className="text-xs text-green-600 font-medium">✓ Ready</span>}
                      {row.status === 'uploading' && <span className="text-xs text-blue-500 animate-pulse">Uploading…</span>}
                      {row.status === 'done' && <span className="text-xs text-green-700 font-medium">✓ Uploaded</span>}
                      {row.status === 'error' && (
                        <span className="text-xs text-red-600" title={row.error}>✕ Error</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {row.status !== 'done' && row.status !== 'uploading' && (
                        <button onClick={() => removeRow(i)} className="text-gray-300 hover:text-red-400 text-xs">✕</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Action buttons */}
      {rows.length > 0 && !allDone && (
        <div className="flex gap-3">
          {hasPending && (
            <button
              onClick={extractAll}
              disabled={!effectiveCompany}
              className="px-5 py-2.5 bg-gray-800 text-white text-sm font-medium rounded-lg hover:bg-gray-900 disabled:opacity-40 transition-colors"
            >
              Extract metadata from {rows.filter(r => r.status === 'pending').length} file{rows.filter(r => r.status === 'pending').length > 1 ? 's' : ''}
            </button>
          )}
          {hasReady && (
            <button
              onClick={uploadAll}
              disabled={!effectiveCompany || uploadStatus === 'uploading'}
              className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              Upload {rows.filter(r => r.status === 'ready').length} file{rows.filter(r => r.status === 'ready').length > 1 ? 's' : ''} →
            </button>
          )}
        </div>
      )}

      {allDone && (
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
          ✓ All files uploaded successfully. They are queued for extraction.
          <button
            onClick={() => { setRows([]); setUploadStatus('idle') }}
            className="ml-3 underline text-green-700 hover:text-green-900"
          >
            Upload more
          </button>
        </div>
      )}
    </div>
  )
}
