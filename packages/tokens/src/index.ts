/**
 * JS/TS mirror of the brand primitives, for contexts that can't read CSS
 * custom properties: transactional email templates, generated PDFs, OG image
 * generation, chart color scales.
 *
 * Source of truth is primitives.css — if you change a value there, mirror it
 * here. (Deliberately not auto-generated from CSS for v1: five call sites
 * don't justify a build-time codegen step yet. Revisit if this drifts.)
 */
export const brand = {
  50: "hsl(326, 90%, 97%)",
  100: "hsl(326, 88%, 93%)",
  200: "hsl(326, 85%, 86%)",
  300: "hsl(326, 82%, 74%)",
  400: "hsl(326, 80%, 55%)",
  500: "hsl(326, 78%, 31%)",
  600: "hsl(326, 87%, 25%)",
  700: "hsl(325, 96%, 20%)",
  800: "hsl(323, 92%, 17%)",
  900: "hsl(321, 71%, 14%)",
  950: "hsl(320, 75%, 8%)",
} as const;

export const status = {
  success: "hsl(166, 56%, 28%)",
  warning: "hsl(33, 86%, 38%)",
  danger: "hsl(5, 72%, 42%)",
} as const;

export const neutral = {
  shell: "hsl(30, 43%, 97%)",
  sand: "hsl(28, 32%, 91%)",
  ink: "hsl(330, 24%, 8%)",
} as const;

/** Registered segment theme names — must have a matching `themes/{name}.css`. */
export const SEGMENTS = ["core"] as const;
export type Segment = (typeof SEGMENTS)[number];

export const fonts = {
  display: '"Fraunces Variable", ui-serif, Georgia, serif',
  sans: '"Inter Variable", ui-sans-serif, system-ui, -apple-system, sans-serif',
  mono: 'ui-monospace, "SF Mono", "Cascadia Code", Menlo, monospace',
} as const;
