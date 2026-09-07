# auth-service — API

План разделения auth-account и пользовательского профиля, включая использование
JWT/JWKS в `user-service`, описан в
[`docs/architecture/user-service-separation.md`](../architecture/user-service-separation.md).

Базовый префикс бизнес-роутов: `/api`. Служебные роуты (`/health`, `/.well-known/jwks.json`)
вне `/api` и вне версионирования.

Сервис хранит credentials в `auth_accounts`; доменная сущность называется
`AuthAccount`, а поле, разрешающее вход, — `authStatus` (`auth_status` в БД).
Профильные поля находятся только в `user-service`.

Формат ошибки одинаков для всех эндпоинтов:

```json
{ "error": { "code": "USER_ALREADY_EXISTS", "message": "..." } }
```

Легенда статуса: ✅ реализовано · 🚧 запланировано (см. миграцию `0003_add_session_metadata.sql`).

## Служебные

| Метод | Путь | Auth | Описание | Статус |
|---|---|---|---|---|
| `GET` | `/health/check` | — | liveness | ✅ |
| `GET` | `/health/ready` | — | readiness: проверяет соединение с БД | 🚧 |
| `GET` | `/.well-known/jwks.json` | — | публичный ключ (ES256) для верификации access-токенов другими сервисами | ✅ |

## Auth

### `POST /api/auth/register` ✅

Регистрация нового пользователя.

**Body**
```json
{ "email": "user@example.com", "password": "min 8 chars" }
```

**Ответы**: `201` (`{ "message": "User registered successfully" }`) · `409 ALREADY_EXISTS` · `422` (валидация)

---

### `POST /api/auth/login` ✅ → доработка 🚧

Логин по email/паролю, выдаёт пару токенов.

**Body**
```json
{ "email": "user@example.com", "password": "..." }
```

**Ответ `200`**
```json
{ "accessToken": "<jwt, ttl=JWT_EXPIRES_IN>", "refreshToken": "<opaque, ttl=REFRESH_TOKEN_TTL_DAYS>" }
```

Ошибки: `401 UNAUTHORIZED` (неверный пароль) · `403 USER_BLOCKED` · `404 NOT_FOUND` · `422`

**Доработка**: при создании refresh-токена сохранять `ip_address` (из `server.requestIP`, либо из
`X-Forwarded-For` только если запрос пришёл от доверенного прокси) и `user_agent` (заголовок
`User-Agent`) — колонки уже добавлены миграцией `0003`.

---

### `POST /api/auth/refresh` 🚧

Ротация refresh-токена: старый помечается `revoked_at` + `replaced_by`, выдаётся новая пара.

**Body**
```json
{ "refreshToken": "<opaque>" }
```

**Ответ `200`**: та же форма, что у `/login` (`accessToken`, `refreshToken`).

**Логика**:
1. Найти по `sha256(refreshToken)` в `refresh_tokens`.
2. Если не найден или `expires_at < now()` → `401 UNAUTHORIZED`.
3. Если найден, но уже `revoked_at IS NOT NULL` → **reuse detection**: кто-то предъявил уже
   использованный токен (кража/повтор). Отозвать все активные сессии этого пользователя
   (`revokeAllForUser`), вернуть `401 UNAUTHORIZED`.
4. Иначе: отметить текущую запись отозванной, вставить новую (с новым `ip_address`/`user_agent`
   на момент рефреша, `replaced_by` = id новой), обновить `last_used_at`.

Ошибки: `401 UNAUTHORIZED` · `422`

---

### `GET /api/auth/me` 🚧

Данные текущего пользователя. Требует `Authorization: Bearer <accessToken>` (уже есть готовый
`auth.guard`, просто не подключён ни к одному роуту).

**Ответ `200`**
```json
{ "id": "uuid", "email": "user@example.com", "authStatus": "active", "createdAt": "..." }
```

Ошибки: `401 UNAUTHORIZED`

---

### `GET /api/auth/sessions` 🚧

Список активных сессий (refresh-токенов) текущего пользователя — то, ради чего нужны
`ip_address`/`user_agent`/`last_used_at` из миграции `0003`. Требует access-токен.

**Ответ `200`**
```json
{
  "sessions": [
    {
      "id": "uuid",
      "ipAddress": "203.0.113.10",
      "userAgent": "Mozilla/5.0 ...",
      "createdAt": "2026-08-01T10:00:00Z",
      "lastUsedAt": "2026-09-04T09:12:00Z",
      "current": true
    }
  ]
}
```

`current` — вычисляется сравнением `id` сессии с `sid`, если он будет добавлен в payload
access-токена, либо (проще) по хэшу переданного в запросе refresh-токена, если фронт его пришлёт.

Ошибки: `401 UNAUTHORIZED`

---

### `DELETE /api/auth/sessions/:id` 🚧

Завершить одну конкретную сессию (logout с другого устройства). Требует access-токен;
сессия должна принадлежать текущему пользователю (иначе `404`, не `403` — не подтверждаем
существование чужих сессий).

Ответы: `204` · `401 UNAUTHORIZED` · `404 NOT_FOUND`

---

### `POST /api/auth/logout` 🚧

Отзывает refresh-токен текущей сессии (`revoked_at = now()`).

**Body**
```json
{ "refreshToken": "<opaque>" }
```

Ответы: `204` · `422`

---

### `POST /api/auth/logout-all` 🚧

Отзывает все refresh-токены пользователя. Требует access-токен.

Ответы: `204` · `401 UNAUTHORIZED`

---

### `POST /api/auth/change-password` 🚧

Смена пароля. Требует access-токен + текущий пароль; после смены — `revokeAllForUser`
(разлогинить все остальные сессии).

**Body**
```json
{ "currentPassword": "...", "newPassword": "min 8 chars" }
```

Ответы: `204` · `401 UNAUTHORIZED` · `422`

## Заголовки

| Заголовок | Где | Значение |
|---|---|---|
| `Authorization: Bearer <token>` | все роуты под guard'ом | access-токен из `/login` или `/refresh` |
| `User-Agent` | `/login`, `/refresh` | пишется в `refresh_tokens.user_agent` |

## Не входит в API, но нужно для корректной работы

- **Rate limiting** на `/login`, `/register`, `/refresh` — сейчас ничем не ограничено.
- **CORS** — не подключён, понадобится для запросов с фронтенда на другом origin.
- Доверенный список прокси (для честного разбора `X-Forwarded-For`), если сервис будет
  за nginx/traefik/ingress — иначе `ip_address` в сессиях легко подделать.
