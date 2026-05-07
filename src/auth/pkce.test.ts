import { describe, expect, it } from 'vitest';
import { deriveCodeChallenge, generateCodeVerifier, generateState } from './pkce';

describe('PKCE primitives', () => {
  it('generates a base64url verifier of the expected length', () => {
    const v = generateCodeVerifier();
    expect(v).toMatch(/^[A-Za-z0-9_-]+$/);
    // 32 random bytes → 43 base64url chars (32 * 4 / 3 rounded down, no padding)
    expect(v.length).toBe(43);
  });

  it('produces unique verifiers per call', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) seen.add(generateCodeVerifier());
    expect(seen.size).toBe(50);
  });

  it('generates a base64url state', () => {
    const s = generateState();
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(s.length).toBe(22); // 16 bytes → 22 base64url chars
  });

  it('derives a stable S256 challenge for a known verifier (RFC 7636 §B test vector)', async () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = await deriveCodeChallenge(verifier);
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('challenge differs from verifier', async () => {
    const v = generateCodeVerifier();
    const c = await deriveCodeChallenge(v);
    expect(c).not.toBe(v);
    expect(c).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
