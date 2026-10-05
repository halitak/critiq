// Layout checks that are measured in the browser instead of judged by the AI.
// Tap target size is not here: axe's `target-size` rule handles it, including the
// WCAG 2.5.8 exceptions (enough spacing, inline links) that a plain size check misses.

export const MIN_FONT_PX = 12;

/** Runs in the mobile context. Returns { smallText, overflow }. */
export function measureMobile(page) {
  return page.evaluate((minFontPx) => {
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
      if (group.examples.length < 3) group.examples.push({ text: text.slice(0, 40), selector: describe(el) });
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
        examples: culprits.slice(0, 3).map((el) => ({
          selector: describe(el),
          right: Math.round(el.getBoundingClientRect().right),
        })),
      };
    }

    return {
      smallText: [...bySize.values()].sort((a, b) => a.fontSize - b.fontSize),
      overflow,
    };
  }, MIN_FONT_PX);
}
