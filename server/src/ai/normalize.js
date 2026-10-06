// Turns raw provider output, axe-core results and measured layout checks into report
// issues, and scores them. Everything here is deterministic; the model never sees axe
// or check results and never sets the score.
// The issue shape is mirrored by client/src/types/audit.ts (AuditIssue).

import { MAX_VISUAL_ISSUES } from './prompt.js';
import { MAX_EXAMPLES, MIN_FONT_PX, MIN_TARGET_PX } from '../measure.js';

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
};

// Share of the remaining score each issue takes away
const SEVERITY_PENALTY = { critical: 0.15, major: 0.08, minor: 0.03 };

const SEVERITY_RANK = { critical: 0, major: 1, minor: 2 };

export const bySeverity = (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];

/**
 * Each issue removes a share of what's left (critical 15%, major 8%, minor 3%).
 * One issue costs the same as flat points would (critical -> 85), but many issues
 * no longer bottom out at 0: Hacker News used to score 0 with both models, so a
 * bad page and a terrible page looked the same.
 */
export function scoreIssues(issues) {
  const remaining = issues.reduce((score, i) => score * (1 - SEVERITY_PENALTY[i.severity]), 1);
  return Math.round(100 * remaining);
}

// Fixes for the most common axe rules. axe's failureSummary only says what failed
// ("Element does not have an alt attribute"), so it goes in the description and these
// say what to do. Other rules fall back to the failureSummary. target-size isn't here:
// it never reaches normalizeAxe, see normalizeTargets.
const AXE_FIXES = {
  'image-alt':
    'Give every meaningful image a short `alt` that says what it shows: `<img src="logo.svg" alt="Acme home">`. ' +
    'Give decorative images an empty alt so screen readers skip them: `<img src="spacer.gif" alt="">`.',
  label:
    'Connect each form field to a visible label: `<label for="search">Search</label> <input id="search" name="q">`. ' +
    'If there is no room for visible text, name it with `aria-label`: `<input name="q" aria-label="Search">`.',
  'color-contrast':
    'Raise text contrast to at least 4.5:1 (3:1 for text 24px and up, or 18.5px bold). Darken the text instead of ' +
    'making it smaller: `color: #595959` on white is 7:1, e.g. `.meta { color: #595959; }`.',
  'link-name':
    'Give links without visible text an accessible name. For an image link, use the image alt: ' +
    '`<a href="/"><img src="logo.svg" alt="Home"></a>`; for an icon link, use `aria-label`: `<a href="/" aria-label="Home">…</a>`.',
  'landmark-one-main': 'Wrap the primary content in exactly one `<main>` element: `<main id="content">…</main>`.',
  'page-has-heading-one':
    'Add one `<h1>` that names the page. It can be styled like the surrounding text: `<h1 class="page-title">Top stories</h1>`.',
  region:
    'Put all content inside landmarks so screen reader users can jump between sections: ' +
    '`<header>…</header> <main>…</main> <footer>…</footer>`.',
};

export function normalizeAxe(accessibility) {
  return accessibility.map((v) => {
    const elements = v.count === 1 ? '1 element' : `${v.count} elements`;
    const examples = v.examples.length ? ` e.g. ${v.examples.map((e) => `\`${e}\``).join(', ')}` : '';
    const failure = cleanFailureSummary(v.failureSummary);
    const fix = AXE_FIXES[v.id];

    return {
      title: v.help,
      severity: AXE_SEVERITY[v.impact] ?? 'minor',
      category: AXE_CATEGORY[v.id] ?? 'accessibility',
      // The full rule set runs on desktop and covers the DOM shared by both viewports ("both");
      // target-size runs on mobile only
      viewport: v.viewport ?? 'both',
      // With a template the failure detail moves here; without one it stays the suggestion
      description: `Found on ${elements}${examples}.${fix && failure ? ` ${failure.replace(/\.$/, '')}.` : ''}`,
      suggestion: fix ?? failure ?? `See the axe rule "${v.id}".`,
      // Rendered as a link by the client rather than pasted into the suggestion text
      learnMoreUrl: v.helpUrl,
      source: 'axe',
    };
  });
}

/**
 * One tap-target issue for everything undersized on mobile: axe's target-size violations
 * plus the targets axe couldn't decide and src/measure.js measured. It's a WCAG rule, so it
 * counts toward the accessibility score like the other axe issues.
 */
export function normalizeTargets(smallTargets) {
  if (!smallTargets) return [];
  const { count, flaggedByAxe, measured, sharedSelector, sharedCount, examples, helpUrl } = smallTargets;

  const list = examples
    .map((e) => `\`${e.selector}\` (${e.width}x${e.height}px${e.spacing != null ? `, ${e.spacing}px clear` : ''})`)
    .join(', ');
  const sources = [
    flaggedByAxe && `${flaggedByAxe} flagged by axe`,
    measured && `${measured} measured directly because their content overflows the element, which axe can't size`,
  ].filter(Boolean);
  const selector = sharedSelector ?? examples[0].selector;
  const scope = sharedSelector ? ` (covers ${sharedCount} of ${count})` : '';

  return [
    {
      title: `Tap targets smaller than ${MIN_TARGET_PX}px on mobile`,
      // axe's target-size impact is serious -> major
      severity: 'major',
      category: 'responsive',
      viewport: 'mobile',
      description:
        `${count} ${count === 1 ? 'target is' : 'targets are'} under ${MIN_TARGET_PX}x${MIN_TARGET_PX}px with less than ` +
        `${MIN_TARGET_PX}px of clear space around them (${sources.join('; ')}), e.g. ${list}.`,
      suggestion:
        `Make targets at least ${MIN_TARGET_PX}x${MIN_TARGET_PX}px (44px is better on touch), or keep ${MIN_TARGET_PX}px of ` +
        `clear space around smaller ones${scope}: \`${selector} { display: inline-block; min-width: 44px; min-height: 44px; }\``,
      learnMoreUrl: helpUrl ?? 'https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html',
      source: 'axe',
    },
  ];
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

