import Link from 'next/link'

const DAY1_CHECKLIST = [
  { label: 'Next.js app runs locally', done: true },
  { label: 'GitHub repository created and initial code pushed', done: false },
  { label: 'Netlify connected to GitHub — live URL working', done: false },
  { label: 'Supabase project created with full schema (§5.1)', done: false },
  { label: 'All corpus folder taxonomy tables created', done: false },
  { label: 'Active and archived taxonomy tables created with initial signal set', done: false },
  { label: 'PDF upload working — stores in Supabase, record created with metadata', done: false },
  { label: 'Basic Anthropic API call working — response displayed on screen', done: false },
]

export default function Home() {
  const done = DAY1_CHECKLIST.filter(i => i.done).length
  const total = DAY1_CHECKLIST.length

  return (
    <div className="max-w-3xl mx-auto py-10 px-4">
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-gray-900">Analyst Q&A Prediction Agent</h1>
        <p className="text-gray-500 mt-1 text-sm">
          A same-quarter intelligence system that predicts what sell-side analysts will ask —
          before they ask it.
        </p>
      </div>

      {/* Day 1 progress */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">Day 1 — Foundation</h2>
          <span className="text-sm text-gray-500">{done}/{total} complete</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-1.5 mb-4">
          <div
            className="bg-blue-600 h-1.5 rounded-full transition-all"
            style={{ width: `${(done / total) * 100}%` }}
          />
        </div>
        <ul className="space-y-2">
          {DAY1_CHECKLIST.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <span className={`mt-0.5 flex-shrink-0 ${item.done ? 'text-green-500' : 'text-gray-300'}`}>
                {item.done ? '✓' : '○'}
              </span>
              <span className={item.done ? 'text-gray-700' : 'text-gray-400'}>{item.label}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/upload"
          className="block p-5 bg-white border border-gray-200 rounded-lg hover:border-blue-400 hover:shadow-sm transition-all"
        >
          <div className="text-lg mb-1">📄</div>
          <h3 className="font-medium text-gray-900 text-sm">Upload document</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Add a transcript, analyst report, or results document to the corpus.
          </p>
        </Link>

        <Link
          href="/api-test"
          className="block p-5 bg-white border border-gray-200 rounded-lg hover:border-blue-400 hover:shadow-sm transition-all"
        >
          <div className="text-lg mb-1">🧠</div>
          <h3 className="font-medium text-gray-900 text-sm">Test API connection</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Confirm the Anthropic API is connected and responding.
          </p>
        </Link>
      </div>

      {/* Setup reminder */}
      <div className="mt-8 bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
        <p className="font-medium mb-1">⚙️ Before testing upload or API:</p>
        <ol className="list-decimal list-inside space-y-1 text-amber-700">
          <li>Copy <code className="bg-amber-100 px-1 rounded">.env.local.example</code> → <code className="bg-amber-100 px-1 rounded">.env.local</code></li>
          <li>Fill in your Supabase URL, anon key, and Anthropic API key</li>
          <li>Run the schema in Supabase SQL Editor: <code className="bg-amber-100 px-1 rounded">supabase/schema.sql</code></li>
          <li>Create a storage bucket named <code className="bg-amber-100 px-1 rounded">corpus</code> in Supabase</li>
        </ol>
      </div>
    </div>
  )
}
