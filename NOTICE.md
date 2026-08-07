# Third-party notices

Porphyra is a proprietary product (see `package.json`, `license: UNLICENSED`). It is **not**
a fork or redistribution of any other project — but a small amount of domain logic
(the evaluation scoring rubric, canonical application states, and report/output schema
shapes) was originally designed for, and ported/adapted from, the open-source
[`santifer/jobber`](https://github.com/santifer/jobber) project, licensed under the MIT
License. MIT requires the copyright and permission notice to be retained wherever a
substantial portion of the covered code is reused — this file satisfies that for the files
below.

**Ported/adapted files** (each carries a `// Adapted from santifer/jobber (MIT)` header
pointing back here):

- `packages/core/src/scoring.ts` — from `modes/_shared.md` § Scoring System
- `packages/core/src/legitimacy.ts` — from `modes/_shared.md` § Posting Legitimacy
- `packages/core/src/states.ts` — from `templates/states.yml`
- `packages/core/src/report.ts` — from `lib/report-schema.mjs` and `lib/score-summary.mjs`
- `packages/ai/src/providers.ts` — from `lib/llm-providers.mjs`
- `packages/ai/src/prompts/evaluate.ts` — from `modes/oferta.md`

No other part of Porphyra (branding, copy, design system, encryption architecture, billing,
infrastructure, or any file not listed above) is derived from `santifer/jobber`.

---

## MIT License (as applied to the files listed above)

```
MIT License

Copyright (c) santifer (https://github.com/santifer/jobber)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

This is not legal advice. Before commercial launch, have counsel confirm this notice is
sufficient for your jurisdiction and use case.
