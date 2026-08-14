# The AI job consumer (docs/ARCHITECTURE_UPLIFT_PLAN.md §3.1) — same
# security posture as infra/docker-compose.prod.yml's other services:
# non-root, no dev dependencies in the runtime image, pinned base image.
#
# Uses `pnpm deploy` (not a hand-rolled multi-stage COPY dance) to produce
# a pruned, self-contained directory for just this workspace package and
# its resolved dependencies — the pnpm-native way to package one package
# out of a monorepo for a container image.

FROM node:20-alpine AS build
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm deploy --filter=@porphyra/worker --prod /out

FROM node:20-alpine AS runtime
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate \
  && addgroup -S porphyra && adduser -S porphyra -G porphyra
WORKDIR /app
COPY --from=build /out .
USER porphyra
ENV NODE_ENV=production
CMD ["pnpm", "start"]
