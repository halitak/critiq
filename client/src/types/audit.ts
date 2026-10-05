// Mirrors the POST /audit response from the server.
// Keep `AuditReport` in sync with REPORT_SCHEMA in server/src/ai/prompt.js.

export type Severity = 'critical' | 'major' | 'minor'

export type IssueCategory =
  | 'accessibility'
  | 'layout'
  | 'typography'
  | 'color'
  | 'responsive'
  | 'ux'

export type Viewport = 'desktop' | 'mobile'

export interface AuditIssue {
  title: string
  severity: Severity
  category: IssueCategory
  viewport: Viewport | 'both'
  description: string
  suggestion: string
}

export interface AuditReport {
  /** 0-100 */
  score: number
  summary: string
  issues: AuditIssue[]
}

/** axe-core violation, reduced by server/src/audit.js */
export interface AccessibilityViolation {
  id: string
  impact: 'minor' | 'moderate' | 'serious' | 'critical' | null
  help: string
  count: number
  /** Up to 3 CSS selectors */
  examples: string[]
}

export interface AuditResponse {
  url: string
  /** Base64-encoded JPEGs */
  screenshots: Record<Viewport, string>
  accessibility: AccessibilityViolation[]
  report: AuditReport
}

export interface AuditErrorResponse {
  error: string
  detail?: string
}
