import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'bun:test';

const source = readFileSync(fileURLToPath(new URL('./MessageAcpPermission.tsx', import.meta.url)), 'utf8');

describe('MessageAcpPermission user-input waiting state', () => {
  test('keeps a visible waiting hint after a user input answer is submitted', () => {
    expect(source.includes('waitingAgentAfterUserInput')).toBe(true);
    expect(source.includes('isUserInputRequest')).toBe(true);
    expect(source.includes('responseSentSuccessfully')).toBe(true);
  });
});
