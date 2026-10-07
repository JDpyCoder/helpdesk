import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { errorMessage } from '@/lib/query-client.ts'

type Health = { status: string; timestamp: string }

function HomePage() {
  const { data: health, error } = useQuery({
    queryKey: ['health'],
    queryFn: () => axios.get<Health>('/api/health').then((res) => res.data),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Home</CardTitle>
        <CardDescription>AI-powered ticket management</CardDescription>
      </CardHeader>
      <CardContent className="text-sm">
        {error ? (
          <p className="text-destructive">Could not reach the server ({errorMessage(error)}).</p>
        ) : health ? (
          <p className="text-green-600">
            Server is healthy — last checked at{' '}
            {new Date(health.timestamp).toLocaleTimeString()}.
          </p>
        ) : (
          <Skeleton role="status" aria-label="Checking server health" className="h-5 w-72" />
        )}
      </CardContent>
    </Card>
  )
}

export default HomePage
