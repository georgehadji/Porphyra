// Astro 5 Content Layer API config (src/content.config.ts, not the legacy
// src/content/config.ts) — defines the "segments" collection that drives
// /for/{slug} landing pages. See packages/tokens/src/themes/core.css for
// how a segment gets its own visual theme once one is chosen; `theme` below
// must match a registered @porphyra/tokens Segment name.

import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const segments = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/segments" }),
  schema: z.object({
    name: z.string(), // e.g. "Product Designers" — human label used in copy
    headline: z.string(),
    subhead: z.string(),
    /** Must match a Segment from @porphyra/tokens's SEGMENTS list. */
    theme: z.string().default("core"),
    /** Controls whether this shows in nav/sitemap — lets a segment be built
     * and previewed before it's publicly linked. */
    published: z.boolean().default(false),
  }),
});

export const collections = { segments };
