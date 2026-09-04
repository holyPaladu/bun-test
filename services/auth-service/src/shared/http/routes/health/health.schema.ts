import { t } from 'elysia'

export const healthSchemas = {
  check: t.Object({ status: t.Literal('ok') }),
  dbReady: t.Object({ status: t.Union([t.Literal('ok'), t.Literal('not ready')]) }),
}