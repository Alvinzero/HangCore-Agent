-- Product rename: the user-facing Kun-backed builtin agent is now the
-- 8-bit MCU profile. Keep backend/id/command stable so existing conversations
-- and the native Kun runtime bridge keep working.
UPDATE agent_metadata
SET name = '8位MCU Profile',
    updated_at = unixepoch('now','subsec')*1000
WHERE id = 'agent_builtin_kun'
  AND agent_source = 'builtin'
  AND name = 'Kun Agent';
