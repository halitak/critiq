// Layout checks that are measured in the browser instead of judged by the AI.
// Tap target size is mostly axe's `target-size` rule, which applies the WCAG 2.5.8
// exceptions (enough spacing, inline links). measureTargets only covers what axe
// leaves undecided.

export const MIN_FONT_PX = 12;
export const MIN_TARGET_PX = 24;

/** Example elements kept per finding (axe violations and measured checks) */
export const MAX_EXAMPLES = 5;

/** Runs in the mobile context. Returns { smallText, overflow }. */
export function measureMobile(page) {
  return page.evaluate(({ minFontPx, maxExamples }) => {
    const describe = (el) => {
      if (el.id) return `${el.tagName.toLowerCase()}#${el.id}`;
      const cls = [...el.classList].slice(0, 2).join('.');
      return cls ? `${el.tagName.toLowerCase()}.${cls}` : el.tagName.toLowerCase();
    };

    const isVisible = (el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      const style = getComputedStyle(el);
      return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0;
    };

    // Visible text rendered below minFontPx, grouped by font size
    const bySize = new Map();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent.trim();
      const el = node.parentElement;
      // Skip bare punctuation like "(" or "|" between links
      if (!/[\p{L}\p{N}]/u.test(text) || !el || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName) || !isVisible(el)) continue;

      const size = Math.round(parseFloat(getComputedStyle(el).fontSize) * 10) / 10;
      if (size >= minFontPx) continue;

      const group = bySize.get(size) ?? { fontSize: size, count: 0, examples: [] };
      group.count++;
      if (group.examples.length < maxExamples) group.examples.push({ text: text.slice(0, 40), selector: describe(el) });
      bySize.set(size, group);
    }

    // Horizontal overflow: only reported when the page itself scrolls sideways,
    // so content inside intentional scroll containers (carousels, code blocks) is ignored
    const viewportWidth = document.documentElement.clientWidth;
    const pageWidth = document.documentElement.scrollWidth;
    let overflow = null;
    if (pageWidth > viewportWidth + 1) {
      // The outermost elements sticking out are the likely cause; their children just follow
      const culprits = [...document.body.querySelectorAll('*')].filter((el) => {
        if (!isVisible(el) || el.getBoundingClientRect().right <= viewportWidth + 1) return false;
        const parent = el.parentElement;
        return !parent || parent === document.body || parent.getBoundingClientRect().right <= viewportWidth + 1;
      });
      overflow = {
        viewportWidth,
        pageWidth,
        examples: culprits.slice(0, maxExamples).map((el) => ({
          selector: describe(el),
          right: Math.round(el.getBoundingClientRect().right),
        })),
      };
    }

    return {
      smallText: [...bySize.values()].sort((a, b) => a.fontSize - b.fontSize),
      overflow,
    };
  }, { minFontPx: MIN_FONT_PX, maxExamples: MAX_EXAMPLES });
}

/**
 * All undersized tap targets on mobile, in one list:
 * - `failed`: nodes axe's target-size rule flagged. They are kept as is.
 * - `undecided`: nodes axe left "incomplete". axe gives up when a child overflows the
 *   target's box: Hacker News vote arrows are an 18x10 <a> holding a 13x13 arrow, so all
 *   30 of them ended up there. These are measured here like WCAG 2.5.8: the union of the
 *   element and its visible descendants, and an undersized target is fine when a 24px
 *   circle around its center doesn't touch another interactive element.
 *
 * Also picks one selector for the fix: a class most targets share, either their own
 * (`.btn`) or their nearest classed ancestor's (`.votelinks a`), so the suggestion covers
 * all of them instead of naming one id. Returns null when nothing is too small.
 */
