---
name: "Example segment — replace me"
headline: "This is a template, not a real targeting claim"
subhead: "Delete or replace this file once a real audience segment is chosen. It exists to prove /for/{slug} builds end to end — see src/content.config.ts for the schema and README.md for how to add a real one."
theme: "core"
published: true
---

## How to add a real segment

1. Add a theme override to `packages/tokens/src/themes/{slug}.css` (copy `themes/core.css` as
   a starting point) and register the name in `packages/tokens/src/index.ts`'s `SEGMENTS`.
2. Add a markdown file here at `src/content/segments/{slug}.md` with real, honest copy for
   that audience — no fabricated statistics or testimonials.
3. Set `published: true` once it's ready to link from navigation.

This file should not exist in a production build once a real segment replaces it.
