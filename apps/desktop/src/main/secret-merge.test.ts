import { describe, expect, it } from 'vitest';
import { mergeProviderSecret } from './secret-merge';

describe('mergeProviderSecret', () => {
  it('saves Bedrock keys one at a time without dropping the earlier field', () => {
    const first = mergeProviderSecret({}, { awsAccessKeyId: 'AKIA123' });
    expect(first).toEqual({ merged: { awsAccessKeyId: 'AKIA123' }, changed: true });
    // Second save (secret key only) must keep the access key ID from the first.
    const second = mergeProviderSecret(first.merged, { awsSecretAccessKey: 'shhh' });
    expect(second.merged).toEqual({ awsAccessKeyId: 'AKIA123', awsSecretAccessKey: 'shhh' });
    expect(second.changed).toBe(true);
  });

  it('never wipes a stored secret on a blank field (leave-blank-to-keep)', () => {
    const existing = { apiKey: 'sk-live' };
    expect(mergeProviderSecret(existing, { apiKey: '' })).toEqual({
      merged: existing,
      changed: false,
    });
    expect(mergeProviderSecret(existing, { apiKey: '   ' }).changed).toBe(false);
    expect(mergeProviderSecret(existing, {}).changed).toBe(false);
  });

  it('updates a field when a new non-empty value differs', () => {
    const r = mergeProviderSecret({ apiKey: 'old' }, { apiKey: 'new' });
    expect(r).toEqual({ merged: { apiKey: 'new' }, changed: true });
  });

  it('reports no change when the value is identical (avoids a needless re-encrypt/write)', () => {
    expect(mergeProviderSecret({ apiKey: 'same' }, { apiKey: 'same' }).changed).toBe(false);
  });
});
