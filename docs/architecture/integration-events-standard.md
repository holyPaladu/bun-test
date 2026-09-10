# Стандарт integration events, use cases и ports

Если сначала нужно понять не правила, а общий смысл механизма, начните с
[объяснения integration events простыми словами](integration-events-explained.md).

Структура сервисов, подключение модулей и разделение port/SQL-repository
определяются [единым стандартом структуры сервисов](service-structure-standard.md).
Примеры именования ниже отражают действующее соглашение. Новый и изменяемый код
должен ему соответствовать; отдельный массовый rename без прикладной причины не
нужен.

## Гарантии доставки

`auth-service` сохраняет account и исходящее событие в одной транзакции. Publisher
доставляет сохранённый envelope как минимум один раз: `eventId` не меняется при
retry и replay, порядок между событиями не гарантируется. `user-service`
резервирует `eventId` в inbox и выполняет обработчик в той же транзакции. Повтор
после commit становится успешным no-op; ошибка обработчика откатывает и inbox,
и бизнес-изменения.

Publisher резервирует только доступный batch и обрабатывает его параллельно. Claim
содержит `lease_owner`; publish, retry и DLQ update проходят лишь для того же
владельца и до истечения lease. Успешная HTTP-доставка со сбоем записи результата
может быть отправлена повторно. Ошибка 408, 429, 5xx или сети повторяется с
exponential backoff и jitter. Остальные 4xx считаются постоянными и сразу идут в
DLQ. `replayDeadLettered(eventId)` сохраняет исходный envelope и сбрасывает
delivery state для ручного повтора.

## Добавить событие

1. В `packages/integration-event-contracts/src/<owner>/` добавить закрытую JSON
   Schema, имя `<domain>.<fact>.vN`, выведенный `Static`-тип и пример. Владелец
   события — модуль producer-а. Добавление поля к существующей закрытой схеме
   несовместимо и требует новой версии.
2. В `<producer-module>/events/create-<fact>.event.ts` добавить фабрику envelope.
   Она создаёт `eventId` один раз.
3. В бизнес-транзакции вызвать только `outbox.append(event, aggregateId)`.
4. В принимающем бизнес-модуле добавить `events/on-<fact>.ts`. Обработчик
   преобразует payload в input use case и использует ports, переданные
   текущей inbox-транзакцией.
5. Передать обработчик в integration-events composition root. Когда входящих
   типов становится больше одного, добавить явный типизированный `switch` по
   `event.type`; не вводить универсальный registry заранее.
6. Сначала развернуть consumer с новой версией, затем producer. Проверить пример
   producer-а runtime-схемой consumer-а, бизнес-эффект, rollback и повторную
   доставку.

## Добавить use case

1. Создать один файл в `<business-module>/use-cases/` и назвать фабрику
   `create<Action>UseCase`.
2. Объявить рядом собственные `Input`, результат и минимальный `Deps`. Не
   передавать HTTP Request, env или SQL client и не создавать repository внутри.
3. HTTP schema остаётся в `http`, DB row и mapper — в `repo`. HTTP route
   преобразует вход в use-case input и сопоставляет стабильные application error
   codes с ответом.
4. Для нескольких связанных записей передать Unit of Work port. Внутри
   входящего event handler использовать ports уже открытой транзакции.
5. Проверить успешный результат, бизнес-ошибки и атомарность связанных записей.

## Добавить port и SQL-repository

1. В `ports/<name>.port.ts` объявить `<Name>Port` без SQL-типов. `find…` возвращает
   entity или `null`; условный update документирует значение `boolean`; PATCH
   различает отсутствующее поле и `null`.
2. В `repo/<name>.repository.ts` добавить SQL-фабрику
   `create<Name>Repository(sql): <Name>Port`. Row и `row -> entity` mapper
   держать в `repo/<name>.mapper.ts`. Префикс `postgres-` не используется.
3. Преобразовать известные constraint errors в application errors внутри
   PostgreSQL implementation.
4. Создавать implementation в module composition или Unit of Work. Use case
   получает port или его минимальный `Pick`.
5. Проверить `null`/создание/условные изменения, constraint mapping и реальные
   rollback/locking semantics на PostgreSQL для транзакционного кода.

PostgreSQL-набор запускается командой `TEST_DATABASE_URL=<url> bun run
test:postgres`; во избежание случайной очистки обычной базы её имя обязано
заканчиваться на `_test`.

## Метрики доставки

Один registry создаётся на процесс. Локальные counters/summaries имеют labels
`event_type` и ограниченный `outcome`; pending, DLQ и возраст очереди читаются из
общей БД при каждом `GET /metrics`. Поэтому queue gauges нельзя суммировать между
репликами. Endpoint отдаёт текущее состояние; историю хранит внешний Prometheus.

| Метрика | Источник | Что показывает |
|---|---|---|
| `auth_outbox_delivery_attempts_total` | цикл после успешного state update | исходы попыток |
| `auth_outbox_delivery_request_duration_seconds` | цикл доставки | время HTTP-отправки |
| `auth_outbox_delivery_success_delay_seconds` | occurredAt → publish | полную задержку успеха |
| `auth_outbox_pending_events` | outbox DB | размер ожидающей очереди |
| `auth_outbox_dead_letter_events` | outbox DB | события для ручного разбора/replay |
| `auth_outbox_oldest_pending_age_seconds` | outbox DB | возраст отставания очереди |

Сбой записи метрики логируется и не влияет на publish/retry/DLQ решение.
