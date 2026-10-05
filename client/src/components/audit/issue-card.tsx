import { Bot, ExternalLink, Lightbulb, Monitor, MonitorSmartphone, ShieldCheck, Smartphone } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { AuditIssue } from '@/types/audit'
import { RichText } from './rich-text'
import { SeverityBadge } from './severity-badge'

const VIEWPORT_META = {
  desktop: { label: 'Desktop', Icon: Monitor },
  mobile: { label: 'Mobile', Icon: Smartphone },
  both: { label: 'Desktop & mobile', Icon: MonitorSmartphone },
} as const

const SOURCE_META = {
  ai: { label: 'AI review', Icon: Bot },
  axe: { label: 'Automated check', Icon: ShieldCheck },
} as const

export function IssueCard({ issue }: { issue: AuditIssue }) {
  const viewport = VIEWPORT_META[issue.viewport]
  const source = SOURCE_META[issue.source]

  return (
    <Card size="sm">
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <SeverityBadge severity={issue.severity} />
          <Badge variant="outline" className="capitalize">
            {issue.category}
          </Badge>
          <Badge variant="outline" className="text-muted-foreground">
            <viewport.Icon data-icon="inline-start" />
            {viewport.label}
          </Badge>
          <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            <source.Icon className="size-3.5" aria-hidden="true" />
            {source.label}
          </span>
        </div>
        <CardTitle className="text-base">{issue.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="leading-relaxed break-words text-muted-foreground">
          <RichText text={issue.description} />
        </p>
        <div className="flex gap-2 rounded-lg bg-muted/60 p-3">
          <Lightbulb className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <div className="flex min-w-0 flex-col gap-1.5">
            <p className="leading-relaxed break-words">
              <span className="sr-only">Suggestion: </span>
              <RichText text={issue.suggestion} />
            </p>
            {issue.learnMoreUrl && (
              <a
                href={issue.learnMoreUrl}
                target="_blank"
                rel="noreferrer"
                className="flex w-fit items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                How to fix this
                <ExternalLink className="size-3" />
              </a>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
