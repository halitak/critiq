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
  /**
   * "ai" = visual review by the model, "axe" = automated accessibility check,
   * "check" = measured in the browser (small text, horizontal overflow); tap targets are "axe"
   */
  source: 'ai' | 'axe' | 'check'
  /** Fix docs: axe rule pages, or WCAG for measured tap targets */
  learnMoreUrl?: string
}

export interface AuditReport {
  /**
   * 0-100, weighted average of `scores`: 60% accessibility, 40% visual.
   * Always lies between the two sub-scores.
   */
  score: number
  /**
   * Each issue removes a share of the remaining 100: critical 15%, major 8%, minor 3%.
   * visual = AI + check issues, accessibility = axe issues.
   */
  scores: { visual: number; accessibility: number }
  /** One sentence from the AI on who the page is for and what they should do there */
  purpose: string
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
  /** Up to 5 CSS selectors */
  examples: string[]
  /** axe fix hints for the first affected element */
  failureSummary: string | null
  /** Full rule set runs on desktop ("both"); target-size runs on mobile */
  viewport: Viewport | 'both'
}

/** Measured in the mobile context by server/src/measure.js */
export interface LayoutChecks {
  smallText: { fontSize: number; count: number; examples: { text: string; selector: string }[] }[]
  /**
   * Tap targets under 24px without enough spacing: axe's target-size violations plus the
   * ones axe couldn't decide and server/src/measure.js measured. Reported as one issue.
   */
  smallTargets: {
    count: number
    flaggedByAxe: number
    measured: number
    /** A class selector most targets share (".votelinks a"), when it covers at least half */
    sharedSelector: string | null
    sharedCount: number
    examples: {
      source: 'axe' | 'measured'
      selector: string
      width: number
      height: number
      spacing: number | null
    }[]
    helpUrl: string | null
  } | null
  overflow: {
    viewportWidth: number
    pageWidth: number
    examples: { selector: string; right: number }[]
  } | null
}

export interface AuditResponse {
  url: string
  /** Base64-encoded JPEGs */
  screenshots: Record<Viewport, string>
  accessibility: AccessibilityViolation[]
  checks: LayoutChecks | null
  report: AuditReport
}

export interface AuditErrorResponse {
  error: string
  detail?: string
}
