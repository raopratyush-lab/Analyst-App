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
  const [quarter, setQuarter] = useState('Q4FY26')
  const [peers, setPeers] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/companies')
      .then(r => r.json())
      .then(d => setCompanies(d.companies ?? []))
      .catch(() => {})
  }, [])

  const corpusNames = companies.map(c => c.name)
  const allCompanies = [...new Set([...corpusNames, ...INDIAN_IT_COMPANIES])]

  function togglePeer(name: string) {
    if (name === target) return // can't be both target and peer
    setPeers(prev => prev.includes(name) ? prev.filter(p => p !== name) : [...prev, name])
  }

  // Remove target from peers if re-selected
  function handleTargetChange(val: string) {
    setTarget(val)
    setPeers(prev => prev.filter(p => p !== val))
  }

  async function handleStart(e: React.FormEvent) {
    e.preventDefault()
    if (!target || !quarter) return
    setLoading(true)

    await fetch('/api/companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: target }),
    })
    await Promise.all(peers.map(p =>
      fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: p }),
      })
    ))

    const peerParam = peers.length ? `?peers=${encodeURIComponent(peers.join(','))}` : ''
    router.push(`/session/${encodeURIComponent(target)}/${quarter}${peerParam}`)
  }

  const availablePeers = allCompanies.filter(c => c !== target)

  return (
    <div className="min-h-[calc(100vh-49px)] flex flex-col items-center justify-center px-4 py-12 bg-gray-50">
      <div className="w-full max-w-lg">

        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-2xl font-bold text-gray-900">Analyst Q&A Prediction Agent</h1>
          <p className="text-gray-500 text-sm mt-1">Select a target company, quarter, and peer set to begin.</p>
        </div>

        <form onSubmit={handleStart} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-6">

          {/* Target company */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Target company <span className="text-red-400">*</span>
            </label>
            <select
              value={target}
              onChange={e => handleTargetChange(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="" disabled>Select target company…</option>
              {allCompanies.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Quarter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
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
                      : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400 hover:text-blue-600'
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* Peer set */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-0.5">
              Peer set
              <span className="text-gray-400 font-normal text-xs ml-1">(optional)</span>
            </label>
            <p className="text-xs text-gray-400 mb-2">Select all peer companies to include in prediction corroboration.</p>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="max-h-48 overflow-y-auto divide-y divide-gray-100">
                {availablePeers.map(c => (
                  <label
                    key={c}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={peers.includes(c)}
                      onChange={() => togglePeer(c)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-800">{c}</span>
                    {corpusNames.includes(c) && (
                      <span className="ml-auto text-xs text-green-600 font-medium">In corpus</span>
                    )}
                  </label>
                ))}
              </div>
            </div>
            {peers.length > 0 && (
              <p className="text-xs text-blue-600 mt-1.5 font-medium">{peers.length} peer{peers.length > 1 ? 's' : ''} selected</p>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={!target || !quarter || loading}
            className="w-full py-2.5 px-4 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Starting session…' : 'Start prep session →'}
          </button>

        </form>

        {/* Footer links */}
        <div className="mt-5 flex justify-center gap-6 text-xs text-gray-400">
          <a href="/upload" className="hover:text-gray-600">Upload documents</a>
          <a href="/api-test" className="hover:text-gray-600">Test API</a>
        </div>

      </div>
    </div>
  )
}
