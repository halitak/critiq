import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { scoreTone, type ScoreTone } from '@/lib/audit'
import { cn } from '@/lib/utils'
import type { AuditReport } from '@/types/audit'

const TONES: Record<ScoreTone, { label: string; text: string; stroke: string }> = {
  good: { label: 'Good', text: 'text-success', stroke: 'stroke-success' },
  fair: { label: 'Needs work', text: 'text-warning', stroke: 'stroke-warning' },
  poor: { label: 'Poor', text: 'text-destructive', stroke: 'stroke-destructive' },
}

const RADIUS = 52
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export function ScoreCard({ report }: { report: AuditReport }) {
  const score = Math.max(0, Math.min(100, Math.round(report.score)))
  const tone = TONES[scoreTone(score)]

  return (
    <div className="grid gap-4 md:grid-cols-[220px_1fr]">
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-2">
          <div className="relative size-32">
            <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden="true">
              <circle cx="60" cy="60" r={RADIUS} fill="none" strokeWidth="10" className="stroke-muted" />
              <circle
                cx="60"
                cy="60"
                r={RADIUS}
                fill="none"
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={CIRCUMFERENCE * (1 - score / 100)}
                className={cn('transition-[stroke-dashoffset] duration-700', tone.stroke)}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={cn('text-4xl font-semibold tabular-nums', tone.text)}>{score}</span>
              <span className="text-xs text-muted-foreground">/ 100</span>
            </div>
          </div>
          <span className={cn('text-sm font-medium', tone.text)}>{tone.label}</span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="leading-relaxed text-pretty text-muted-foreground">{report.summary}</p>
        </CardContent>
      </Card>
    </div>
  )
}
