/**
 * Генерирует пару ключей ES256 для JwtSigner/JwtVerifier и печатает готовые
 * строки для .env. Приватный ключ — секрет только этого сервиса; публичный
 * безопасно раздавать (он и так утекает наружу через /.well-known/jwks.json).
 */
import { exportPKCS8, exportSPKI, generateKeyPair } from 'jose'

const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true })

const privatePem = await exportPKCS8(privateKey)
const publicPem = await exportSPKI(publicKey)
const kid = crypto.randomUUID()

console.log(`JWT_PRIVATE_KEY=${Buffer.from(privatePem).toString('base64')}`)
console.log(`JWT_PUBLIC_KEY=${Buffer.from(publicPem).toString('base64')}`)
console.log(`JWT_KID=${kid}`)
