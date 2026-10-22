import { randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { StoreError } from './envelope';

/**
 * Customer access tokens.
 *
 * TODAY (interim): HS256 JWTs issued by `auth-login` for the single seeded dummy customer.
 * LATER: the identity provider issues the token and `verifyAccessToken` switches to
 * `createRemoteJWKSet(<IdP JWKS url>)` with the IdP's issuer/audience. Nothing else changes:
 * every protected function only calls `requireCustomer()` (see customer-auth.ts).
 *
 * Fails closed: without AUTH_JWT_SECRET (>= 32 chars) in production no token is issued or accepted.
 * Outside production a fixed development secret is used so `npm run dev` works with zero setup.
 */
const DEV_SECRET = 'dev-only-secret-do-not-use-in-production-0123456789';
export const TOKEN_USE = 'customer';

export const issuer = () => process.env.AUTH_ISSUER ?? 'lakshmi-sarees-store-functions';
export const audience = () => process.env.AUTH_AUDIENCE ?? 'lakshmi-sarees-storefront';
export const tokenTtlSeconds = () => Math.max(60, Number(process.env.AUTH_TOKEN_TTL_SECONDS) || 3600);

function secretKey(): Uint8Array {
  const configured = process.env.AUTH_JWT_SECRET;
  const secret = configured ?? (process.env.NODE_ENV === 'production' ? '' : DEV_SECRET);
  if (secret.length < 32) {
    throw new StoreError('AUTH_NOT_CONFIGURED', 'Sign-in is not configured on this server.');
  }
  return new TextEncoder().encode(secret);
}

export interface AccessClaims {
  customerId: string;
  /** Unique token id = store.customer_sessions.jti: revoking that row revokes the token (checked in requireCustomer). */
  jti: string;
}

export async function issueAccessToken(customerId: string): Promise<{ token: string; expiresIn: number; jti: string }> {
  const expiresIn = tokenTtlSeconds();
  const jti = randomUUID();
  const token = await new SignJWT({ use: TOKEN_USE })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(customerId)
    .setIssuer(issuer())
    .setAudience(audience())
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(`${expiresIn}s`)
    .sign(secretKey());
  return { token, expiresIn, jti };
}

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: ['HS256'], // pin the algorithm: never trust the token's own header
      issuer: issuer(),
      audience: audience(),
      requiredClaims: ['sub', 'exp', 'jti'],
    });
    if (payload.use !== TOKEN_USE || !payload.sub || !payload.jti) throw new Error('wrong token use');
    return { customerId: payload.sub, jti: payload.jti };
  } catch (err) {
    if (err instanceof StoreError) throw err;
    throw new StoreError('UNAUTHENTICATED', 'Invalid or expired session.');
  }
}
