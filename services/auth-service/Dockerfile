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
WORKDIR /workspace/services/auth-service
COPY services/auth-service/package.json services/auth-service/bun.lock ./
COPY packages/integration-event-contracts /workspace/packages/integration-event-contracts
RUN bun install --frozen-lockfile

# ---- test: обязательный quality gate для любой production-сборки. ----
# В финальный образ тесты и dev-зависимости не попадут: runtime копирует из
# build только готовый бинарь сервера и бандл миграций.
FROM deps AS test
COPY services/auth-service/tsconfig.json ./
COPY services/auth-service/src ./src
COPY services/auth-service/scripts ./scripts
COPY services/auth-service/migrations ./migrations
COPY services/auth-service/tests ./tests
RUN bun run typecheck && bun test

FROM test AS build
RUN bun run build && bun run build:migrate

FROM base AS runtime
ENV NODE_ENV=production

# Раскладка повторяет репозиторий: migrate ищет .sql относительно себя
# (import.meta.dir/../migrations), поэтому бандл лежит именно в scripts/.
COPY --from=build --chown=bun:bun /workspace/services/auth-service/build/.output ./auth-service
COPY --from=build --chown=bun:bun /workspace/services/auth-service/build/scripts/migrate.js ./scripts/migrate.js
COPY --chown=bun:bun services/auth-service/migrations ./migrations

USER bun

EXPOSE 3000

# Слим-образ без curl/wget — дёргаем /health/check через встроенный fetch.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["bun", "-e", "fetch(`http://localhost:${process.env.PORT ?? 3000}/health/check`).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["/app/auth-service"]
