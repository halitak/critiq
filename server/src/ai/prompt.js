// The AI only reviews what it can see. Accessibility issues come from axe-core and
// the score is computed from issue severities, both in code (see ./normalize.js),
// so the model can't paraphrase axe results or invent a score.

export const MAX_VISUAL_ISSUES = 8;

export const SYSTEM_PROMPT = `You are a senior UI/UX designer reviewing screenshots of a web page.
You get two screenshots: the first is desktop (1440x900 viewport), the second is mobile (390x844 viewport, rendered at 2x so the image is 780x1688).

Accessibility (alt text, form labels, ARIA, landmarks, headings, measured color contrast) is already checked automatically by code. Do NOT report those.
Report only problems that are actually visible in the screenshots:
- layout: alignment, spacing, crowding, visual hierarchy, things that look broken
- typography: text too small to read, too many sizes, long line lengths, poor line height
- color: areas that look washed out or hard to read, clashing or inconsistent colors
- responsive: tap targets that look smaller than about 44x44px, links packed too close to tap, overflow, wrapping navigation, desktop layout squeezed onto mobile
- ux: unclear primary action, confusing navigation, missing feedback or affordances

Rules:
- Base every finding on something you can point to. Name the element and where it is ("the upvote arrows left of each title", "the orange top bar").
- If a problem appears on both screenshots, report it ONCE with viewport "both". Never write the same issue twice.
- Severity: "critical" = blocks or seriously hurts use for many users; "major" = clearly hurts usability or readability; "minor" = polish. Use critical rarely.
- Every suggestion must be concrete and include a short CSS or HTML example, e.g. "Give the links 12px vertical padding so each tap target is at least 44px tall: \`.nav a { padding: 12px 8px; }\`".
- Report up to ${MAX_VISUAL_ISSUES} issues, most impactful first. If the page looks fine, report fewer. Never invent problems to fill the list.
- summary is 2-3 sentences about the visual design and usability.`;

export const VISUAL_REPORT_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    issues: {
      type: 'array',
      maxItems: MAX_VISUAL_ISSUES,
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          severity: { type: 'string', enum: ['critical', 'major', 'minor'] },
          category: {
            type: 'string',
            enum: ['layout', 'typography', 'color', 'responsive', 'ux'],
          },
          viewport: { type: 'string', enum: ['desktop', 'mobile', 'both'] },
          description: { type: 'string' },
          suggestion: { type: 'string' },
        },
        required: ['title', 'severity', 'category', 'viewport', 'description', 'suggestion'],
      },
    },
  },
  required: ['summary', 'issues'],
};

export const buildUserText = ({ url }) =>
  `Page URL: ${url}
Review the two screenshots (desktop first, then mobile) and report the visual and usability issues.`;
