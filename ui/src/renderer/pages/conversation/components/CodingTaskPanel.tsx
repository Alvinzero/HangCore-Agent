/**
 * @license
 * Copyright 2025-2026 NomiFun (nomifun.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from "@/common";
import type { TChatConversation } from "@/common/config/storage";
import type {
  CodingTask,
  SpecArtifact,
  SpecArtifactKind,
} from "@/common/types/codingTask";
import {
  Button,
  Input,
  Spin,
  Tabs,
  Tag,
  Tooltip,
} from "@arco-design/web-react";
import { CheckOne, Plus, Refresh } from "@icon-park/react";
import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import useSWR from "swr";

const TRACKED_ARTIFACT_KINDS = [
  "spec",
  "plan",
  "tasks",
] as const satisfies readonly SpecArtifactKind[];
type TrackedArtifactKind = (typeof TRACKED_ARTIFACT_KINDS)[number];

const artifactTitleKey: Record<TrackedArtifactKind, string> = {
  spec: "conversation.codingTask.tabs.spec",
  plan: "conversation.codingTask.tabs.plan",
  tasks: "conversation.codingTask.tabs.tasks",
};

const templateKey: Record<TrackedArtifactKind, string> = {
  spec: "conversation.codingTask.templates.spec",
  plan: "conversation.codingTask.templates.plan",
  tasks: "conversation.codingTask.templates.tasks",
};

const statusColor = (status?: string) => {
  switch (status) {
    case "completed":
      return "green";
    case "failed":
    case "cancelled":
      return "red";
    case "generating":
    case "verifying":
      return "blue";
    case "planning":
    case "tasks_ready":
      return "arcoblue";
    default:
      return "gray";
  }
};

function agentIdForConversation(
  conversation: TChatConversation,
): string | undefined {
  const extra = conversation.extra as Record<string, unknown>;
  if (typeof extra.custom_agent_id === "string" && extra.custom_agent_id.trim())
    return extra.custom_agent_id;
  if (extra.backend === "kun") return "agent_builtin_kun";
  if (typeof extra.backend === "string" && extra.backend.trim())
    return extra.backend;
  return undefined;
}

function backendForConversation(
  conversation: TChatConversation,
): string | undefined {
  const extra = conversation.extra as Record<string, unknown>;
  if (typeof extra.backend === "string" && extra.backend.trim())
    return extra.backend;
  return conversation.type;
}

function agentNameForConversation(
  conversation: TChatConversation,
): string | undefined {
  const extra = conversation.extra as Record<string, unknown>;
  if (typeof extra.agent_name === "string" && extra.agent_name.trim())
    return extra.agent_name;
  return undefined;
}

function buildTaskTitle(conversation: TChatConversation) {
  return conversation.name?.trim() || `Conversation #${conversation.id}`;
}

function artifactMap(artifacts?: SpecArtifact[]) {
  return new Map(
    (artifacts ?? []).map((artifact) => [artifact.kind, artifact]),
  );
}

const CodingTaskPanel: React.FC<{ conversation?: TChatConversation }> = ({
  conversation,
}) => {
  const { t } = useTranslation();
  const [activeKind, setActiveKind] = useState<TrackedArtifactKind>("spec");
  const [draft, setDraft] = useState("");
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const conversationId = conversation?.id;
  const {
    data: tasks,
    isLoading: tasksLoading,
    mutate: mutateTasks,
  } = useSWR(conversationId ? ["coding-tasks", conversationId] : null, () =>
    ipcBridge.codingTasks.list.invoke({ limit: 100 }),
  );
  const task = useMemo(
    () => tasks?.find((item) => item.conversation_id === conversationId),
    [conversationId, tasks],
  );

  const {
    data: artifacts,
    isLoading: artifactsLoading,
    mutate: mutateArtifacts,
  } = useSWR(task ? ["coding-task-artifacts", task.id] : null, () =>
    ipcBridge.codingTasks.listArtifacts.invoke({ task_id: task!.id }),
  );
  const artifactsByKind = useMemo(() => artifactMap(artifacts), [artifacts]);
  const activeArtifact = artifactsByKind.get(activeKind);

  useEffect(() => {
    setDraft(activeArtifact?.content ?? t(templateKey[activeKind]));
  }, [activeArtifact?.content, activeKind, t]);

  const createTask = async () => {
    if (!conversation) return;
    setCreating(true);
    setError(null);
    try {
      const backend = backendForConversation(conversation);
      await ipcBridge.codingTasks.create.invoke({
        title: buildTaskTitle(conversation),
        workspace_path: conversation.extra?.workspace,
        profile: backend === "kun" ? "hs_8bit_mcu" : "generic_coding",
        project_type: "new_code",
        selected_agent_id: agentIdForConversation(conversation),
        backend,
        conversation_id: conversation.id,
        selected_knowledge_scopes: [],
        metadata: {
          source: "conversation-sidebar",
          agent_name: agentNameForConversation(conversation),
        },
      });
      await mutateTasks();
      setActiveKind("spec");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  const saveArtifact = async () => {
    if (!task) return;
    setSaving(true);
    setError(null);
    try {
      await ipcBridge.codingTasks.upsertArtifact.invoke({
        task_id: task.id,
        kind: activeKind,
        title: t(artifactTitleKey[activeKind]),
        content: draft,
        format: "markdown",
        status: "draft",
        trace_links: activeKind === "tasks" ? ["spec", "plan"] : [],
        metadata: { source: "conversation-sidebar" },
      });
      await mutateArtifacts();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  if (!conversation) return null;

  const loading = tasksLoading || artifactsLoading;

  return (
    <section className="px-12px py-10px border-b border-[var(--bg-3)] bg-1">
      <div className="flex items-center justify-between gap-8px mb-8px">
        <div className="min-w-0">
          <div className="text-13px font-600 color-[var(--color-text-1)] truncate">
            {t("conversation.codingTask.title")}
          </div>
          <div className="text-11px color-[var(--color-text-3)] truncate">
            {task ? task.title : t("conversation.codingTask.empty")}
          </div>
        </div>
        <Tooltip
          content={
            task
              ? t("conversation.codingTask.refresh")
              : t("conversation.codingTask.create")
          }
        >
          <Button
            size="mini"
            type={task ? "secondary" : "primary"}
            icon={task ? <Refresh /> : <Plus />}
            loading={creating}
            onClick={task ? () => void mutateTasks() : createTask}
          />
        </Tooltip>
      </div>

      {loading && (
        <div className="h-44px flex items-center justify-center">
          <Spin size={16} />
        </div>
      )}

      {!loading && task && (
        <>
          <div className="grid grid-cols-2 gap-6px mb-8px text-11px">
            <div className="min-w-0">
              <div className="color-[var(--color-text-3)]">
                {t("conversation.codingTask.status")}
              </div>
              <Tag
                size="small"
                color={statusColor(task.status)}
                className="mt-2px max-w-full truncate"
              >
                {task.status}
              </Tag>
            </div>
            <div className="min-w-0">
              <div className="color-[var(--color-text-3)]">
                {t("conversation.codingTask.profile")}
              </div>
              <div className="mt-3px truncate color-[var(--color-text-1)]">
                {task.profile}
              </div>
            </div>
            <div className="col-span-2 min-w-0">
              <div className="color-[var(--color-text-3)]">
                {t("conversation.codingTask.agent")}
              </div>
              <div className="mt-3px truncate color-[var(--color-text-1)]">
                {task.selected_agent_id ||
                  task.backend ||
                  t("conversation.codingTask.unset")}
              </div>
            </div>
          </div>

          <Tabs
            size="small"
            type="line"
            activeTab={activeKind}
            onChange={(key) => setActiveKind(key as TrackedArtifactKind)}
            className="coding-task-tabs [&_.arco-tabs-header-title]:text-12px [&_.arco-tabs-content]:pt-8px"
          >
            <Tabs.TabPane
              key="spec"
              title={t("conversation.codingTask.tabs.spec")}
            >
              <ArtifactEditor draft={draft} setDraft={setDraft} />
            </Tabs.TabPane>
            <Tabs.TabPane
              key="plan"
              title={t("conversation.codingTask.tabs.plan")}
            >
              <ArtifactEditor draft={draft} setDraft={setDraft} />
            </Tabs.TabPane>
            <Tabs.TabPane
              key="tasks"
              title={t("conversation.codingTask.tabs.tasks")}
            >
              <ArtifactEditor draft={draft} setDraft={setDraft} />
            </Tabs.TabPane>
          </Tabs>

          <div className="flex items-center justify-end mt-8px">
            <Button
              size="mini"
              type="primary"
              icon={<CheckOne />}
              loading={saving}
              onClick={() => void saveArtifact()}
            >
              {t("conversation.codingTask.save")}
            </Button>
          </div>
        </>
      )}

      {!loading && !task && (
        <div className="text-12px color-[var(--color-text-2)] leading-18px">
          {t("conversation.codingTask.emptyHint")}
        </div>
      )}

      {error && (
        <div className="mt-8px text-11px color-[rgb(var(--red-6))] break-words">
          {error}
        </div>
      )}
    </section>
  );
};

const ArtifactEditor: React.FC<{
  draft: string;
  setDraft: (value: string) => void;
}> = ({ draft, setDraft }) => (
  <Input.TextArea
    value={draft}
    onChange={setDraft}
    autoSize={{ minRows: 5, maxRows: 10 }}
    className="text-12px"
  />
);

export default CodingTaskPanel;
