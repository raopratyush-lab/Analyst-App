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

const ZONE_LABELS: Record<number, { name: string; description: string; color: string }> = {
  1: { name: 'Zone 1 — Analyst Predictions', description: 'Named analyst · scored · evidence cited', color: 'blue' },
  2: { name: 'Zone 2 — Unasked Signal Flags', description: 'Analyst flagged in report but didn\'t ask on the call', color: 'amber' },
  3: { name: 'Zone 3 — Unowned Signals', description: 'Model-generated · no analyst attribution', color: 'purple' },
}

interface Document {
  id: string; company_id: string; quarter: string; doc_type: string
  source: string; file_name: string; ingested_at: string
  extraction_status: string; analyst_firm?: string; analyst_name?: string
  companies: { name: string }
}

interface Prediction {
  id: string; zone: number; possibility_score: number; predicted_question: string
  signal_strength: string; analyst_pattern_score: number; season_corroboration_score: number
  peer_transcripts_count: number; insufficient_history_flag: boolean; season_driven_flag: boolean
  evidence_type: string; evidence_source: string; dismissed: boolean
  analysts?: { name: string; firm: string }
  taxonomy_signals?: { name: string }
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
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [loading, setLoading] = useState(true)
  const [predicting, setPredicting] = useState(false)
  const [actionMessage, setActionMessage] = useState('')

  async function fetchAll() {
    setLoading(true)
    const [targetRes, predRes] = await Promise.all([
      fetch(`/api/documents?company=${encodeURIComponent(companyName)}&quarter=${quarter}`),
      fetch(`/api/predictions?company=${encodeURIComponent(companyName)}&quarter=${quarter}`),
    ])
    const [targetData, predData] = await Promise.all([targetRes.json(), predRes.json()])
    setTargetDocs(targetData.documents ?? [])
    setPredictions(predData.predictions ?? [])

    if (peers.length > 0) {
      const peerRes = await fetch(`/api/documents?companies=${encodeURIComponent(peers.join(','))}&quarter=${quarter}`)
      const peerData = await peerRes.json()
      setPeerDocs(peerData.documents ?? [])
    }
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [companyName, quarter, peersParam]) // eslint-disable-line

