// Renders `backtick` spans from issue text (CSS snippets, selectors) as inline code
export function RichText({ text }: { text: string }) {
  return text.split(/`([^`]+)`/).map((part, i) =>
    i % 2 === 1 ? (
      <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] break-all text-foreground">
        {part}
      </code>
    ) : (
      part
    ),
  )
}
