export type WorkspaceRefreshDecision = 'none' | 'throttled' | 'final';

export interface WorkspaceStreamMessage {
  type: string;
  data?: unknown;
  conversation_id?: number;
}

interface WorkspaceRefreshTimers {
  schedule: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  cancel: (handle: ReturnType<typeof setTimeout>) => void;
}

const isNonFileSystemTool = (name?: string) =>
  Boolean(name && (/^mcp__nomifun-team-/.test(name) || /^team_/.test(name)));

const isReadOnlyTool = (name?: string) =>
  Boolean(name && /^(read|glob|grep|search|toolsearch|webfetch|websearch|knowledge_search)$/i.test(name));

export function getWorkspaceRefreshDecision(
  message: WorkspaceStreamMessage,
  conversationId: number
): WorkspaceRefreshDecision {
  if (message.conversation_id !== undefined && message.conversation_id !== conversationId) return 'none';
  if (message.type === 'finish' || message.type === 'error') return 'final';

  if (message.type === 'acp_tool_call') {
    const update = (message.data as { update?: { kind?: string; status?: string; title?: string } } | undefined)?.update;
    if (!update || isNonFileSystemTool(update.title) || update.kind === 'read') return 'none';
    if (update.kind === 'edit' || update.kind === 'execute' || update.status === 'completed') return 'throttled';
    return 'none';
  }

  if (message.type === 'tool_call') {
    const tool = message.data as { status?: string; name?: string } | undefined;
    if (tool?.status !== 'completed' || isNonFileSystemTool(tool.name) || isReadOnlyTool(tool.name)) return 'none';
    return 'throttled';
  }

  if (message.type === 'tool_group' && Array.isArray(message.data)) {
    const shouldRefresh = message.data.some(
      (entry: { status?: string; name?: string }) =>
        entry.status === 'completed' && !isNonFileSystemTool(entry.name) && !isReadOnlyTool(entry.name)
    );
    return shouldRefresh ? 'throttled' : 'none';
  }

  return 'none';
}

export function createWorkspaceRefreshController(
  refresh: () => void,
  delayMs = 2000,
  timers: WorkspaceRefreshTimers = {
    schedule: (callback, delay) => setTimeout(callback, delay),
    cancel: (handle) => clearTimeout(handle),
  }
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending = false;
  let disposed = false;

  const clearTimer = () => {
    if (timer !== null) timers.cancel(timer);
    timer = null;
  };

  return {
    request() {
      if (disposed) return;
      if (timer !== null) {
        pending = true;
        return;
      }
      refresh();
      timer = timers.schedule(() => {
        timer = null;
        if (disposed || !pending) return;
        pending = false;
        refresh();
      }, delayMs);
    },
    finalize() {
      if (disposed) return;
      clearTimer();
      pending = false;
      refresh();
    },
    dispose() {
      disposed = true;
      pending = false;
      clearTimer();
    },
  };
}
