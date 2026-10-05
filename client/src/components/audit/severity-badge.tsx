import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Severity } from '@/types/audit'

const SEVERITY_STYLES: Record<Severity, string> = {
  critical: 'bg-destructive/10 text-destructive dark:bg-destructive/20',
  major: 'bg-warning/12 text-warning dark:bg-warning/18',
  minor: 'bg-info/10 text-info dark:bg-info/18',
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <Badge className={cn('capitalize', SEVERITY_STYLES[severity])}>{severity}</Badge>
}
