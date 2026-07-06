export type CodingTaskStatus =
  | "created"
  | "clarifying"
  | "spec_ready"
  | "planning"
  | "tasks_ready"
  | "generating"
  | "verifying"
  | "completed"
  | "failed"
  | "cancelled";

export type CodingTaskProfile = "hs_8bit_mcu" | "generic_coding";

export type SpecArtifactKind =
  | "requirement"
  | "spec"
  | "plan"
  | "tasks"
  | "checklist"
  | "acceptance"
  | "trace";

export interface CodingTask {
  id: string;
  title: string;
  workspace_path?: string | null;
  profile: CodingTaskProfile | string;
  target_chip?: string | null;
  project_type: string;
  status: CodingTaskStatus | string;
  selected_agent_id?: string | null;
  backend?: string | null;
  conversation_id?: number | null;
  selected_knowledge_scopes: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CodingTaskCreateRequest {
  title: string;
  workspace_path?: string;
  profile?: CodingTaskProfile | string;
  target_chip?: string;
  project_type?: string;
  selected_agent_id?: string;
  backend?: string;
  conversation_id?: number;
  selected_knowledge_scopes?: string[];
  metadata?: Record<string, unknown>;
}

export interface SpecArtifact {
  id: string;
  coding_task_id: string;
  kind: SpecArtifactKind | string;
  title: string;
  content: string;
  format: string;
  status: string;
  trace_links: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SpecArtifactUpsertRequest {
  task_id: string;
  kind: SpecArtifactKind;
  title: string;
  content: string;
  format?: string;
  status?: string;
  trace_links?: string[];
  metadata?: Record<string, unknown>;
}
