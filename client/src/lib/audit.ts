import type { AuditIssue, Severity, Viewport } from '@/types/audit'

/**
 * Turns user input into an absolute http(s) URL, or returns an error message.
 * A bare domain like "example.com" is treated as https.
 */
export function normalizeUrl(input: string): { url: string } | { error: string } {
  const trimmed = input.trim()
  if (!trimmed) return { error: 'Enter a URL to audit.' }
  if (/\s/.test(trimmed)) return { error: "That doesn't look like a valid URL." }

  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`

  let parsed: URL
  try {
    parsed = new URL(withScheme)
  } catch {
    return { error: "That doesn't look like a valid URL." }
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { error: 'Only http and https URLs are supported.' }
  }
  if (parsed.hostname !== 'localhost' && !parsed.hostname.includes('.')) {
    return { error: 'Include a full domain, e.g. example.com.' }
  }

  return { url: parsed.href }
}

export const SEVERITIES: Severity[] = ['critical', 'major', 'minor']
export const VIEWPORTS: Viewport[] = ['desktop', 'mobile']

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, major: 1, minor: 2 }

export const bySeverity = (a: AuditIssue, b: AuditIssue) =>
  SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]

/** An issue tagged "both" shows up under either viewport filter. */
export const matchesViewport = (issue: AuditIssue, viewport: Viewport) =>
  issue.viewport === 'both' || issue.viewport === viewport

export type ScoreTone = 'good' | 'fair' | 'poor'

export function scoreTone(score: number): ScoreTone {
  if (score >= 80) return 'good'
  if (score >= 50) return 'fair'
  return 'poor'
}