export function measureTargets(page, { failed, undecided }) {
  if (!failed.length && !undecided.length) return null;

  return page.evaluate(
    ({ failed, undecided, minPx, maxExamples }) => {
      const INTERACTIVE = 'a[href], button, input, select, textarea, [role="button"], [onclick]';

      const unionRect = (el) => {
        let { left, top, right, bottom } = el.getBoundingClientRect();
        for (const child of el.querySelectorAll('*')) {
          const r = child.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          left = Math.min(left, r.left);
          top = Math.min(top, r.top);
          right = Math.max(right, r.right);
          bottom = Math.max(bottom, r.bottom);
        }
        return { left, top, right, bottom, width: right - left, height: bottom - top };
      };

      // Distance from a point to the nearest edge of a rect (0 when inside it)
      const distance = (x, y, r) =>
        Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));

      const others = [...document.querySelectorAll(INTERACTIVE)];
      const nearestOther = (el, rect) => {
        const cx = (rect.left + rect.right) / 2;
        const cy = (rect.top + rect.bottom) / 2;
        let nearest = Infinity;
        for (const other of others) {
          if (other === el || el.contains(other) || other.contains(el)) continue;
          const r = other.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          nearest = Math.min(nearest, distance(cx, cy, r));
        }
        return nearest;
      };

      const targets = [];
      const measure = (selector, source) => {
        const el = document.querySelector(selector);
        if (!el) return;
        const rect = unionRect(el);
        const nearest = nearestOther(el, rect);
        // axe already decided its own failures; only undecided nodes are judged here
        if (source === 'measured' && (rect.width >= minPx && rect.height >= minPx || nearest >= minPx / 2)) return;
        targets.push({
          el,
          source,
          selector,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          // Diameter of the clear circle around the center, as axe reports it
          spacing: Number.isFinite(nearest) ? Math.round(nearest * 2 * 10) / 10 : null,
        });
      };
      failed.forEach((s) => measure(s, 'axe'));
      undecided.forEach((s) => measure(s, 'measured'));
      if (!targets.length) return null;

      // Candidate shared selectors: own class (".btn") or nearest classed ancestor + tag (".votelinks a")
      const candidates = new Map();
      const vote = (sel) => candidates.set(sel, (candidates.get(sel) ?? 0) + 1);
      for (const { el } of targets) {
        const own = [...el.classList].filter((c) => /^[A-Za-z_][\w-]*$/.test(c));
        own.forEach((c) => vote(`.${c}`));
        let parent = el.parentElement;
        while (parent && parent !== document.body && !parent.classList.length) parent = parent.parentElement;
        const ancestor = parent && [...parent.classList].find((c) => /^[A-Za-z_][\w-]*$/.test(c));
        if (ancestor) vote(`.${ancestor} ${el.tagName.toLowerCase()}`);
      }
      // Most covered wins; own classes come first in insertion order, so they win ties
      const [best, covered] = [...candidates].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];

      return {
        count: targets.length,
        flaggedByAxe: targets.filter((t) => t.source === 'axe').length,
        measured: targets.filter((t) => t.source === 'measured').length,
        // Only worth using when it covers at least half of the targets
        sharedSelector: covered * 2 >= targets.length ? best : null,
        sharedCount: covered * 2 >= targets.length ? covered : 0,
        examples: targets.slice(0, maxExamples).map(({ el, ...rest }) => rest),
      };
    },
    { failed, undecided, minPx: MIN_TARGET_PX, maxExamples: MAX_EXAMPLES },
  );
}

export const MAX_CLASS_NAMES = 15;

/**
 * Most used class names on the page with their tag ("tr.athing", "span.sitestr"), for the
 * AI's CSS examples. The tag lets the model suggest properties that fit the element. Utility classes
 * (Tailwind-style "flex", "px-4", "md:hidden") and generated names ("css-1x2y3z",
 * "Button_root__a1B2c") are skipped: `.flex { ... }` would be bad advice, and hashed
 * names change on every build.
 */
export function collectClassNames(page) {
  return page.evaluate((max) => {
    const UTILITY_WORDS = new Set([
      'flex', 'grid', 'block', 'inline', 'inline-block', 'inline-flex', 'hidden', 'contents',
      'relative', 'absolute', 'fixed', 'sticky', 'static', 'container', 'sr-only', 'truncate',
      'uppercase', 'lowercase', 'capitalize', 'italic', 'underline', 'antialiased', 'grow', 'shrink',
      'border', 'rounded', 'shadow', 'transition', 'visible', 'invisible', 'clearfix',
      'isolate', 'outline', 'transform', 'ring', 'group', 'peer', 'prose', 'dark', 'light',
      'tabular-nums', 'undefined', 'null',
    ]);
    const UTILITY_PREFIX =
      /^-?(p|px|py|pt|pb|pl|pr|ps|pe|m|mx|my|mt|mb|ml|mr|ms|me|w|h|size|min-w|min-h|max-w|max-h|gap|gap-x|gap-y|space-x|space-y|text|bg|border|rounded|shadow|font|leading|tracking|z|top|left|right|bottom|inset|grid-cols|grid-rows|col|row|col-span|row-span|order|opacity|duration|ease|delay|translate-x|translate-y|scale|rotate|fill|stroke|ring|outline|divide|from|via|to|basis|flex|items|justify|content|self|place|overflow|object|aspect|line-clamp|decoration|whitespace|break|cursor|select|pointer-events|list|align|animate|blur|backdrop|transition|shrink|grow|origin|translate|snap|group|peer|scroll|touch|will-change|mix-blend|filter|drop-shadow|columns|float|clear|box|table|caption|accent|caret|appearance|resize|transform|inline|grid|scheme|perspective|not)(-|$)/;
    const GENERATED = /^(css|sc|jsx|emotion|svelte|astro)-[a-z0-9]+$|__[A-Za-z0-9_-]{4,}$|^[a-z]{1,3}[A-Z0-9][A-Za-z0-9]{4,}$/;

    const counts = new Map();
    for (const el of document.querySelectorAll('[class]')) {
      for (const name of el.classList) {
        if (/[:\[\]\/!.%@]/.test(name) || UTILITY_WORDS.has(name) || UTILITY_PREFIX.test(name)) continue;
        if (GENERATED.test(name) || name.length < 2) continue;
        // Keyed with the tag ("tr.athing") so the AI can tell a table row from a div
        const key = `${el.tagName.toLowerCase()}.${name}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, max)
      .map(([name]) => name);
  }, MAX_CLASS_NAMES);
}
