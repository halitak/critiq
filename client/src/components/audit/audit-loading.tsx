import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

// Roughly follows what the server is doing; it doesn't report real progress
const STEPS = [
  'Opening the page in a real browser…',
  'Capturing the desktop view…',
  'Capturing the mobile view…',
  'Running accessibility checks…',
  'Reviewing the design with AI…',
]
const STEP_MS = 2500

export function AuditLoading({ url }: { url: string }) {
  const [step, setStep] = useState(0)

  useEffect(() => {
    // Stay on the last step instead of looping back
    const id = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), STEP_MS)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 className="size-4 animate-spin" />
        <span>{STEPS[step]}</span>
        <span className="truncate opacity-70">{url}</span>
      </div>

      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-4">
            <Skeleton className="size-28 rounded-full" />
            <Skeleton className="h-4 w-20" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-3/5" />
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Card key={i}>
            <CardContent className="flex flex-col gap-3">
              <div className="flex gap-2">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
              <Skeleton className="h-5 w-2/5" />
              <Skeleton className="h-4 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
