import { t } from 'elysia'

export const healthSchemas = {
  check: t.Object({ status: t.Literal('ok') }),
  ready: t.Object({ status: t.Literal('ok') }),
  notReady: t.Object({ status: t.Literal('not ready') }),
}
