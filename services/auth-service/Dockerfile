# syntax=docker/dockerfile:1

# Сервер едет в образ скомпилированным бинарём (`bun build --compile` — то же,
# что делает `bun run build:start` на хосте), миграции — бандлом на пару сотен
# килобайт: отдельный --compile положил бы в образ вторую копию рантайма bun
# (~83 MB) ради скрипта, который отрабатывает раз на деплой. Ни исходников,
# ни node_modules в финальном образе нет.
#
# Один образ используется и для сервера (CMD ниже), и для миграций —
# см. docker-compose.yml, сервис migrate переиспользует этот же image
# с другим command, отдельно не собирается.

FROM oven/bun:1.4.0-slim AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ---- test: docker build --target test — гоняет typecheck + bun test. ----
# Не участвует в дефолтной сборке (build/runtime от неё не зависят), поэтому
# обычный `docker compose up --build` тесты не гоняет — только CI явно
# через --target test. Сейчас упадёт: в проекте пока нет ни одного теста.
FROM deps AS test
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
COPY migrations ./migrations
RUN bun run typecheck
RUN bun test

FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
RUN bun run build && bun run build:migrate

FROM base AS runtime
ENV NODE_ENV=production

# Раскладка повторяет репозиторий: migrate ищет .sql относительно себя
# (import.meta.dir/../migrations), поэтому бандл лежит именно в scripts/.
COPY --from=build --chown=bun:bun /app/build/.output ./auth-service
COPY --from=build --chown=bun:bun /app/build/scripts/migrate.js ./scripts/migrate.js
COPY --chown=bun:bun migrations ./migrations

USER bun

EXPOSE 3000

# Слим-образ без curl/wget — дёргаем /health/check через встроенный fetch.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["bun", "-e", "fetch(`http://localhost:${process.env.PORT ?? 3000}/health/check`).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["/app/auth-service"]
