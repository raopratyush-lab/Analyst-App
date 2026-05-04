'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const DOC_TYPE_LABELS: Record<string, string> = {
  transcript: 'Transcript',
  analyst_report: 'Analyst Report',
  press_release: 'Press Release',
  investor_presentation: 'Investor Presentation',
  results_announcement: 'Results Announcement',
  other: 'Other',
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending:    { label: 'Pending',    className: 'bg-yellow-50 text-yellow-700 border border-yellow-200' },
  processing: { label: 'Processing', className: 'bg-blue-50 text-blue-700 border border-blue-200 animate-pulse' },
  complete:   { label: 'Extracted',  className: 'bg-green-50 text-green-700 border border-green-200' },
  failed:     { label: 'Failed',     className: 'bg-red-50 text-red-700 border border-red-200' },
}

interface Doc {
  id: string
  file_name: string
  doc_type: string
  quarter: string
  source: string
  extraction_status: string
  ingested_at: string
  analyst_firm?: string
  analyst_name?: string
  companies: { name: string }
}

export default function CorpusPage() {
  const [docs, setDocs] = useState<Doc[]>([])
  const [loading, setLoading] = useState(true)
  const [filterCompany, setFilterCompany] = useState('All')
  const [filterQuarter, setFilterQuarter] = useState('All')
  const [filterStatus, setFilterStatus] = useState('All')
  const [retrying, setRetrying] = useState<Set<string>>(new Set())

  async function fetchDocs() {
    const res = await fetch('/api/corpus')
    const data = await res.json()
    setDocs(data.documents ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchDocs() }, [])

  async function retryExtraction(docId: string) {
    setRetrying(prev => new Set(prev).add(docId))
    await fetch('/api/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document_ids: [docId] }),
    })
    await fetchDocs()
    setRetrying(prev => { const s = new Set(prev); s.delete(docId); return s })
  }

  // Filter options
  const companies = ['All', ...Array.from(new Set(docs.map(d => d.companies?.name).filter(Boolean))).sort()]
  const quarters  = ['All', ...Array.from(new Set(docs.map(d => d.quarter).filter(Boolean))).sort().reverse()]
  const statuses  = ['All', 'pending', 'complete', 'failed']

  const filtered = docs.filter(d => {
    if (filterCompany !== 'All' && d.companies?.name !== filterCompany) return false
    if (filterQuarter !== 'All' && d.quarter !== filterQuarter) return false
    if (filterStatus  !== 'All' && d.extraction_status !== filterStatus) return false
    return true
  })

  // Group by company
  const grouped: Record<string, Doc[]> = {}
  for (const doc of filtered) {
    const co = doc.companies?.name ?? 'Unknown'
    if (!grouped[co]) grouped[co] = []
    grouped[co].push(doc)
  }

  const pendingCount = docs.filter(d => d.extraction_status === 'pending' &&
    ['transcript', 'analyst_report'].includes(d.doc_type)).length

  return (
    <div className="max-w-5xl mx-auto py-10 px-4">

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Corpus</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {docs.length} document{docs.length !== 1 ? 's' : ''} across {companies.length - 1} companies
          </p>
        </div>
        <Link
          href="/upload"
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          + Upload documents
        </Link>
      </div>

      {/* Pending extraction banner */}
      {pendingCount > 0 && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center justify-between text-sm">
          <span className="text-amber-800">
            <strong>{pendingCount}</strong> document{pendingCount > 1 ? 's' : ''} pending extraction
          </span>
          <button
            onClick={async () => {
              const pending = docs.filter(d =>
                d.extraction_status === 'pending' &&
                ['transcript', 'analyst_report'].includes(d.doc_type)
              )
              await fetch('/api/extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ document_ids: pending.map(d => d.id) }),
              })
              fetchDocs()
            }}
            className="text-amber-700 font-medium hover:text-amber-900 underline text-xs"
          >
            Extract all pending
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <FilterSelect label="Company" value={filterCompany} options={companies} onChange={setFilterCompany} />
        <FilterSelect label="Quarter" value={filterQuarter} options={quarters}  onChange={setFilterQuarter} />
        <FilterSelect label="Status"  value={filterStatus}  options={statuses}  onChange={setFilterStatus} />
        {(filterCompany !== 'All' || filterQuarter !== 'All' || filterStatus !== 'All') && (
          <button
            onClick={() => { setFilterCompany('All'); setFilterQuarter('All'); setFilterStatus('All') }}
            className="text-xs text-gray-400 hover:text-gray-600 px-2"
          >
            Clear filters
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-sm text-gray-400 py-10 text-center">Loading corpus…</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-gray-400 py-16 text-center">
          <p className="text-3xl mb-3">📭</p>
          <p>{docs.length === 0 ? 'No documents yet.' : 'No documents match your filters.'}</p>
          {docs.length === 0 && (
            <Link href="/upload" className="mt-3 inline-block text-blue-500 hover:text-blue-700">Upload documents →</Link>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([company, companyDocs]) => (
            <div key={company} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">{company}</h2>
                <span className="text-xs text-gray-400">
                  {companyDocs.length} doc{companyDocs.length !== 1 ? 's' : ''} ·{' '}
                  {[...new Set(companyDocs.map(d => d.quarter))].sort().reverse().join(', ')}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs font-medium text-gray-500">
                      <th className="text-left px-5 py-2">File</th>
                      <th className="text-left px-5 py-2">Quarter</th>
                      <th className="text-left px-5 py-2">Type</th>
                      <th className="text-left px-5 py-2">Ingested</th>
                      <th className="text-left px-5 py-2">Status</th>
                      <th className="px-5 py-2 w-16" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {companyDocs
                      .sort((a, b) => b.quarter.localeCompare(a.quarter))
                      .map(doc => (
                        <tr key={doc.id} className="hover:bg-gray-50">
                          <td className="px-5 py-3 max-w-xs">
                            <span className="text-xs font-medium text-gray-800 truncate block" title={doc.file_name}>
                              {doc.file_name ?? '—'}
                            </span>
                            {doc.analyst_firm && (
                              <span className="text-xs text-gray-400">
                                {doc.analyst_firm}{doc.analyst_name ? ` · ${doc.analyst_name}` : ''}
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3">
                            <span className="text-xs font-medium text-gray-700">{doc.quarter}</span>
                          </td>
                          <td className="px-5 py-3">
                            <span className="text-xs text-gray-600">{DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type}</span>
                          </td>
                          <td className="px-5 py-3">
                            <span className="text-xs text-gray-400">
                              {new Date(doc.ingested_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <StatusBadge status={doc.extraction_status} />
                          </td>
                          <td className="px-5 py-3 text-right">
                            {(doc.extraction_status === 'pending' || doc.extraction_status === 'failed') &&
                              ['transcript', 'analyst_report'].includes(doc.doc_type) && (
                              <button
                                onClick={() => retryExtraction(doc.id)}
                                disabled={retrying.has(doc.id)}
                                className="text-xs text-blue-500 hover:text-blue-700 disabled:opacity-40"
                              >
                                {retrying.has(doc.id) ? 'Running…' : 'Extract'}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FilterSelect({ label, value, options, onChange }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-gray-500">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
      >
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_CONFIG[status] ?? { label: status, className: 'bg-gray-50 text-gray-500 border border-gray-200' }
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.className}`}>{s.label}</span>
}
