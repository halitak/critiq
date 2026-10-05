// Combines the AI's visual review with axe-core results into the final report.
// The response shape is mirrored by client/src/types/audit.ts (AuditReport).

import { MAX_VISUAL_ISSUES } from './ai/prompt.js';

// axe impact -> report severity
const AXE_SEVERITY = {
  critical: 'critical',
  serious: 'major',
  moderate: 'minor',
  minor: 'minor',
};

// Points taken off a 100-point accessibility score, per violated rule
const AXE_PENALTY = { critical: 15, serious: 8, moderate: 3, minor: 1 };

// The overall score leans on the visual review but accessibility still counts
const VISUAL_WEIGHT = 0.6;

const SEVERITY_RANK = { critical: 0, major: 1, minor: 2 };

export function buildReport(visual, accessibility) {
  const accessibilityScore = Math.max(
    0,
    100 - accessibility.reduce((sum, v) => sum + (AXE_PENALTY[v.impact] ?? 1), 0),
  );
  const visualScore = clamp(visual.score);

  const issues = [
    // Schema limits aren't enforced by every provider (e.g. Anthropic tool input)
    ...mergeViewports(visual.issues).slice(0, MAX_VISUAL_ISSUES),
    ...accessibility.map(axeToIssue),
  ].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

  return {
    score: Math.round(VISUAL_WEIGHT * visualScore + (1 - VISUAL_WEIGHT) * accessibilityScore),
    scores: { visual: visualScore, accessibility: accessibilityScore },
    summary: visual.summary,
    issues,
  };
}

function axeToIssue(v) {
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
    learnMoreUrl: v.helpUrl,
    source: 'axe',
  };
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
const stripViewport = (title) => title.replace(VIEWPORT_WORDS, '').replace(/\s+/g, ' ').trim();

// Small models often report the same issue once per viewport ("Desktop Navigation Bar",
// "Mobile Navigation Bar"); fold those into a single "both" issue
function mergeViewports(issues) {
  const byTitle = new Map();
  for (const issue of issues) {
    const key = stripViewport(issue.title).toLowerCase();
    const existing = byTitle.get(key);
    if (!existing) {
      byTitle.set(key, { ...issue, source: 'ai' });
    } else if (existing.viewport !== issue.viewport) {
      existing.viewport = 'both';
      existing.title = stripViewport(existing.title) || existing.title;
    }
  }
  return [...byTitle.values()];
}

const clamp = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
