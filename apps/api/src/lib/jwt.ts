import jwt, { type SignOptions } from 'jsonwebtoken';

interface TokenPayload {
  userId: string;
  githubId: number;
  login: string;
}

interface DecodedToken extends TokenPayload {
  iat: number;
  exp: number;
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  if (secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters');
  }
  return secret;
}

/**
 * Sign a JWT token
 */
export function signToken(payload: TokenPayload, expiresInSeconds: number = 7 * 24 * 60 * 60): string {
  const options: SignOptions = {
    expiresIn: expiresInSeconds,
    algorithm: 'HS256',
  };
  return jwt.sign(payload, getJwtSecret(), options);
}

/**
 * Verify and decode a JWT token
 */
export function verifyToken(token: string): DecodedToken | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as DecodedToken;
    return decoded;
  } catch (error) {
    return null;
  }
}

/**
 * Decode token without verification (for debugging)
 */
export function decodeToken(token: string): DecodedToken | null {
  try {
    return jwt.decode(token) as DecodedToken;
  } catch {
    return null;
  }
}
