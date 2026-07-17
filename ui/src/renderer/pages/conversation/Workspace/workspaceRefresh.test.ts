import { describe, expect, test } from 'bun:test';
import { createWorkspaceRefreshController, getWorkspaceRefreshDecision } from './workspaceRefresh';

describe('getWorkspaceRefreshDecision', () => {
  test('ignores events owned by another conversation', () => {
    expect(getWorkspaceRefreshDecision({ type: 'finish', conversation_id: 9 }, 8)).toBe('none');
  });

  test('refreshes ACP edit and execute events during the turn', () => {
    expect(
      getWorkspaceRefreshDecision(
        { type: 'acp_tool_call', data: { update: { kind: 'edit', status: 'in_progress', title: 'Write' } } },
        8
      )
    ).toBe('throttled');
  });

  test('ignores ACP read and team tools', () => {
    expect(
      getWorkspaceRefreshDecision(
        { type: 'acp_tool_call', data: { update: { kind: 'read', status: 'completed', title: 'Read' } } },
        8
      )
    ).toBe('none');
    expect(
      getWorkspaceRefreshDecision(
        { type: 'acp_tool_call', data: { update: { kind: 'execute', title: 'mcp__nomifun-team-run' } } },
        8
      )
    ).toBe('none');
  });

  test('refreshes completed file tools and tool groups', () => {
    expect(
      getWorkspaceRefreshDecision({ type: 'tool_call', data: { status: 'completed', name: 'Write' } }, 8)
    ).toBe('throttled');
    expect(
      getWorkspaceRefreshDecision(
        {
          type: 'tool_group',
          data: [
            { status: 'completed', name: 'Read' },
            { status: 'completed', name: 'Edit' },
          ],
        },
        8
      )
    ).toBe('throttled');
  });

  test('uses finish and error as agent-agnostic final refresh signals', () => {
    expect(getWorkspaceRefreshDecision({ type: 'finish' }, 8)).toBe('final');
    expect(getWorkspaceRefreshDecision({ type: 'error' }, 8)).toBe('final');
  });
});

describe('createWorkspaceRefreshController', () => {
  test('coalesces repeated requests and runs one trailing refresh', () => {
    let calls = 0;
    let scheduled: (() => void) | undefined;
    const controller = createWorkspaceRefreshController(
      () => calls++,
      2000,
      {
        schedule: (callback) => {
          scheduled = callback;
          return 1 as unknown as ReturnType<typeof setTimeout>;
        },
        cancel: () => undefined,
      }
    );

    controller.request();
    controller.request();
    expect(calls).toBe(1);
    scheduled?.();
    expect(calls).toBe(2);
  });

  test('finalize cancels pending work and refreshes immediately', () => {
    let calls = 0;
    let cancelled = 0;
    const controller = createWorkspaceRefreshController(
      () => calls++,
      2000,
      {
        schedule: () => 1 as unknown as ReturnType<typeof setTimeout>,
        cancel: () => cancelled++,
      }
    );

    controller.request();
    controller.request();
    controller.finalize();

    expect(calls).toBe(2);
    expect(cancelled).toBe(1);
  });
});
