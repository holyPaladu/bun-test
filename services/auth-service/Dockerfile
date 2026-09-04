# syntax=docker/dockerfile:1

# Один образ используется и для сервера (CMD ниже), и для миграций —
# см. docker-compose.yml, сервис migrate переиспользует этот же image
# с другим command, отдельно не собирается.

FROM oven/bun:1.4.0-slim AS base
WORKDIR /app

# ---- test: docker build --target test — гоняет typecheck + bun test. ----
# Не участвует в дефолтной сборке (runtime от неё не зависит), поэтому
# обычный `docker compose up --build` тесты не гоняет — только CI явно
# через --target test. Сейчас упадёт: в проекте пока нет ни одного теста.
FROM base AS test
COPY package.json bun.lock tsconfig.json ./
RUN bun install --frozen-lockfile
COPY src ./src
COPY scripts ./scripts
COPY migrations ./migrations
RUN bun run typecheck
RUN bun test

FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM base AS runtime
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
COPY migrations ./migrations

RUN chown -R bun:bun /app
USER bun

EXPOSE 3000

# Слим-образ без curl/wget — дёргаем /health/check через встроенный fetch.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["bun", "-e", "fetch(`http://localhost:${process.env.PORT ?? 3000}/health/check`).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["bun", "run", "start"]