  async function handlePredict() {
    setPredicting(true)
    setActionMessage('Generating predictions…')

    const res = await fetch('/api/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company: companyName, quarter, peers }),
    })
    const data = await res.json()
    if (data.ok) {
      setActionMessage(`${data.message} — Zone 1: ${data.counts.zone1}, Zone 2: ${data.counts.zone2}, Zone 3: ${data.counts.zone3}`)
    } else {
      setActionMessage(`Prediction failed: ${data.error}`)
    }
    setPredicting(false)
    await fetchAll()
  }

  const extractedCount = [...targetDocs, ...peerDocs].filter(
    d => d.extraction_status === 'complete'
  ).length

  const peerCompaniesWithDocs = [...new Set(peerDocs.map(d => d.companies?.name).filter(Boolean))]
  const peerTranscriptCount = peerDocs.filter(d => d.doc_type === 'transcript' && d.extraction_status === 'complete').length

  const zone1 = predictions.filter(p => p.zone === 1)
  const zone2 = predictions.filter(p => p.zone === 2)
  const zone3 = predictions.filter(p => p.zone === 3)

  return (
    <div className="max-w-3xl mx-auto py-10 px-4">
      {/* Header */}
      <div className="mb-8">
        <Link href="/" className="text-xs text-gray-400 hover:text-gray-600 inline-block mb-3">← New session</Link>
        <h1 className="text-2xl font-bold text-gray-900">{companyName}</h1>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">{quarter}</span>
          {peers.length > 0 && <span className="text-xs text-gray-400">Peers: {peers.join(', ')}</span>}
          {peerTranscriptCount > 0 && (
            <span className="text-xs text-gray-400">· {peerTranscriptCount} peer transcript{peerTranscriptCount > 1 ? 's' : ''} ingested</span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-gray-400 py-10 text-center">Loading…</div>
      ) : (
        <div className="space-y-6">

          {/* Action bar */}
          <div className="bg-white border border-gray-200 rounded-lg px-5 py-4">
            <div className="flex flex-wrap gap-3 items-center">
              <button
                onClick={handlePredict}
                disabled={predicting || extractedCount === 0}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
              >
                {predicting ? 'Generating predictions…' : `Generate predictions${extractedCount > 0 ? ` (${extractedCount} docs ready)` : ''}`}
              </button>
              <Link href="/corpus" className="text-xs text-gray-400 hover:text-blue-600">View corpus</Link>
            </div>
            {actionMessage && (
              <p className="text-xs text-gray-500 mt-2">{actionMessage}</p>
            )}
          </div>

          {/* Predictions */}
          {predictions.length > 0 && (
            <div className="space-y-4">
              {[1, 2, 3].map(zone => {
                const zonePreds = [zone1, zone2, zone3][zone - 1]
                if (zonePreds.length === 0) return null
                const z = ZONE_LABELS[zone]
                return (
                  <div key={zone} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                    <div className={`px-5 py-3 border-b border-gray-100 flex items-center gap-2 ${
                      zone === 1 ? 'bg-blue-50' : zone === 2 ? 'bg-amber-50' : 'bg-purple-50'
                    }`}>
                      <h2 className="text-sm font-semibold text-gray-900">{z.name}</h2>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        zone === 1 ? 'bg-blue-100 text-blue-700' : zone === 2 ? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-700'
                      }`}>{zonePreds.length}</span>
                      <span className="text-xs text-gray-400 ml-1">{z.description}</span>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {zonePreds.map(p => (
                        <PredictionCard key={p.id} prediction={p} />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Corpus */}
          {targetDocs.length > 0 && (
            <CorpusSection
              title={`${companyName} — ${quarter}`}
              badge="Target"
              docs={targetDocs}
              peerDocs={peerDocs}
              peerCompaniesWithDocs={peerCompaniesWithDocs}
              companyName={companyName}
              quarter={quarter}
              peers={peers}
            />
          )}

          {targetDocs.length === 0 && predictions.length === 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
              <div className="text-3xl mb-3">📭</div>
              <h2 className="text-base font-semibold text-gray-900 mb-1">No documents in corpus for {companyName} {quarter}</h2>
              <p className="text-sm text-gray-500 mb-4">
                Ingest transcripts and analyst reports via the{' '}
                <Link href="/upload" className="text-blue-600 hover:underline">Upload</Link>{' '}
                page, then return here to generate predictions.
              </p>
              <Link href="/corpus" className="inline-flex items-center px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50">
                View corpus
              </Link>
            </div>
          )}

        </div>
      )}
    </div>
  )
}

function PredictionCard({ prediction: p }: { prediction: Prediction }) {
  const score = p.possibility_score ?? 0
  const scoreColor = score >= 70 ? 'text-green-700 bg-green-50' : score >= 45 ? 'text-amber-700 bg-amber-50' : 'text-gray-600 bg-gray-50'

  return (
    <div className="px-5 py-4">
      <div className="flex items-start gap-3">
        <span className={`text-sm font-bold px-2 py-0.5 rounded flex-shrink-0 ${scoreColor}`}>{score}%</span>
        <div className="flex-1 min-w-0">
          {p.analysts && (
            <div className="text-xs font-medium text-gray-500 mb-0.5">
              {p.analysts.name} · {p.analysts.firm}
              {p.insufficient_history_flag && <span className="ml-2 text-amber-600">⚠ Insufficient history</span>}
              {p.season_driven_flag && <span className="ml-2 text-blue-600">↑ Sector-driven</span>}
            </div>
          )}
          <p className="text-sm text-gray-800">{p.predicted_question}</p>
          {p.taxonomy_signals && (
            <span className="inline-block mt-1 text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
              {p.taxonomy_signals.name}
            </span>
          )}
          {p.evidence_source && (
            <p className="text-xs text-gray-400 mt-1 truncate">{p.evidence_source}</p>
          )}
          <div className="flex gap-3 mt-1.5 text-xs text-gray-400">
            <span>Signal: <strong className={p.signal_strength === 'high' ? 'text-green-600' : p.signal_strength === 'medium' ? 'text-amber-600' : 'text-gray-500'}>{p.signal_strength}</strong></span>
            <span>Pattern: {p.analyst_pattern_score}%</span>
            <span>Season: {p.season_corroboration_score}%</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function CorpusSection({ title, badge, docs, peerDocs, peerCompaniesWithDocs, companyName, quarter, peers }: {
  title: string; badge: string; docs: Document[]; peerDocs: Document[]
  peerCompaniesWithDocs: string[]; companyName: string; quarter: string; peers: string[]
}) {
  const [expanded, setExpanded] = useState(false)
  const totalDocs = docs.length + peerDocs.length

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full px-5 py-3 border-b border-gray-100 flex items-center justify-between hover:bg-gray-50"
      >
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-900">Corpus</h2>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-600">{totalDocs} docs</span>
          {peers.length > 0 && (
            <span className="text-xs text-gray-400">{peerCompaniesWithDocs.length}/{peers.length} peers with docs</span>
          )}
        </div>
        <span className="text-xs text-gray-400">{expanded ? '▲ Hide' : '▼ Show'}</span>
      </button>
      {expanded && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-5 py-2 text-xs font-medium text-gray-500">Company</th>
                <th className="text-left px-5 py-2 text-xs font-medium text-gray-500">File</th>
                <th className="text-left px-5 py-2 text-xs font-medium text-gray-500">Type</th>
                <th className="text-left px-5 py-2 text-xs font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {[...docs, ...peerDocs].map(doc => (
                <tr key={doc.id} className="hover:bg-gray-50">
                  <td className="px-5 py-2.5 text-xs font-medium text-gray-700">{doc.companies?.name}</td>
                  <td className="px-5 py-2.5 max-w-[200px]">
                    <span className="text-xs text-gray-700 truncate block" title={doc.file_name}>{doc.file_name}</span>
                    {doc.analyst_firm && <span className="text-xs text-gray-400">{doc.analyst_firm}</span>}
                  </td>
                  <td className="px-5 py-2.5 text-xs text-gray-600">{DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type}</td>
                  <td className="px-5 py-2.5"><StatusBadge status={doc.extraction_status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.className}`}>{s.label}</span>
}
