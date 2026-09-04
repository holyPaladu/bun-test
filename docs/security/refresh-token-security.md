# Защита refresh-токенов: ротация и reuse-detection

Анализ текущего состояния `login` / `refresh-token` / `logout` в `auth-service` и план
доработки против сценария «refresh-токен утёк или украден».

Легенда статуса: ✅ есть · ⚠️ баг · 🚧 нужно доработать

## Что уже есть

Инфраструктура под reuse-detection заложена — миграция `0003_add_session_metadata.sql` добавила
`replaced_by`, `last_used_at`, `ip_address`, `user_agent`, и в комментарии к индексу прямо написано
«для reuse-detection». Ротация тоже работает: `refresh-token.ts:43-52` вставляет новый токен
и отзывает старый со ссылкой `replaced_by`.

**Но самой детекции нет.** `refresh-token.ts:33` — `if (storedToken.revokedAt) throw new UnauthorizedError()`.
Отозванный токен просто отвергается, и на этом всё.

## Дыры

| # | Проблема | Где | Статус |
|---|---|---|---|
| 1 | Предъявление отозванного токена не считается компрометацией | `refresh-token.ts:33` | 🚧 |
| 2 | Нет понятия цепочки/сессии — отзыв «всего сразу» невозможен | схема БД | 🚧 |
| 3 | Рефреш не атомарен, гонка даёт две валидные цепочки | `refresh-token.ts:30,43-52` | 🚧 |
| 4 | `revoke()` затирает `replaced_by` и `revoked_at` | `refresh-token.repository.ts:31-37` | ⚠️ |
| 5 | Logout отзывает один токен, а не сессию | `logout.ts:20` | 🚧 |
| 6 | Logout — оракул существования токена (404) | `logout.ts:18` | 🚧 |
| 7 | Ротация продлевает TTL бесконечно, цепочка не умирает никогда | `refresh-token.ts:48` | 🚧 |
| 8 | User enumeration + тайминг-оракул на логине | `login-user.ts:29` | 🚧 |
| 9 | Нет лимита активных сессий и чистки просроченных строк | — | 🚧 |
| 10 | `ip_address` / `user_agent` пишутся, но не используются | — | 🚧 |

### 1. Предъявление отозванного токена не считается сигналом компрометации

Главное. Сценарий: злоумышленник украл refresh-токен. Дальше два исхода, и оба сейчас плохие:

- **Вор рефрешит первым** → он получает свежую цепочку и живёт в ней все `REFRESH_TOKEN_TTL_DAYS`.
  Легитимный пользователь приходит со своим (уже отозванным) токеном, получает `401`, спокойно
  перелогинивается — и **ничего не замечает**. Вор остаётся внутри.
- **Пользователь рефрешит первым** → вор получает `401` на свою копию. Но он просто ждёт и пробует
  снова позже, а система не узнала, что утечка вообще была.

Правильное поведение (OAuth 2.1 §6.1, `draft-ietf-oauth-security-topics`): предъявление уже
отозванного токена = доказательство того, что токен видели двое → **убить всю цепочку целиком**.
Тогда в любом из двух исходов вора выкидывает максимум через один цикл рефреша пользователя,
а не через неделю.

### 2. Нет понятия цепочки / сессии

Токены связаны только через `replaced_by` — чтобы отозвать всю цепочку, нужен рекурсивный CTE
в обе стороны. Работает, но дорого и хрупко.

### 3. Рефреш не атомарен — гонка

`findByTokenHash` (`refresh-token.ts:30`) делается вне транзакции, а вставка + отзыв
(`refresh-token.ts:43-52`) — в отдельной. Два параллельных запроса с одним токеном оба проходят
проверку, оба вставляют новый токен, оба отзывают старый. Из одного токена получаются **две
валидные цепочки** — ровно то, что детекция должна предотвращать. Плюс `revoke` не проверяет
`revoked_at IS NULL`, так что второй апдейт молча затирает первый.

### 4. Баг в `revoke`: logout рвёт цепочку ⚠️

У `revoke(tokenId, newTokenId = null)` дефолт `null`, и `logout.ts:20` вызывает её одним
аргументом → `SET replaced_by = NULL`. Если logout прилетел со старым, уже ротированным токеном,
он **обнуляет `replaced_by` и сдвигает `revoked_at` вперёд** — стирает ровно те данные,
на которых должна строиться детекция.

### 5-6. Logout

`logout.ts:20` гасит только предъявленную строку — актуальный токен цепочки (у вора) продолжает
жить. `logout.ts:18` кидает `404` на ненайденный токен: даёт возможность отличить «токен есть
в БД» от «нет» и ломает UX, потому что повторный logout валится ошибкой.

### 7. Ротация продлевает TTL бесконечно

