'use client'

import { useState } from 'react'

const DOC_TYPES = [
  { value: 'transcript', label: 'Earnings Call Transcript' },
  { value: 'analyst_report', label: 'Analyst Report' },
  { value: 'press_release', label: 'Press Release' },
  { value: 'investor_presentation', label: 'Investor Presentation' },
  { value: 'results_announcement', label: 'Results Announcement' },
  { value: 'other', label: 'Other' },
]

const COMPANIES = [
  'TCS', 'Infosys', 'Wipro', 'HCL Technologies', 'Tech Mahindra',
  'LTIMindtree', 'Mphasis', 'Coforge', 'Persistent Systems', 'KPIT Technologies',
]

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null)
  const [companyName, setCompanyName] = useState('')
  const [customCompany, setCustomCompany] = useState('')
  const [docType, setDocType] = useState('transcript')
  const [quarter, setQuarter] = useState('Q4FY26')
  const [analystFirm, setAnalystFirm] = useState('')
  const [analystName, setAnalystName] = useState('')
  const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const effectiveCompany = companyName === '__custom__' ? customCompany : companyName

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file || !effectiveCompany || !quarter) {
      setMessage('Please fill in all required fields and select a file.')
      setStatus('error')
      return
    }

    setStatus('uploading')
    setMessage('')

    const fd = new FormData()
    fd.append('file', file)
    fd.append('company_name', effectiveCompany)
    fd.append('doc_type', docType)
    fd.append('quarter', quarter)
    if (analystFirm) fd.append('analyst_firm', analystFirm)
    if (analystName) fd.append('analyst_name', analystName)

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const json = await res.json()
      if (res.ok && json.success) {
        setStatus('success')
        setMessage(json.message)
        setFile(null)
        // Reset file input
        const input = document.getElementById('file-input') as HTMLInputElement
        if (input) input.value = ''
      } else {
        setStatus('error')
        setMessage(json.error || 'Upload failed.')
      }
    } catch {
      setStatus('error')
      setMessage('Network error — check your connection and try again.')
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-10 px-4">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Upload Document</h1>
      <p className="text-sm text-gray-500 mb-8">
        Upload a transcript, analyst report, or other document into the corpus.
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Company */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Company <span className="text-red-500">*</span>
          </label>
          <select
            value={companyName}
            onChange={e => setCompanyName(e.target.value)}
            required
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select a company…</option>
            {COMPANIES.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
            <option value="__custom__">Other (type below)</option>
          </select>
          {companyName === '__custom__' && (
            <input
              type="text"
              placeholder="Enter company name"
              value={customCompany}
              onChange={e => setCustomCompany(e.target.value)}
              required
              className="mt-2 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}
        </div>

        {/* Quarter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Quarter <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            placeholder="e.g. Q4FY26"
            value={quarter}
            onChange={e => setQuarter(e.target.value)}
            required
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-400 mt-1">Format: Q1FY25, Q2FY25, Q3FY25, Q4FY25…</p>
        </div>

        {/* Document type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Document type <span className="text-red-500">*</span>
          </label>
          <select
            value={docType}
            onChange={e => setDocType(e.target.value)}
            required
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {DOC_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* Analyst fields — shown for analyst_report */}
        {docType === 'analyst_report' && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Analyst firm</label>
              <input
                type="text"
                placeholder="e.g. Kotak Securities"
                value={analystFirm}
                onChange={e => setAnalystFirm(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Analyst name</label>
              <input
                type="text"
                placeholder="e.g. Sanjiv Bhasin"
                value={analystName}
                onChange={e => setAnalystName(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        )}

        {/* File */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            PDF file <span className="text-red-500">*</span>
          </label>
          <input
            id="file-input"
            type="file"
            accept=".pdf"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
            required
            className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
        </div>

        {/* Status message */}
        {message && (
          <div className={`rounded-md px-4 py-3 text-sm ${
            status === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {message}
          </div>
        )}

        <button
          type="submit"
          disabled={status === 'uploading'}
          className="w-full py-2.5 px-4 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {status === 'uploading' ? 'Uploading…' : 'Upload document'}
        </button>
      </form>
    </div>
  )
}
