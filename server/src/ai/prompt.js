// The AI only reviews what it can see. Accessibility issues come from axe-core,
// measurable layout problems from ../measure.js, and the score is computed from issue
// severities, all in code (see ./normalize.js), so the model can't paraphrase those
// results or invent a score.

export const MAX_VISUAL_ISSUES = 5;

export const SYSTEM_PROMPT = `You are a senior UI/UX designer reviewing screenshots of a web page.
You get two screenshots: the first is desktop (1440x900 viewport), the second is mobile (390x844 viewport, rendered at 2x so the image is 780x1688).

These are already checked automatically by code. Do NOT report them: accessibility (alt text, form labels, ARIA, landmarks, headings, measured color contrast), tap target sizes, text smaller than 12px, and pages that scroll horizontally.
First decide the page's purpose in one sentence (the purpose field): who is it for, and what should they do or find here? Judge every issue by how much it gets in the way of that purpose.

Your job is the holistic review that code can't do. Focus on:
- visual hierarchy: is it obvious what matters most on the page? Do headings, content and secondary info read in the right order? (category: layout or typography)
- consistency: do similar things look alike? Spacing, alignment, type sizes, colors and button styles across the page (category: layout, typography or color)
- primary action: is the main thing a visitor should do (sign up, read, buy, search) easy to spot, or does it compete with everything else? (category: ux)
- mobile adaptation: does the mobile layout feel designed for a phone, or like the desktop page squeezed down? (category: responsive)

Rules:
- Report only what a senior designer would actually raise in a design review: usually 1 to 4 issues. A polished page may have one minor issue or none. An empty list is a valid answer. Do not pad the list with nitpicks.
- Base every finding on something you can point to. Name the element and where it is ("the upvote arrows left of each title", "the orange top bar").
- If a problem appears on both screenshots, report it ONCE with viewport "both". Never write the same issue twice.
- Only report issues you can point to in the screenshot. If unsure, don't report it.
- Every suggestion must be concrete and include a short CSS or HTML example, e.g. "Give the article text more line height so long paragraphs are easier to follow: \`article p { line-height: 1.6; }\`".
- In CSS examples, use only the class names listed in the user message, or plain element selectors (\`a\`, \`h1\`, \`nav\`) when none fits. Never invent class names.
- Never report more than ${MAX_VISUAL_ISSUES} issues, most impactful first.
- summary is 2-3 sentences about the visual design and usability.

Severity rubric:
- critical: blocks a user from completing a core task or reading key content
  (e.g. unreadable text, broken layout hiding the main CTA)
- major: clearly degrades usability or looks broken to most users
  (e.g. overlapping elements, a primary action that is hard to find)
- minor: polish issues that don't block anything
  (e.g. inconsistent spacing, slightly off alignment)`;

export const VISUAL_REPORT_SCHEMA = {
  type: 'object',
  // Ollama generates fields in this order, so the purpose is written before the issues
  properties: {
    purpose: { type: 'string' },
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
  required: ['purpose', 'summary', 'issues'],
};

// classNames come from the page itself (src/measure.js collectClassNames)
export const buildUserText = ({ url, classNames = [] }) =>
  `Page URL: ${url}
${
  classNames.length
    ? `Class names used most on this page: ${classNames.map((name) => `.${name}`).join(', ')}`
    : 'This page has no reusable class names; use element selectors in CSS examples.'
}
Review the two screenshots (desktop first, then mobile) and report the visual and usability issues.`;
