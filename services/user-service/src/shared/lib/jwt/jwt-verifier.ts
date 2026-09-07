import { Type, type Static } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'
import { createRemoteJWKSet, customFetch, jwtVerify, type FetchImplementation } from 'jose'

const uuidPattern = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'

const accessTokenPayloadSchema = Type.Object(
  {
    iss: Type.String({ minLength: 1 }),
    aud: Type.String({ minLength: 1 }),
    sub: Type.String({ pattern: uuidPattern }),
    sid: Type.String({ pattern: uuidPattern }),
    iat: Type.Integer({ minimum: 0 }),
    exp: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
)

export type AccessTokenPayload = Static<typeof accessTokenPayloadSchema>

export interface JwtVerifierOptions {
  jwksUrl: string
  issuer: string
  audience: string
  timeoutMs: number
  clockToleranceSec: number
  /** Test seam and proxy hook; production uses jose's default fetch. */
  fetchJwks?: FetchImplementation
}

export interface JwtVerifier {
  verify(token: string): Promise<AccessTokenPayload>
}

export class JwtVerifierUnavailableError extends Error {
  constructor(options?: ErrorOptions) {
    super('JWKS is temporarily unavailable', options)
    this.name = 'JwtVerifierUnavailableError'
  }
}

const isJwksInfrastructureError = (error: unknown) => {
  const code = (error as { code?: unknown } | null)?.code
  return code === 'ERR_JWKS_TIMEOUT'
    || code === 'ERR_JWKS_FETCH_FAILED'
    || code === 'ERR_JOSE_GENERIC'
    || error instanceof TypeError
}

/** Consumer-only verifier: ключи загружаются и кэшируются из auth-service JWKS. */
export const JwtVerifier = (options: JwtVerifierOptions): JwtVerifier => {
  const jwks = createRemoteJWKSet(new URL(options.jwksUrl), {
    timeoutDuration: options.timeoutMs,
    [customFetch]: options.fetchJwks,
  })

  return {
    verify: async (token) => {
      try {
        const { payload } = await jwtVerify(token, jwks, {
          algorithms: ['ES256'],
          issuer: options.issuer,
          audience: options.audience,
          typ: 'JWT',
          requiredClaims: ['iss', 'aud', 'sub', 'sid', 'iat', 'exp'],
          clockTolerance: options.clockToleranceSec,
        })

        if (!Value.Check(accessTokenPayloadSchema, payload) || payload.exp <= payload.iat) {
          throw new Error('Invalid access token structure')
        }

        return payload
      } catch (error) {
        if (isJwksInfrastructureError(error)) {
          throw new JwtVerifierUnavailableError({ cause: error })
        }
        throw error
      }
    },
  }
}
