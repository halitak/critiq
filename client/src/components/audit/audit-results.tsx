import { ExternalLink } from 'lucide-react'
import type { AuditResponse } from '@/types/audit'
import { IssueList } from './issue-list'
import { ScoreCard } from './score-card'
import { ScreenshotTabs } from './screenshot-tabs'

export function AuditResults({ data }: { data: AuditResponse }) {
  return (
    <div className="flex flex-col gap-8">
      <a
        href={data.url}
        target="_blank"
        rel="noreferrer"
        className="flex w-fit max-w-full items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <span className="truncate">{data.url}</span>
        <ExternalLink className="size-3.5 shrink-0" />
      </a>
      <ScoreCard report={data.report} />
      <IssueList issues={data.report.issues} />
      <ScreenshotTabs url={data.url} screenshots={data.screenshots} />
    </div>
  )
}
