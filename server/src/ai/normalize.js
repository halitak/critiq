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

/**
 * AI findings are judgment calls; "critical" is kept for definite automated failures.
 * gemma3 marked "Mobile Layout - Content Cramming" on Hacker News as critical although
 * the page is fully usable.
 */
const MAX_AI_SEVERITY = 'major';

/**
 * page.classNames are "tag.class" entries (src/measure.js collectClassNames),
 * page.styles their colors and backgrounds (collectStyles).
 */
export function normalizeVisual(issues, { classNames = [], styles = null } = {}) {
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
      .map((issue) => {
        let { severity } = issue;
        if (SEVERITY_RANK[severity] < SEVERITY_RANK[MAX_AI_SEVERITY]) {
          console.log(`Capped AI issue severity ${severity} -> ${MAX_AI_SEVERITY}: "${issue.title}"`);
          severity = MAX_AI_SEVERITY;
        }
        return {
          ...issue,
          severity,
          title: stripViewportPrefix(issue.title),
          suggestion: fixFontSize(fixContrast(fixInlineSizing(issue.suggestion, tagOf), styles), styles),
          source: 'ai',
        };
      })
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

// --- Contrast of colors the AI suggests -------------------------------------------
// gemma3 suggested `span.rank { color: #888; }` for Hacker News ranks that axe already
// flagged at 3.54:1, i.e. a lighter gray on the same #f6f6ef background. Colors in AI
// CSS rules are checked against the element's real background (src/measure.js
// collectStyles) and pushed darker or lighter, keeping the hue, until they pass WCAG.

const NAMED_COLORS = {
  black: [0, 0, 0], white: [255, 255, 255], gray: [128, 128, 128], grey: [128, 128, 128],
  silver: [192, 192, 192], red: [255, 0, 0], green: [0, 128, 0], blue: [0, 0, 255],
  orange: [255, 165, 0], navy: [0, 0, 128], maroon: [128, 0, 0], purple: [128, 0, 128],
};

/** "#888", "#828282", "rgb(130, 130, 130)", "gray" -> [r, g, b], or null */
export function parseColor(value) {
  const v = value.trim().toLowerCase();
  if (NAMED_COLORS[v]) return NAMED_COLORS[v];
  let m = v.match(/^#([0-9a-f]{3})$/);
  if (m) return [...m[1]].map((c) => parseInt(c + c, 16));
  m = v.match(/^#([0-9a-f]{6})$/);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  m = v.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/);
  if (m) return m.slice(1, 4).map(Number);
  return null;
}

const toHex = (rgb) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;

// WCAG 2 relative luminance and contrast ratio
const luminance = (rgb) => {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrastRatio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** Mixes fg toward black (light background) or white (dark one) until it reaches min */
function ensureContrast(fg, bg, min) {
  const target = luminance(bg) > 0.18 ? [0, 0, 0] : [255, 255, 255];
  for (let t = 0; t <= 1.0001; t += 0.02) {
    const mixed = fg.map((c, i) => c + (target[i] - c) * t);
    if (contrastRatio(mixed, bg) >= min) return mixed;
  }
  return target;
}

// Large text (24px, or 18.66px bold) only needs 3:1
const requiredRatio = (style) =>
  style && (style.fontSize >= 24 || (style.fontSize >= 18.66 && style.fontWeight >= 700)) ? 3 : 4.5;

/** styles: { pageBackground, classes: { name: { color, background, fontSize, fontWeight } } } */
export function fixContrast(text, styles) {
  if (!styles) return text;
  return text.replace(/`([^`]+)`/g, (_, code) => {
    const fixed = code.replace(/([^{}]+)\{([^}]*)\}/g, (rule, selector, decls) => {
      const colorDecl = decls.match(/(^|[;{\s])color\s*:\s*([^;}]+)/i);
      const fg = colorDecl && parseColor(colorDecl[2]);
      if (!fg) return rule;

      // Background: one set in the same rule, else the class's real one, else the page's
      const bgDecl = decls.match(/background(-color)?\s*:\s*([^;}]+)/i);
      const classes = [...lastCompound(selector).matchAll(/\.([\w-]+)/g)].map(([, name]) => name);
      const style = classes.map((name) => styles.classes[name]).find(Boolean);
      const bg = (bgDecl && parseColor(bgDecl[2])) ?? parseColor(style?.background ?? styles.pageBackground);
      if (!bg) return rule;

      const min = requiredRatio(style);
      if (contrastRatio(fg, bg) >= min) return rule;
      const better = toHex(ensureContrast(fg, bg, min));
      console.log(
        `Adjusted AI color ${colorDecl[2].trim()} -> ${better} on ${toHex(bg)} ` +
          `(${contrastRatio(fg, bg).toFixed(2)}:1 -> ${contrastRatio(parseColor(better), bg).toFixed(2)}:1)`,
      );
      // Replace inside the color declaration only; the same value may appear in a background
      const newDecls = decls.replace(colorDecl[0], colorDecl[0].replace(colorDecl[2].trim(), better));
      return `${selector}{${newDecls}}`;
    });
    return `\`${fixed}\``;
  });
}

// --- Font sizes the AI suggests ----------------------------------------------------
// gemma3 suggested `td.subtext { font-size: 0.8em; }` for Hacker News metadata that is
// already 10.7px on mobile, although the prompt says not to shrink text below 12px.
// Sizes in AI CSS rules are resolved to px and raised to MIN_FONT_PX, keeping the unit.
//
// em and % are resolved against the class's own computed size (collectStyles). Strictly
// they're relative to the parent; the two match whenever the class doesn't set its own
// font-size, as on Hacker News.

const PT_TO_PX = 4 / 3;

/** "0.8em" -> px, or null when the base is unknown or the value isn't a plain length */
export function resolveFontSize(value, basePx, rootPx = 16) {
  const v = value.trim().toLowerCase();
  if (v === 'smaller') return basePx ? basePx / 1.2 : null;
  const m = v.match(/^(\d*\.?\d+)(px|pt|rem|em|%)$/);
  if (!m) return null;
  const n = Number(m[1]);
  switch (m[2]) {
    case 'px': return n;
    case 'pt': return n * PT_TO_PX;
    case 'rem': return n * rootPx;
    case 'em': return basePx ? n * basePx : null;
    case '%': return basePx ? (n / 100) * basePx : null;
  }
  return null;
}

/** The smallest value in the same unit that resolves to at least MIN_FONT_PX */
function minimumIn(unit, basePx, rootPx) {
  const round = (n) => Math.ceil(n * 100) / 100;
  switch (unit) {
    case 'pt': return `${round(MIN_FONT_PX / PT_TO_PX)}pt`;
    case 'rem': return `${round(MIN_FONT_PX / rootPx)}rem`;
    case 'em': return `${round(MIN_FONT_PX / basePx)}em`;
    case '%': return `${Math.ceil((MIN_FONT_PX / basePx) * 100)}%`;
    default: return `${MIN_FONT_PX}px`;
  }
}

export function fixFontSize(text, styles) {
  const rootPx = styles?.rootFontSize ?? 16;
  return text.replace(/`([^`]+)`/g, (_, code) => {
    const fixed = code.replace(/([^{}]+)\{([^}]*)\}/g, (rule, selector, decls) => {
      const sizeDecl = decls.match(/(^|[;{\s])font-size\s*:\s*([^;}]+)/i);
      if (!sizeDecl) return rule;
      const value = sizeDecl[2].trim();

      const classes = [...lastCompound(selector).matchAll(/\.([\w-]+)/g)].map(([, name]) => name);
      const basePx = classes.map((name) => styles?.classes[name]?.fontSize).find(Boolean) ?? null;
      const px = resolveFontSize(value, basePx, rootPx);
      if (px == null || px >= MIN_FONT_PX) return rule;

      const unit = value.match(/(px|pt|rem|em|%)$/i)?.[1].toLowerCase() ?? (basePx ? 'em' : 'px');
      const better = minimumIn(unit, basePx, rootPx);
      console.log(`Raised AI font-size ${value} (${px.toFixed(1)}px) -> ${better} (min ${MIN_FONT_PX}px)`);
      const newDecls = decls.replace(sizeDecl[0], sizeDecl[0].replace(value, better));
      return `${selector}{${newDecls}}`;
    });
    return `\`${fixed}\``;
  });
}
