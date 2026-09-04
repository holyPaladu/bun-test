import { openapi } from '@elysiajs/openapi'

/**
 * /openapi — Scalar UI, /openapi/json — сырая спека. Генерируется из схем
 * роутов (t.Object в *.schemas.ts + detail/tags на самих роутах), руками
 * ничего не описываем.
 */
export const openapiPlugin = openapi({
  provider: 'scalar',
  path: '/swagger',
  // Дефолтная эвристика ("путь с точкой — наверняка статик-файл") выкидывает
  // /.well-known/jwks.json из спеки. Реальной статики в приложении нет.
  exclude: { staticFile: false },
  documentation: {
    info: {
      title: 'Auth Service',
      version: '1.0.0',
    }
  },
  scalar: {
    theme: 'dark',
    layout: 'classic',
    
  }
})
