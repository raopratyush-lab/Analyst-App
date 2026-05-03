import Link from 'next/link'

interface Props {
  params: Promise<{ company: string; quarter: string }>
  searchParams: Promise<{ peers?: string }>
}

export default async function SessionPage({ params, searchParams }: Props) {
  const { company, quarter } = await params
  const { peers: peersParam } = await searchParams
  const companyName = decodeURIComponent(company)
  const peers = peersParam ? decodeURIComponent(peersParam).split(',') : []

  return (
    <div className="max-w-3xl mx-auto py-10 px-4">
      {/* Session header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
          <Link href="/" className="hover:text-gray-600">← New session</Link>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">{companyName}</h1>
        <div className="flex items-center gap-3 mt-1">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            {quarter}
          </span>
          {peers.length > 0 && (
            <span className="text-xs text-gray-400">
              Peers: {peers.join(', ')}
            </span>
          )}
        </div>
      </div>

      {/* Coming in Day 2 */}
      <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
        <div className="text-3xl mb-3">⚙️</div>
        <h2 className="text-base font-semibold text-gray-900 mb-1">
          Extraction & prediction engine
        </h2>
        <p className="text-sm text-gray-500 max-w-sm mx-auto">
          This is where predictions will appear. Building the ingestion pipeline and
          prediction engine in Day 2.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/upload"
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
          >
            Upload documents
          </Link>
          <Link
            href="/"
            className="px-4 py-2 border border-gray-300 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50"
          >
            Change session
          </Link>
        </div>
      </div>
    </div>
  )
}
