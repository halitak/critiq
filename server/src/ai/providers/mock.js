// Fake visual review for frontend work: free, instant, deterministic.
// axe issues and the score are added in ../normalize.js, same as for the real providers.
export async function analyze() {
  await new Promise((r) => setTimeout(r, 1500)); // simulate latency

  return {
    summary:
      'Clean overall layout with a clear hierarchy on desktop. The mobile view suffers from small tap targets and the hero text is hard to read against the background.',
    issues: [
      {
        title: 'Low contrast hero text',
        severity: 'critical',
        category: 'color',
        viewport: 'both',
        description: 'The subtitle under the main heading uses light gray on a white background.',
        suggestion: 'Darken the text to at least a 4.5:1 contrast ratio: `.hero p { color: #595959; }`',
      },
      {
        title: 'Tap targets too small on mobile',
        severity: 'major',
        category: 'responsive',
        viewport: 'mobile',
        description: 'Navigation links are packed closely and are smaller than 44x44px.',
        suggestion: 'Give each link enough padding to reach 44x44px: `nav a { display: inline-block; padding: 12px; }`',
      },
      {
        title: 'Inconsistent heading sizes',
        severity: 'minor',
        category: 'typography',
        viewport: 'desktop',
        description: 'Section headings use three different font sizes with no clear pattern.',
        suggestion: 'Use one type scale for section headings: `h2 { font-size: 1.5rem; } h3 { font-size: 1.125rem; }`',
      },
    ],
  };
}