`refresh-token.ts:48` каждый раз ставит `now + REFRESH_TOKEN_TTL_DAYS`. Цепочка, которую
регулярно рефрешат, не умирает **никогда**. Нужен абсолютный потолок жизни сессии независимо
от ротаций.

### 8. User enumeration на логине

`login-user.ts:29` — `NotFoundError("User")` (`404`) при отсутствии пользователя против
`UnauthorizedError` (`401`) при неверном пароле. Плюс при отсутствии пользователя argon2
не вызывается → ещё и тайминг-оракул. Прямо к теме краж не относится, но это в том же файле
и это способ узнать, чьи токены вообще имеет смысл красть.

---

## Решение

### Модель данных

Минимальный вариант — `family_id` (миграция `0004`):

```sql
ALTER TABLE refresh_tokens ADD COLUMN family_id uuid;
UPDATE refresh_tokens SET family_id = id WHERE family_id IS NULL;  -- бэкфилл: старые цепочки распадаются, для дев-базы ок
ALTER TABLE refresh_tokens ALTER COLUMN family_id SET NOT NULL;
ALTER TABLE refresh_tokens ADD COLUMN revoked_reason text;  -- 'rotated' | 'logout' | 'reuse_detected' | 'session_limit'

CREATE INDEX refresh_tokens_family_active_idx
  ON refresh_tokens (family_id) WHERE revoked_at IS NULL;
```

`family_id` постоянен на всю цепочку ротаций, присваивается при логине. Тогда «убить цепочку» —
это один `UPDATE ... WHERE family_id = $1 AND revoked_at IS NULL`.

Более честный вариант — отдельная таблица
`sessions(id, user_id, created_at, absolute_expires_at, revoked_at, revoked_reason, ip, user_agent)`,
а в `refresh_tokens` — `session_id`. Стоит взять сразу, если планируется «мои устройства» /
«выйти на всех устройствах»: там абсолютный TTL сессии (дыра 7) и список сессий получаются
бесплатно, а без неё «последнюю живую строку цепочки» придётся каждый раз вычислять.

`replaced_by` в любом случае оставить — он больше не нужен для отзыва, но полезен для аудита.

### Репозиторий

```ts
insert(input: { userId, familyId, tokenHash, expiresAt, ip, userAgent }): Promise<RefreshToken>
findByTokenHash(hash): Promise<RefreshToken | null>          // без фильтра по revoked — отозванные нужны для детекции
rotate(oldId: string, newId: string): Promise<boolean>       // атомарный CAS
revokeFamily(familyId: string, reason: string): Promise<number>
countActiveFamilies(userId: string): Promise<number>         // для лимита сессий
```

Ключевая — `rotate`, она же защита от гонки (дыра 3). У Bun `SQL` нет `affectedRows`,
поэтому через `RETURNING` + длину массива:

```sql
UPDATE refresh_tokens
SET revoked_at = now(), last_used_at = now(), replaced_by = ${newId}, revoked_reason = 'rotated'
WHERE id = ${oldId} AND revoked_at IS NULL
RETURNING id
```

Пустой результат = кто-то отозвал строку раньше нас.

Отдельно починить текущую `revoke`: добавить `AND revoked_at IS NULL`, чтобы она перестала
затирать уже отозванные строки (дыра 4).

### `POST /auth/refresh-token`

Всё одной транзакцией. Важная тонкость: **если бросить исключение внутри `sql.begin`, откатится
и `revokeFamily`** — детекция сработает, а следов не останется. Поэтому транзакция должна
возвращать результат, а бросать надо снаружи:

```ts
const result = await sql.begin(async (tx) => {
  const stored = /* SELECT ... WHERE token_hash = $1 FOR UPDATE */   // сериализует параллельные рефреши

  if (!stored)          return { ok: false }
  if (stored.revokedAt) {                                  // ⚡ REUSE
    await revokeFamily(stored.familyId, 'reuse_detected')
    return { ok: false, reuse: true, ctx: { /* userId, familyId, ip, ua */ } }   // коммитим отзыв!
  }
  if (stored.expiresAt < now)             return { ok: false }
  if (family.absoluteExpiresAt < now)     return { ok: false }   // дыра 7

  const user = await findById(stored.userId)
  if (!user || user.status !== 'active')  return { ok: false, blocked: true }

  const newRow  = await insert({ familyId: stored.familyId, /* ... */ })
  const rotated = await rotate(stored.id, newRow.id)
  if (!rotated) {
    await revokeFamily(stored.familyId, 'reuse_detected')
    return { ok: false, reuse: true }
  }

  return { ok: true, /* ... */ }
})

if (result.reuse) logger.warn({ userId, familyId, ip, userAgent }, 'refresh token reuse detected')
if (!result.ok)   throw new UnauthorizedError()
```

`FOR UPDATE` делает проигрыш в `rotate` практически невозможным, но проверку стоит оставить —
она бесплатная и закрывает случай отзыва из другого места (logout).

