import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

const readSource = (url: URL) => readFileSync(url, 'utf8');

describe('enterprise workbench navigation boundary', () => {
  test('removes knowledge management from the primary sidebar', () => {
    const siderSource = readSource(new URL('./index.tsx', import.meta.url));

    expect(siderSource.includes('SiderKnowledgeEntry')).toBe(false);
    expect(siderSource.includes('useKnowledgeInboxPending')).toBe(false);
    expect(siderSource.includes("navTo('/knowledge')")).toBe(false);
  });

  test('redirects legacy knowledge management deep links into settings', () => {
    const routerSource = readSource(new URL('../Router.tsx', import.meta.url));

    expect(routerSource.includes("path='/knowledge' element={<Navigate to='/settings/enterprise' replace />}")).toBe(
      true
    );
    expect(routerSource.includes("path='/knowledge/:id' element={<Navigate to='/settings/enterprise' replace />}")).toBe(
      true
    );
    expect(routerSource.includes('KnowledgeListPage')).toBe(false);
    expect(routerSource.includes('KnowledgeDetailPage')).toBe(false);
  });
});
