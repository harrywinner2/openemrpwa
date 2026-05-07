import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { postLinkSignal } from './linkChannel';

describe('linkChannel postLinkSignal', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes a JSON-encoded signal under oauth.signal', () => {
    postLinkSignal({ state: 'abc', code: 'xyz' });
    const raw = localStorage.getItem('oauth.signal');
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toEqual({ state: 'abc', code: 'xyz' });
  });

  it('encodes errors when present', () => {
    postLinkSignal({ state: 'abc', error: 'access_denied' });
    const raw = localStorage.getItem('oauth.signal');
    expect(JSON.parse(raw!)).toEqual({ state: 'abc', error: 'access_denied' });
  });
});
