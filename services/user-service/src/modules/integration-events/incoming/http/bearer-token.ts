import { timingSafeEqual } from 'node:crypto'

export const hasBearerToken = (
  authorization: string | undefined,
  expectedToken: string,
): boolean => {
  const token = /^Bearer ([^\s]+)$/.exec(authorization ?? '')?.[1]
  if (!token) return false

  const actual = Buffer.from(token)
  const expected = Buffer.from(expectedToken)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
