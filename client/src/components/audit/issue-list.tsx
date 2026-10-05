import { useMemo, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SEVERITIES, VIEWPORTS, bySeverity, matchesViewport } from '@/lib/audit'
import type { AuditIssue } from '@/types/audit'
import { IssueCard } from './issue-card'
import { IssueFilters, type SeverityFilter, type ViewportFilter } from './issue-filters'

const severityMatches = (issue: AuditIssue, f: SeverityFilter) => f === 'all' || issue.severity === f
const viewportMatches = (issue: AuditIssue, f: ViewportFilter) => f === 'all' || matchesViewport(issue, f)

export function IssueList({ issues }: { issues: AuditIssue[] }) {
  const [severity, setSeverity] = useState<SeverityFilter>('all')
  const [viewport, setViewport] = useState<ViewportFilter>('all')

  const sorted = useMemo(() => [...issues].sort(bySeverity), [issues])

  // Each group's counts reflect the other group's current filter
  const severityCounts = useMemo(() => {
    const pool = sorted.filter((i) => viewportMatches(i, viewport))
    return Object.fromEntries(
      (['all', ...SEVERITIES] as const).map((s) => [s, pool.filter((i) => severityMatches(i, s)).length]),
    ) as Record<SeverityFilter, number>
  }, [sorted, viewport])

  const viewportCounts = useMemo(() => {
    const pool = sorted.filter((i) => severityMatches(i, severity))
    return Object.fromEntries(
      (['all', ...VIEWPORTS] as const).map((v) => [v, pool.filter((i) => viewportMatches(i, v)).length]),
    ) as Record<ViewportFilter, number>
  }, [sorted, severity])

  const visible = sorted.filter((i) => severityMatches(i, severity) && viewportMatches(i, viewport))

  if (issues.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-dashed p-6 text-muted-foreground">
        <CheckCircle2 className="size-5 text-success" />
        No issues found. Nice work.
      </div>
    )
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="issues-heading">
      <div className="flex flex-col gap-3">
        <h2 id="issues-heading" className="text-lg font-semibold">
          Issues <span className="font-normal text-muted-foreground tabular-nums">({issues.length})</span>
        </h2>
        <IssueFilters
          severity={severity}
          viewport={viewport}
          severityCounts={severityCounts}
          viewportCounts={viewportCounts}
          onSeverityChange={setSeverity}
          onViewportChange={setViewport}
        />
      </div>

      {visible.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {visible.map((issue, i) => (
            <li key={`${issue.title}-${i}`}>
              <IssueCard issue={issue} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
          No issues match these filters.
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSeverity('all')
              setViewport('all')
            }}
          >
            Clear filters
          </Button>
        </div>
      )}
    </section>
  )
}
