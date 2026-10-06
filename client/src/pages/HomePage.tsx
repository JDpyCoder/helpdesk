import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.tsx'

type Health = { status: string; timestamp: string }

function HomePage() {
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
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Home</CardTitle>
        <CardDescription>AI-powered ticket management</CardDescription>
      </CardHeader>
      <CardContent className="text-sm">
        {error ? (
          <p className="text-destructive">Could not reach the server ({error}).</p>
        ) : health ? (
          <p className="text-green-600">
            Server is healthy — last checked at{' '}
            {new Date(health.timestamp).toLocaleTimeString()}.
          </p>
        ) : (
          <p className="text-muted-foreground">Checking server health…</p>
        )}
      </CardContent>
    </Card>
  )
}

export default HomePage
