import { describe, expect, it } from 'vitest';
import { hasRunningToolMessages, normalizeAcpToolCall, normalizeToolCall } from './normalizeToolCall';

describe('normalizeToolCall', () => {
  it('ignores tool_call messages without call_id', () => {
    const result = normalizeToolCall({
      type: 'tool_call',
      content: {
        call_id: '',
        name: 'Glob',
        status: 'running',
        args: { pattern: '*.rs' },
      },
    } as any);

    expect(result).toBeUndefined();
  });

  it('renders legacy Kun user_input acp tool calls without raw JSON or running state', () => {
    const message = {
      type: 'acp_tool_call',
      id: 'call-user-input-1',
      conversation_id: 2,
      content: {
        update: {
          session_update: 'tool_call',
          tool_call_id: 'call-user-input-1',
          status: 'in_progress',
          title: 'user_input',
          kind: 'execute',
          raw_input: {
            question: '你想在什么平台上跑这个 LED 轮流亮灯的程序？',
            options: [{ label: 'Arduino (C++)', description: '用 Arduino 开发板控制物理 LED' }],
          },
        },
      },
    } as any;

    expect(normalizeAcpToolCall(message)).toMatchObject({
      name: '用户输入',
      status: 'pending',
      description: '你想在什么平台上跑这个 LED 轮流亮灯的程序？',
      input: undefined,
    });
    expect(hasRunningToolMessages([message])).toBe(false);
  });
});
