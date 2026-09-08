const encoder = new TextEncoder()

export const hasBearerToken = (
  authorization: string | undefined,
  expectedToken: string,
): boolean => {
  const token = /^Bearer ([^\s]+)$/.exec(authorization ?? '')?.[1]
  if (!token) return false

  const actual = encoder.encode(token)
  const expected = encoder.encode(expectedToken)
  return (
    actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
  )
}
