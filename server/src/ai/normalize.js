// Turns raw provider output, axe-core results and measured layout checks into report
// issues, and scores them. Everything here is deterministic; the model never sees axe
// or check results and never sets the score.
// The issue shape is mirrored by client/src/types/audit.ts (AuditIssue).

import { MAX_VISUAL_ISSUES } from './prompt.js';
import { MAX_EXAMPLES, MIN_FONT_PX } from '../measure.js';

// axe impact -> report severity
const AXE_SEVERITY = {
  critical: 'critical',
  serious: 'major',
  moderate: 'minor',
  minor: 'minor',
};

// Rules that fit a more specific category than "accessibility"
const AXE_CATEGORY = {
  'color-contrast': 'color',
  'target-size': 'responsive',
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
      category: AXE_CATEGORY[v.id] ?? 'accessibility',
      // The full rule set runs on desktop and covers the DOM shared by both viewports ("both");
      // target-size runs on mobile only
      viewport: v.viewport ?? 'both',
      description: `Found on ${elements}${examples}.`,
      suggestion: cleanFailureSummary(v.failureSummary) ?? `See the axe rule "${v.id}".`,
      // Rendered as a link by the client rather than pasted into the suggestion text
      learnMoreUrl: v.helpUrl,
      source: 'axe',
    };
  });
}

/** Issues from measured layout checks (src/measure.js) */
export function normalizeChecks(checks) {
  if (!checks) return [];
  const issues = [];

  if (checks.smallText.length) {
    const count = checks.smallText.reduce((sum, g) => sum + g.count, 0);
    const sizes = checks.smallText.map((g) => `${g.fontSize}px`).join(', ');
    const examples = checks.smallText
      .flatMap((g) => g.examples.map((e) => `"${e.text}" (\`${e.selector}\`, ${g.fontSize}px)`))
      .slice(0, MAX_EXAMPLES)
      .join(', ');
    issues.push({
      title: `Text smaller than ${MIN_FONT_PX}px on mobile`,
      severity: 'minor',
      category: 'typography',
      viewport: 'mobile',
      description: `${count} text ${count === 1 ? 'element is' : 'elements are'} rendered at ${sizes}, e.g. ${examples}.`,
      suggestion: `Use at least ${MIN_FONT_PX}px (ideally 16px for body text) on small screens: \`@media (max-width: 640px) { body { font-size: 16px; } }\``,
      source: 'check',
    });
  }

  if (checks.overflow) {
    const { viewportWidth, pageWidth, examples } = checks.overflow;
    const culprits = examples.map((e) => `\`${e.selector}\` (right edge at ${e.right}px)`).join(', ');
    issues.push({
      title: 'Page scrolls horizontally on mobile',
      severity: 'major',
      category: 'responsive',
      viewport: 'mobile',
      description: `The page is ${pageWidth}px wide on a ${viewportWidth}px screen.${culprits ? ` Sticking out: ${culprits}.` : ''}`,
      suggestion: 'Constrain wide elements to the viewport: `img, table, pre { max-width: 100%; } pre { overflow-x: auto; }`',
      source: 'check',
    });
  }

  return issues;
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