// Topics that axe or measure.js already decide precisely. The prompt says not to report
// them, but gemma3 still did ("Mobile: Reduced Font Size", and "Mobile: Content Overflow"
// on a page that doesn't overflow), so AI issues on these topics are dropped: either the
// code found the problem and it's already in the report, or it didn't and the AI is wrong.
// Matched on the title only; descriptions mention font sizes too often to be reliable.
const MEASURED_TOPICS = [
  {
    topic: 'small text',
    // "Small Font Size", "Mobile text is too small", "Text Size"; not "Too many font sizes"
    pattern:
      /\b(small|tiny|reduced|smaller|too small|increase|larger|bigger)\b[^.]{0,25}\b(font|text)\b|\b(font|text)[ -]?size\b[^.]{0,25}\b(small|tiny|reduced|increase|larger|bigger)\b|^(mobile:? )?(small )?(font|text) size$|\b(font|text)\b (is |are )?(too )?(small|tiny)\b/i,
  },
  { topic: 'tap target size', pattern: /\b(tap|touch|click(able)?|hit)[ -]?(target|area)s?\b|\btarget size\b/i },
  {
    topic: 'horizontal overflow',
    pattern: /\boverflow|horizontal(ly)? scroll|scrolls? (sideways|horizontally)|wider than the (screen|viewport)/i,
  },
  { topic: 'color contrast', pattern: /\b(color|colour) contrast\b|\bcontrast ratio\b|\blow contrast\b/i },
];

const measuredTopic = (title) => MEASURED_TOPICS.find(({ pattern }) => pattern.test(title))?.topic;

/** classNames are "tag.class" entries from src/measure.js collectClassNames */
export function normalizeVisual(issues, classNames = []) {
  const tagOf = new Map(classNames.map((entry) => [entry.slice(entry.indexOf('.') + 1), entry.split('.')[0]]));

  return (
    mergeViewports(issues)
      .filter((issue) => {
        const topic = measuredTopic(issue.title);
        if (topic) console.log(`Dropped AI issue already measured in code (${topic}): "${issue.title}"`);
        return !topic;
      })
      // Schema limits aren't enforced by every provider (e.g. Anthropic tool input)
      .slice(0, MAX_VISUAL_ISSUES)
      .map((issue) => ({
        ...issue,
        title: stripViewportPrefix(issue.title),
        suggestion: fixInlineSizing(issue.suggestion, tagOf),
        source: 'ai',
      }))
  );
}

// Vertical margins/padding and width/height do nothing on an inline element. The prompt
// says so, but gemma3 still wrote `span.titleline { margin-bottom: 0.5em; }` for Hacker
// News, so rules like that get `display: inline-block;` added here.
const INLINE_TAGS = new Set(['span', 'a', 'em', 'strong', 'b', 'i', 'small', 'label', 'abbr', 'code', 'time', 'cite', 'q', 'sup', 'sub']);
const SIZING_DECL = /(^|[;{\s])(margin(-top|-bottom)?|padding-(top|bottom)|(min-|max-)?(width|height))\s*:/i;
const DISPLAY_DECL = /(^|[;{\s])display\s*:/i;

// "td.title > span.titleline:hover" -> "span.titleline"
const lastCompound = (selector) =>
  selector.trim().split(/[\s>+~]+/).pop().replace(/::?[\w-]+(\([^)]*\))?/g, '');

function isInlineSelector(selector, tagOf) {
  const compound = lastCompound(selector);
  const tag = compound.match(/^[a-z][a-z0-9]*/i)?.[0].toLowerCase();
  if (tag) return INLINE_TAGS.has(tag);
  // ".titleline" alone: use the tag it was seen on; unknown classes don't count as inline
  const classes = [...compound.matchAll(/\.([\w-]+)/g)].map(([, name]) => name);
  return classes.some((name) => INLINE_TAGS.has(tagOf.get(name)));
}

export function fixInlineSizing(text, tagOf = new Map()) {
  return text.replace(/`([^`]+)`/g, (_, code) => {
    const fixed = code.replace(/([^{}]+)\{([^}]*)\}/g, (rule, selector, decls) => {
      if (!SIZING_DECL.test(decls) || DISPLAY_DECL.test(decls)) return rule;
      // Every selector in the group must be inline; making an h1 inline-block would break it
      if (!selector.split(',').every((part) => isInlineSelector(part, tagOf))) return rule;
      return `${selector}{ display: inline-block;${decls.startsWith(' ') ? '' : ' '}${decls}}`;
    });
    return `\`${fixed}\``;
  });
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

// gemma3 labels titles like "Mobile: ..." or "Both: ..."; the UI already shows the viewport.
// Only a leading "label:" is removed, so "Mobile layout feels squeezed" stays as is.
const stripViewportPrefix = (title) => title.replace(/^(desktop|mobile|both)\s*:\s*/i, '');

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
