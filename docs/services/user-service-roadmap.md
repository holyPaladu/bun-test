# Roadmap user-service

Статус: план развития существующего сервиса, актуален на 9 сентября 2026 года.

## Текущая ответственность

`user-service` хранит глобальный профиль пользователя и проверяет access JWT по
JWKS `auth-service`. Сейчас реализованы:

- создание профиля по `auth.account-created.v1`;
- transactional inbox и идемпотентный приём `/internal/events`;
- чтение и изменение собственного профиля;
- отдельная PostgreSQL, health/readiness, OpenAPI и структурные логи;
- transport-neutral envelope, хотя текущая доставка идёт по HTTP.

Это уже рабочая вертикаль, поэтому следующий шаг — не переписывать сервис и не
добавлять в него финансовый домен.

## Граница сервиса

Сервис владеет только person-level данными:

- display name;
- avatar reference;
- locale и timezone;
- позже — предпочтения пользователя, если у них один владелец и понятный use case.

Сервис **не владеет** паролем, email для входа, сессиями, организациями,
membership, ролями, permissions, финансовыми счетами или audit log платежей.
Organization display name/position можно показывать в directory как read model,
но источник истины остаётся в organization/access module финансового ядра.

## Следующая работа

### US-1. Закрыть контракт профиля — приоритет P0

Business problem: профиль сейчас принимает свободные строки, а правила жизненного
цикла и приватности не зафиксированы.

- определить максимальные длины и нормализацию `displayName`;
- проверять locale как поддерживаемый BCP 47 tag, timezone как IANA zone;
- определить политику `avatarUrl`: trusted object storage/reference вместо
  произвольной внешней ссылки либо строгий allowlist;
- решить, допускается ли полностью пустой профиль после регистрации;
- зафиксировать PATCH semantics: отсутствующее поле, явный `null`, unchanged;
- добавить `version` или сравнение `updatedAt` для защиты от lost update, если
  профиль редактируется с нескольких клиентов;
- ограничить размер HTTP body и не логировать профиль целиком.

Готово, когда правила одинаково отражены в schema, domain validation, OpenAPI и
тестах boundary cases.

### US-2. Синхронизировать lifecycle identity — приоритет P0

Сейчас consumer знает только о создании account. Нужны решения для:

- `auth.account-blocked` / `auth.account-unblocked` — обычно профиль сохраняется,
  а доступ блокирует auth; user-service может обновить локальную projection,
  только если для неё есть query use case;
- `auth.account-deletion-requested` или `auth.account-deleted` — определить
  retention, anonymization и запрет дальнейших изменений;
- смены login email — не копировать email в профиль без реальной потребности;
- backfill существующих accounts как одноразовой deployment-операции, а не
  постоянной связи с auth database.

Перед новым событием сначала описать владельца факта, payload без лишних PII,
порядок rollout producer/consumer и поведение при неизвестной версии.

### US-3. Наблюдаемость входящих событий — приоритет P0

- метрики accepted/duplicate/rejected/failed по event type и version;
- возраст самого старого необработанного сообщения, если появится асинхронная
  очередь;
- correlation ID и event ID в логах без payload;
- alert на устойчивые ошибки consumer-а;
- операционный runbook: повторная доставка, несовместимый контракт, недоступная
  БД и восстановление после сбоя.

### US-4. Тестирование отказов и контрактов — приоритет P0

- запуск PostgreSQL integration tests в CI, а не только при ручном
  `TEST_DATABASE_URL`;
- contract test общей package-schema против реального HTTP consumer-а;
- конкурентная доставка одного `eventId`;
- rollback inbox при ошибке handler-а;
- JWKS rotation/cache failure, неверные issuer/audience/expiry;
- тест миграций с чистой БД и с предыдущей версией schema.

### US-5. User directory — приоритет P1, только после organization module

Для выбора requester/approver понадобится directory. Сначала организация должна
владеть membership и permissions. Затем user-service может предоставить batch
получение публичных профилей по user IDs или projection/search, ограниченный
tenant membership.

Нельзя добавлять безусловный глобальный поиск всех пользователей. Требуются
authorization, pagination, rate limit, минимальный набор возвращаемых полей и
решение для удалённых/заблокированных профилей.

### US-6. Privacy и эксплуатация — приоритет P1

- классификация PII, retention и anonymization;
- audit административного чтения/изменения, если такие endpoints появятся;
- backup/restore drill и целевые RPO/RTO;
- rate limits для публичных profile endpoints;
- dependency/security scanning;
- стратегия zero-downtime migrations.

## Рекомендуемый порядок

1. US-1 и US-4: закрепить маленький текущий контракт и реальные проверки.
2. US-3: сделать сбои доставки видимыми до роста числа событий.
3. Спроектировать organization/membership/permissions в финансовом ядре.
4. US-2: добавить только необходимые lifecycle events.
5. US-5: directory use cases после появления tenant authorization.
6. US-6: усиливать по мере появления персональных данных и production-среды.

## Критерий «user-service достаточно готов» для следующей фазы

- профиль создаётся ровно один раз при повторной/конкурентной доставке;
- JWT и tenant authorization не смешаны: сервис идентифицирует пользователя,
  финансовое ядро проверяет его membership;
- validation и concurrent update semantics документированы;
- PostgreSQL, contract и failure tests обязательны в CI;
- ошибки incoming delivery измеряются и имеют runbook;
- удаление/блокировка account имеют определённое, протестированное поведение.

