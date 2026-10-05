import { Lightbulb, Monitor, MonitorSmartphone, Smartphone } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { AuditIssue } from '@/types/audit'
import { SeverityBadge } from './severity-badge'

const VIEWPORT_META = {
  desktop: { label: 'Desktop', Icon: Monitor },
  mobile: { label: 'Mobile', Icon: Smartphone },
  both: { label: 'Desktop & mobile', Icon: MonitorSmartphone },
} as const

export function IssueCard({ issue }: { issue: AuditIssue }) {
  const { label, Icon } = VIEWPORT_META[issue.viewport]

  return (
    <Card size="sm">
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <SeverityBadge severity={issue.severity} />
          <Badge variant="outline" className="capitalize">
            {issue.category}
          </Badge>
          <Badge variant="outline" className="text-muted-foreground">
            <Icon data-icon="inline-start" />
            {label}
          </Badge>
        </div>
        <CardTitle className="text-base">{issue.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="leading-relaxed text-muted-foreground">{issue.description}</p>
        <div className="flex gap-2 rounded-lg bg-muted/60 p-3">
          <Lightbulb className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <p className="leading-relaxed">
            <span className="sr-only">Suggestion: </span>
            {issue.suggestion}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
