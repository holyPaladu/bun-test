import { SQL } from 'bun'

/**
 * Проверяет, является ли ошибка уникальным нарушением ограничения в базе данных.
 * SQLSTATE (23505) у Bun лежит в `errno`, а не в `code` — `code` у него всегда
 * общий `ERR_POSTGRES_SERVER_ERROR`. Перепутать легко: типы .d.ts объявляют
 * оба поля строками и не подсказывают, какое из них — реальный Postgres-код.
 */
export const isUniqueViolation = (error: unknown): error is SQL.PostgresError =>
  error instanceof SQL.PostgresError && error.errno === '23505'