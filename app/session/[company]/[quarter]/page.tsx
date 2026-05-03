'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'

const DOC_TYPE_LABELS: Record<string, string> = {
  transcript: 'Transcript',
  analyst_report: 'Analyst Report',
  press_release: 'Press Release',
  investor_presentation: 'Investor Presentation',
  results_announcement: 'Results Announcement',
  other: 'Other',
}

interface Document {
  id: string
  company_id: string
  quarter: string
  doc_type: string
  source: string
  file_name: string
  ingested_at: string
  extraction_status: string
  analyst_firm?: string
  analyst_name?: string
  companies: { name: string }
}

interface Props {
  params: Promise<{ company: string; quarter: string }>
  searchParams: Promise<{ peers?: string }>
}

export default function SessionPage({ params, searchParams }: Props) {
  const { company, quarter } = use(params)
  const { peers: peersParam } = use(searchParams)

  const companyName = decodeURIComponent(company)
  const peers = peersParam ? decodeURIComponent(peersParam).split(',').filter(Boolean) : []

  const [targetDocs, setTargetDocs] = useState<Document[]>([])
  const [peerDocs, setPeerDocs] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchDocs() {
      setLoading(true)
      try {
        // Target company docs
        const targetRes = await fetch(
          `/api/documents?company=${encodeURIComponent(companyName)}&quarter=${quarter}`
        )
        const targetData = await targetRes.json()
        setTargetDocs(targetData.documents ?? [])

        // Peer docs
        if (peers.length > 0) {
          const peerRes = await fetch(
            `/api/documents?companies=${encodeURIComponent(peers.join(','))}&quarter=${quarter}`
          )
          const peerData = await peerRes.json()
          setPeerDocs(peerData.documents ?? [])
        }
      } finally {
        setLoading(false)
      }
    }
    fetchDocs()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyName, quarter, peersParam])

  const targetTranscripts = targetDocs.filter(d => d.doc_type === 'transcript')
  const targetReports = targetDocs.filter(d => d.doc_type === 'analyst_report')
  const targetOther = targetDocs.filter(d => !['transcript', 'analyst_report'].includes(d.doc_type))
  const peerTranscripts = peerDocs.filter(d => d.doc_type === 'transcript')
  const peerReports = peerDocs.filter(d => d.doc_type === 'analyst_report')

  const totalDocs = targetDocs.length + peerDocs.length
  const peerCompaniesWithDocs = [...new Set(peerDocs.map(d => d.companies?.name).filter(Boolean))]

  return (
    <div className="max-w-3xl mx-auto py-10 px-4">

      {/* Header */}
      <div className="mb-8">
        <Link href="/" className="text-xs text-gray-400 hover:text-gray-600 inline-block mb-3">
          ← New session
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">{companyName}</h1>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            {quarter}
          </span>
          {peers.length > 0 && (
            <span className="text-xs text-gray-400">Peers: {peers.join(', ')}</span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-gray-400 py-10 text-center">Loading corpus…</div>
      ) : totalDocs === 0 ? (
        /* ── No documents yet ── */
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
          <div className="text-3xl mb-3">📭</div>
          <h2 className="text-base font-semibold text-gray-900 mb-1">No documents in corpus for {quarter}</h2>
          <p className="text-sm text-gray-500 max-w-sm mx-auto mb-6">
            Upload transcripts and analyst reports for {companyName}
            {peers.length > 0 ? ` and peers (${peers.join(', ')})` : ''} to generate predictions.
          </p>
          <Link
            href="/upload"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
          >
            Upload documents →
          </Link>
        </div>
      ) : (
        /* ── Corpus overview ── */
        <div className="space-y-6">

          {/* Corpus summary bar */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-5 py-4 flex flex-wrap gap-6 text-sm">
            <Stat label="Target docs" value={targetDocs.length} />
            <Stat label="Transcripts" value={targetTranscripts.length + peerTranscripts.length} />
            <Stat label="Analyst reports" value={targetReports.length + peerReports.length} />
            <Stat label="Peer companies" value={peerCompaniesWithDocs.length} />
          </div>

          {/* Target company */}
          <Section
            title={`${companyName} — ${quarter}`}
            badge="Target"
            badgeColor="blue"
            docs={targetDocs}
            empty={`No ${quarter} documents uploaded for ${companyName} yet.`}
            companyName={companyName}
            quarter={quarter}
          />

          {/* Peer companies */}
          {peers.length > 0 && (
            <Section
              title={`Peers — ${quarter}`}
              badge={`${peerCompaniesWithDocs.length} / ${peers.length} with docs`}
              badgeColor="gray"
              docs={peerDocs}
              empty={`No ${quarter} peer documents uploaded yet.`}
              companyName={companyName}
              quarter={quarter}
              showCompany
            />
          )}

          {/* Predictions placeholder */}
          <div className="bg-white border border-gray-200 rounded-lg p-6 text-center">
            <div className="text-2xl mb-2">⚙️</div>
            <h2 className="text-sm font-semibold text-gray-900 mb-1">Extraction & prediction engine</h2>
            <p className="text-xs text-gray-400 max-w-xs mx-auto">
              {totalDocs} document{totalDocs > 1 ? 's' : ''} in corpus.
              Extraction pipeline and prediction engine coming in Day 2.
            </p>
          </div>

          {/* Add more docs */}
          <div className="flex justify-end">
            <Link
              href="/upload"
              className="text-xs text-gray-400 hover:text-blue-600"
            >
              + Upload more documents
            </Link>
          </div>

        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-lg font-bold text-blue-900">{value}</div>
      <div className="text-xs text-blue-700">{label}</div>
    </div>
  )
}

function Section({
  title, badge, badgeColor, docs, empty, companyName, quarter, showCompany = false,
}: {
  title: string
  badge: string
  badgeColor: 'blue' | 'gray'
  docs: Document[]
  empty: string
  companyName: string
  quarter: string
  showCompany?: boolean
}) {
  const badgeClass = badgeColor === 'blue'
    ? 'bg-blue-100 text-blue-700'
    : 'bg-gray-100 text-gray-600'

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badgeClass}`}>{badge}</span>
      </div>
      {docs.length === 0 ? (
        <div className="px-5 py-6 text-center">
          <p className="text-sm text-gray-400">{empty}</p>
          <Link
            href={`/upload`}
            className="text-xs text-blue-500 hover:text-blue-700 mt-1 inline-block"
          >
            Upload for {companyName} {quarter}
          </Link>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {showCompany && <th className="text-left px-5 py-2 text-xs font-medium text-gray-500">Company</th>}
              <th className="text-left px-5 py-2 text-xs font-medium text-gray-500">File</th>
              <th className="text-left px-5 py-2 text-xs font-medium text-gray-500">Type</th>
              <th className="text-left px-5 py-2 text-xs font-medium text-gray-500">Source</th>
              <th className="text-left px-5 py-2 text-xs font-medium text-gray-500">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {docs.map(doc => (
              <tr key={doc.id} className="hover:bg-gray-50">
                {showCompany && (
                  <td className="px-5 py-2.5 text-xs font-medium text-gray-700">{doc.companies?.name}</td>
                )}
                <td className="px-5 py-2.5 max-w-[200px]">
                  <span className="text-xs text-gray-700 truncate block" title={doc.file_name}>
                    {doc.file_name ?? '—'}
                  </span>
                  {doc.analyst_firm && (
                    <span className="text-xs text-gray-400">{doc.analyst_firm}{doc.analyst_name ? ` · ${doc.analyst_name}` : ''}</span>
                  )}
                </td>
                <td className="px-5 py-2.5">
                  <span className="text-xs text-gray-600">{DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type}</span>
                </td>
                <td className="px-5 py-2.5">
                  <span className="text-xs text-gray-400 capitalize">{doc.source?.replace('_', ' ')}</span>
                </td>
                <td className="px-5 py-2.5">
                  <StatusBadge status={doc.extraction_status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    pending:    { label: 'Pending',    className: 'bg-yellow-50 text-yellow-700' },
    processing: { label: 'Processing', className: 'bg-blue-50 text-blue-700 animate-pulse' },
    complete:   { label: 'Extracted',  className: 'bg-green-50 text-green-700' },
    failed:     { label: 'Failed',     className: 'bg-red-50 text-red-700' },
  }
  const s = map[status] ?? { label: status, className: 'bg-gray-50 text-gray-500' }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.className}`}>{s.label}</span>
  )
}
