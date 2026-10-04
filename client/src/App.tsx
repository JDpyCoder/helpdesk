import { useEffect, useState } from 'react'

type Health = { status: string; timestamp: string }

function App() {
  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/health')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<Health>
      })
      .then(setHealth)
      .catch((err: Error) => setError(err.message))
  }, [])

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow">
        <h1 className="text-2xl font-semibold text-gray-900">Helpdesk</h1>
        <p className="mt-1 text-sm text-gray-500">AI-powered ticket management</p>

        <div className="mt-6 text-sm">
          {error ? (
            <p className="text-red-600">Could not reach the server ({error}).</p>
          ) : health ? (
            <p className="text-green-600">
              Server is healthy — last checked at{' '}
              {new Date(health.timestamp).toLocaleTimeString()}.
            </p>
          ) : (
            <p className="text-gray-400">Checking server health…</p>
          )}
        </div>
      </div>
    </main>
  )
}

export default App
