-- Kun's bundled ACP adapter is a TypeScript/Bun bridge. Existing databases
-- created by v0.1.2 only probed `kun-acp-adapter`, which could make the Local
-- Agents UI report Kun as installed even when the adapter would immediately
-- exit with Windows 9009 because `bun` was not available at launch time.
UPDATE agent_metadata
SET agent_source_info = '{"binary_name":"kun-acp-adapter","bridge_binary":"bun"}',
    updated_at = unixepoch('now','subsec')*1000
WHERE id = 'agent_builtin_kun'
  AND agent_source = 'builtin'
  AND (
    agent_source_info IS NULL
    OR agent_source_info NOT LIKE '%"bridge_binary"%'
  );
