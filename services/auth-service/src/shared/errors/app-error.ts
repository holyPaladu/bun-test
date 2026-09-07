/**
 * База для всех ожидаемых ошибок приложения.
 *
 * Use-case бросает наследника и НЕ знает про HTTP — соответствие
 * `status` конкретному коду ответа применяет `errorHandler`.
 */
export abstract class AppError extends Error {
  /** Машиночитаемый код для клиента, стабильный контракт. */
  abstract readonly code: string
  /** HTTP-статус, в который ошибку разворачивает транспортный слой. */
  abstract readonly status: number

  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}

export const isAppError = (error: unknown): error is AppError => error instanceof AppError


/**
 * Ошибка, которая бросается, когда такой сущность уже существует.
 */
export class AlreadyExistsError extends AppError {
  readonly code = 'ALREADY_EXISTS'
  readonly status = 409

  constructor(entity: string) {
    super(`${entity} already exists`)
  }
}

/**
 * Отсутствующий, невалидный или просроченный токен — во всех трёх случаях
 * клиенту нужно ровно одно и то же: перелогиниться. Причину не детализируем,
 * чтобы не подсказывать, что именно перебирать.
 */
export class UnauthorizedError extends AppError {
  readonly code = 'UNAUTHORIZED'
  readonly status = 401

  constructor(message = 'Unauthorized') {
    super(message)
  }
}

/**
 * Ошибка, которая бросается, когда сущность не найдена.
 */
export class NotFoundError extends AppError {
  readonly code = 'NOT_FOUND'
  readonly status = 404

  constructor(entity: string) {
    super(`${entity} not found`)
  }
}

/**
 * Учётная запись существует и прошла бы проверку пароля, но заблокирована —
 * это не проблема аутентификации (401), а запрет доступа по статусу
 * аккаунта, поэтому 403.
 */
export class AuthAccountBlockedError extends AppError {
  readonly code = 'USER_BLOCKED'
  readonly status = 403

  constructor() {
    super('User is blocked')
  }
}

/**
 * Ошибка, которая бросается, когда предоставлены неверные учетные данные.
 */
export class InvalidCredentialsError extends AppError {
  readonly code = 'INVALID_CREDENTIALS'
  readonly status = 401

  constructor(message = 'Invalid credentials') {
    super(message)
  }
}
