'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const INDIAN_IT_COMPANIES = [
  'TCS', 'Infosys', 'Wipro', 'HCL Technologies', 'Tech Mahindra',
  'LTIMindtree', 'Mphasis', 'Coforge', 'Persistent Systems', 'KPIT Technologies',
]

const RECENT_QUARTERS = ['Q4FY26', 'Q3FY26', 'Q2FY26', 'Q1FY26', 'Q4FY25', 'Q3FY25']

interface Company { id: string; name: string; ticker?: string }

export default function Home() {
  const router = useRouter()
  const [companies, setCompanies] = useState<Company[]>([])
  const [target, setTarget] = useState('')
  const [customTarget, setCustomTarget] = useState('')
  const [quarter, setQuarter] = useState('Q4FY26')
  const [peers, setPeers] = useState<string[]>([])
  const [customPeer, setCustomPeer] = useState('')
  const [loading, setLoading] = useState(false)

  // Fetch companies already in corpus
  useEffect(() => {
    fetch('/api/companies')
      .then(r => r.json())
      .then(d => setCompanies(d.companies ?? []))
      .catch(() => {})
  }, [])

  // Combine corpus companies + default list, deduplicated
  const corpusNames = companies.map(c => c.name)
  const allCompanies = [
    ...corpusNames,
    ...INDIAN_IT_COMPANIES.filter(c => !corpusNames.includes(c)),
  ]

  const effectiveTarget = target === '__custom__' ? customTarget : target

  function togglePeer(name: string) {
    setPeers(prev =>
      prev.includes(name) ? prev.filter(p => p !== name) : [...prev, name]
    )
  }

  function addCustomPeer() {
    const trimmed = customPeer.trim()
    if (trimmed && !peers.includes(trimmed)) {
      setPeers(prev => [...prev, trimmed])
    }
    setCustomPeer('')
  }

  async function handleStart(e: React.FormEvent) {
    e.preventDefault()
    if (!effectiveTarget || !quarter) return
    setLoading(true)

    // Upsert target company into corpus if new
    await fetch('/api/companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: effectiveTarget }),
    })

    // Upsert any new peer companies
    await Promise.all(
      peers.map(p =>
        fetch('/api/companies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: p }),
        })
      )
    )

    const peerParam = peers.length ? `?peers=${encodeURIComponent(peers.join(','))}` : ''
    router.push(`/session/${encodeURIComponent(effectiveTarget)}/${quarter}${peerParam}`)
  }

  const peersAvailable = allCompanies.filter(c => c !== effectiveTarget)

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl">

        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-2xl font-bold text-gray-900">Analyst Q&A Prediction Agent</h1>
          <p className="text-gray-400 text-sm mt-1">
            Select a target, quarter, and peer set to begin.
          </p>
        </div>

        <form onSubmit={handleStart} className="space-y-6">

          {/* Target company */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Target company <span className="text-red-400">*</span>
            </label>
            <select
              value={target}
              onChange={e => setTarget(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select target company…</option>
              {allCompanies.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
              <option value="__custom__">Other — type below</option>
            </select>
            {target === '__custom__' && (
              <input
                type="text"
                placeholder="Company name"
                value={customTarget}
                onChange={e => setCustomTarget(e.target.value)}
                required
                className="mt-2 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}
          </div>

          {/* Quarter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Quarter <span className="text-red-400">*</span>
            </label>
            <div className="flex gap-2 flex-wrap">
              {RECENT_QUARTERS.map(q => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setQuarter(q)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    quarter === q
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* Peer set */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Peer set
              <span className="text-gray-400 font-normal ml-1">(optional — select all that apply)</span>
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {peersAvailable.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => togglePeer(c)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    peers.includes(c)
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                  }`}
                >
                  {peers.includes(c) ? '✓ ' : ''}{c}
                </button>
              ))}
            </div>
            {/* Add custom peer */}
            <div className="flex gap-2 mt-2">
              <input
                type="text"
                placeholder="Add another company…"
                value={customPeer}
                onChange={e => setCustomPeer(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomPeer() } }}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={addCustomPeer}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600"
              >
                Add
              </button>
            </div>
            {peers.length > 0 && (
              <p className="text-xs text-gray-400 mt-2">
                {peers.length} peer{peers.length > 1 ? 's' : ''} selected: {peers.join(', ')}
              </p>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={!effectiveTarget || !quarter || loading}
            className="w-full py-3 px-4 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Starting session…' : 'Start prep session →'}
          </button>

        </form>

        {/* Footer links */}
        <div className="mt-8 flex justify-center gap-6 text-xs text-gray-400">
          <a href="/upload" className="hover:text-gray-600">Upload documents</a>
          <a href="/api-test" className="hover:text-gray-600">Test API</a>
        </div>

      </div>
    </div>
  )
}
