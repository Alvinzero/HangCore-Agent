-- Seed Kun as an optional local ACP Agent.
--
-- 001_baseline.sql covers fresh installs. This incremental migration covers
-- existing v0.1.0 databases that already ran the baseline before Kun was added.
INSERT OR IGNORE INTO agent_metadata
    (id, icon, name, backend, agent_type, agent_source, agent_source_info,
     enabled, command, args, env, native_skills_dirs, behavior_policy, yolo_id,
     agent_capabilities, auth_methods,
     sort_order, created_at, updated_at)
VALUES
    ('agent_builtin_kun', NULL, '8位MCU Profile',
     'kun', 'acp', 'builtin', '{"binary_name":"kun-acp-adapter","bridge_binary":"bun"}',
     1, 'kun-acp-adapter', '["--stdio"]', '[]',
     '[".kun/skills"]',
     '{"supports_side_question":false,"supports_team":true}',
     NULL,
     NULL, NULL,
     3140,
     unixepoch('now','subsec')*1000, unixepoch('now','subsec')*1000);
