// Turns raw provider output and axe-core results into report issues, and scores them.
// Everything here is deterministic; the model never sees axe results or sets the score.
// The issue shape is mirrored by client/src/types/audit.ts (AuditIssue).

import { MAX_VISUAL_ISSUES } from './prompt.js';

// axe impact -> report severity
const AXE_SEVERITY = {
  critical: 'critical',
  serious: 'major',
  moderate: 'minor',
  minor: 'minor',
};

// Points taken off 100 per issue
const SEVERITY_PENALTY = { critical: 15, major: 8, minor: 3 };

const SEVERITY_RANK = { critical: 0, major: 1, minor: 2 };

export const bySeverity = (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];

/** 100 minus the severity penalties of the given issues, floored at 0 */
export function scoreIssues(issues) {
  const penalty = issues.reduce((sum, i) => sum + SEVERITY_PENALTY[i.severity], 0);
  return Math.max(0, 100 - penalty);
}

export function normalizeAxe(accessibility) {
  return accessibility.map((v) => {
    const elements = v.count === 1 ? '1 element' : `${v.count} elements`;
    const examples = v.examples.length ? ` e.g. ${v.examples.map((e) => `\`${e}\``).join(', ')}` : '';

    return {
      title: v.help,
      severity: AXE_SEVERITY[v.impact] ?? 'minor',
      category: v.id === 'color-contrast' ? 'color' : 'accessibility',
      // axe checks the DOM, which is the same on both viewports
      viewport: 'both',
      description: `Found on ${elements}${examples}.`,
      suggestion: cleanFailureSummary(v.failureSummary) ?? `See the axe rule "${v.id}".`,
      // Rendered as a link by the client rather than pasted into the suggestion text
      learnMoreUrl: v.helpUrl,
      source: 'axe',
    };
  });
}

export function normalizeVisual(issues) {
  return (
    mergeViewports(issues)
      // Schema limits aren't enforced by every provider (e.g. Anthropic tool input)
      .slice(0, MAX_VISUAL_ISSUES)
      .map((issue) => ({ ...issue, source: 'ai' }))
  );
}

// axe lists every check that failed, e.g.
// "Fix any of the following:\n  Element has insufficient color contrast of 3.54 (...)\n  ..."
// The first check is the most specific one; the rest are alternatives (aria-label, title, ...).
function cleanFailureSummary(summary) {
  if (!summary) return null;
  const firstCheck = summary
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !/^Fix (any|all) of the following:?$/i.test(l));
  return firstCheck ?? null;
}

const VIEWPORT_WORDS = /\b(desktop|mobile)\b/gi;
const stripViewport = (title) =>
  title
    .replace(VIEWPORT_WORDS, '')
    .replace(/\s+/g, ' ')
    // "Desktop: Cluttered layout" leaves a dangling ": "
    .replace(/^[\s:–-]+|[\s:–-]+$/g, '');

/** Identity of an issue across viewports and runs: title without viewport words, lowercased */
export const titleKey = (title) => stripViewport(title).toLowerCase();

// Small models often report the same issue once per viewport ("Desktop Navigation Bar",
// "Mobile Navigation Bar"); fold those into a single "both" issue
function mergeViewports(issues) {
  const byTitle = new Map();
  for (const issue of issues) {
    const key = titleKey(issue.title);
    const existing = byTitle.get(key);
    if (!existing) {
      byTitle.set(key, { ...issue });
    } else if (existing.viewport !== issue.viewport) {
      existing.viewport = 'both';
      existing.title = stripViewport(existing.title) || existing.title;
    }
  }
  return [...byTitle.values()];
}
