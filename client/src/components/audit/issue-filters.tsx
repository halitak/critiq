import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { SEVERITIES, VIEWPORTS } from '@/lib/audit'
import type { Severity, Viewport } from '@/types/audit'

export type SeverityFilter = Severity | 'all'
export type ViewportFilter = Viewport | 'all'

interface FilterGroupProps<T extends string> {
  label: string
  value: T
  options: { value: T; label: string; count: number }[]
  onChange: (value: T) => void
}

function FilterGroup<T extends string>({ label, value, options, onChange }: FilterGroupProps<T>) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <ToggleGroup
        aria-label={`Filter by ${label.toLowerCase()}`}
        variant="outline"
        size="sm"
        spacing={0}
        value={[value]}
        // Single-select: ignore attempts to unpress the active item
        onValueChange={(next) => next[0] && onChange(next[0] as T)}
      >
        {options.map((o) => (
          <ToggleGroupItem
            key={o.value}
            value={o.value}
            // The default pressed style matches hover, which is too subtle for a filter
            className="capitalize aria-pressed:bg-primary aria-pressed:text-primary-foreground"
          >
            {o.label}
            <span className="tabular-nums opacity-60">{o.count}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}

interface IssueFiltersProps {
  severity: SeverityFilter
  viewport: ViewportFilter
  severityCounts: Record<SeverityFilter, number>
  viewportCounts: Record<ViewportFilter, number>
  onSeverityChange: (value: SeverityFilter) => void
  onViewportChange: (value: ViewportFilter) => void
}

export function IssueFilters(props: IssueFiltersProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-x-6">
      <FilterGroup<SeverityFilter>
        label="Severity"
        value={props.severity}
        onChange={props.onSeverityChange}
        options={(['all', ...SEVERITIES] as const).map((s) => ({
          value: s,
          label: s,
          count: props.severityCounts[s],
        }))}
      />
      <FilterGroup<ViewportFilter>
        label="Viewport"
        value={props.viewport}
        onChange={props.onViewportChange}
        options={(['all', ...VIEWPORTS] as const).map((v) => ({
          value: v,
          label: v,
          count: props.viewportCounts[v],
        }))}
      />
    </div>
  )
}