`expiresAt` нового токена считать от `family.createdAt + absoluteTtl`, ограничивая сверху,
иначе дыра 7 остаётся.

### Три подводных камня

**Ложные срабатывания.** Мобильный клиент, стрельнувший двумя рефрешами параллельно, или ретрай
после потерянного ответа выглядят точь-в-точь как кража — пользователя разлогинит на ровном месте.
Варианты:

- Правильный ответ — **мьютекс на клиенте**: один рефреш в момент времени, остальные ждут его
  результата. Это надо делать в любом случае.
- **Grace-окно на сервере**: если `revoked_reason = 'rotated'`, `now() - revoked_at < ~10s`
  и замена ещё жива — не считать компрометацией. Ослабляет детекцию на эти 10 секунд.

**Вернуть клиенту «тот же» токен при ретрае нельзя.** В БД лежит только sha256-хэш
(`shared/lib/token/refresh-token.ts:18`), сырого значения нет. В grace-окне придётся выдать
*ещё один* токен в той же цепочке, а не повторить предыдущий. Осознанный размен.

**Access-токен переживает отзыв цепочки.** Он stateless и живёт `JWT_EXPIRES_IN` (15 мин) —
после убийства family вор всё ещё ходит по своему JWT до истечения. Стандартно это принимают.
Если не хочется — класть `sid: family_id` в payload (`shared/lib/jwt/jwt-signer.ts:28`)
и проверять отзыв в гварде через Redis; это возвращает состояние в проверку токена.

### `POST /auth/logout`

- Всегда `200`, никогда `404` (убирает оракул дыры 6 и чинит идемпотентность).
- Токен не найден → тихо выйти, залогировать.
- Найден → `revokeFamily(stored.familyId, 'logout')`, а не отзыв одной строки.
- Найден, но уже отозван → это тоже потенциальный reuse. Цепочка и так гасится, достаточно лога.
- Отдельно стоит `POST /auth/logout-all` под auth-guard: отзыв всех family пользователя.

### `POST /auth/login`

- Новая `family_id` на каждый логин (`gen_random_uuid()` или id первого токена),
  `absolute_expires_at = now() + N дней`.
- `NotFoundError("User")` (`login-user.ts:29`) → `InvalidCredentialsError` `401`, тот же ответ,
  что и на неверный пароль. И прогонять argon2 по фиктивному хэшу, когда пользователь не найден,
  чтобы выровнять тайминг.
- Лимит активных сессий (5-10): при превышении отзывать самую старую family.
- `sid` в JWT-payload — пригодится и для корреляции логов, и если позже добавится проверка отзыва.
- Порядок в `Promise.all` (`login-user.ts:36-48`) корректен, но с family проще собрать всё
  последовательно.

---

## За пределами этих трёх юзкейсов

Самый действенный рычаг вообще не в детекции. Сейчас refresh-токен ходит в JSON-теле
(`auth.schemas.ts:31`), то есть у браузерного клиента лежит в `localStorage` → **любой XSS = кража**.
Детекция ловит кражу постфактум; `httpOnly; Secure; SameSite=Strict; Path=/auth` cookie её
предотвращает — JS до токена просто не дотягивается. Если идти этим путём, понадобится
CSRF-защита на `/refresh-token` и `/logout`. Для мобильных клиентов body нормально, там
хранилище — Keychain/Keystore.

Ещё по мелочи:

- rate-limit на `/auth/login` (сам refresh-токен — 256 бит энтропии, перебирать бессмысленно,
  а вот пароли — да);
- `ip` / `user_agent` использовать как мягкий сигнал аномалии в логах, но не как жёсткую проверку
  (мобильный IP скачет, UA меняется с обновлением приложения);
- крон на чистку `expires_at < now() - 30 days`;
- метрика + алерт на `reuse_detected` — без оповещения детекция работает вполсилы, а письмо
  пользователю «мы завершили ваши сессии» закрывает петлю.

## Порядок внедрения

1. Миграция `0004`: `family_id` + `revoked_reason` (+ `absolute_expires_at` / таблица `sessions`).
2. Починить `revoke` (`AND revoked_at IS NULL`) — это баг прямо сейчас, независимо от остального.
3. `rotate` как атомарный CAS + `revokeFamily` в репозитории.
4. Переписать refresh на одну транзакцию с `FOR UPDATE` и детекцией.
5. Logout → идемпотентный отзыв family.
6. Login → family + абсолютный TTL + убрать enumeration.
7. Логи / метрики на `reuse_detected`.
8. Отдельно и позже: cookie-транспорт, лимит сессий, `logout-all`, крон-чистка.

Пункты 1-4 закрывают собственно «украли refresh-токен», 5-7 делают это наблюдаемым,
8 — снижает вероятность самой кражи.
