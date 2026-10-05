// Mirrors the POST /audit response from the server.
// Keep `AuditReport` in sync with analyzeAudit in server/src/ai/index.js
// and `AuditIssue` with server/src/ai/normalize.js.

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
  /** May contain `inline code` in backticks */
  suggestion: string
  /** "ai" = visual review by the model, "axe" = automated accessibility check */
  source: 'ai' | 'axe'
  /** Rule docs, axe issues only */
  learnMoreUrl?: string
}

export interface AuditReport {
  /** 100 minus severity penalties of all issues (critical 15, major 8, minor 3), floored at 0 */
  score: number
  /** Same formula applied to just the AI (visual) or axe (accessibility) issues */
  scores: { visual: number; accessibility: number }
  summary: string
  issues: AuditIssue[]
}

/** axe-core violation, reduced by server/src/audit.js */
export interface AccessibilityViolation {
  id: string
  impact: 'minor' | 'moderate' | 'serious' | 'critical' | null
  help: string
  helpUrl: string
  count: number
  /** Up to 3 CSS selectors */
  examples: string[]
  /** axe fix hints for the first affected element */
  failureSummary: string | null
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
