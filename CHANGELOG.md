# Changelog

NomiFun is pre-1.0. Until the first public release, this file records release
notes at a high level rather than a complete historical log.

## Unreleased

## v0.1.9 - 2026-07-06

- Renamed the user-facing Kun-backed local agent to `8位MCU Profile`.
- Kept the stable `backend = "kun"`, `agent_builtin_kun`, `kun-acp-adapter`,
  and managed Kun runtime loop so existing conversations and runtime behavior
  continue to work.
- Added a database migration for existing installs and updated Windows release
  defaults for the `v0.1.9` package.

## v0.1.8 - 2026-07-06

- Bundle a managed Kun runtime for Windows packages so 8位MCU Profile no longer
  requires a globally installed `kun` command on clean user machines.
- Prefer the managed runtime during adapter auto-start while preserving
  `KUN_SOURCE_DIR`, custom runtime command, and global `kun` overrides.
- Fix the default Windows Kun runtime data directory to use
  `%LOCALAPPDATA%\NomiFun\Nomi\kun-runtime` instead of a macOS-style path.

## v0.1.6 - 2026-07-03

- Corrected 8位MCU Profile to require the native Kun runtime by default. Provider-only
  fallback is now an explicit diagnostic path gated by `KUN_PROVIDER_FALLBACK=1`.
- Added source-runtime auto-start for local Kun checkouts so HangCore can start
  the real Kun agent loop even when no global `kun` command is installed.
- Reused system model provider settings for the Kun runtime startup path while
  keeping secrets redacted from adapter startup errors.
- Improved streaming latency for CRLF-delimited SSE frames, reducing cases where
  Windows/Node streams buffer output until the connection closes.

## v0.1.13 - 2026-07-01

- Improved orchestration reliability and control: DAG node pre-configuration,
  per-node model selection, explicit in-conversation approval before execution,
  and fixes for broken DAG lines, orphaned running nodes, one-node planning, and
  blank pending states.
- Added graceful handling for providers/models that do not support image input:
  image capability tracking, proactive image removal, retry without interrupting
  the conversation, and a visible in-conversation notice.
- Expanded browser-use controls with silent mode defaults, managed/system
  browser source selection, persistent encrypted browser login, a one-click
  browser login action, and screenshot context for silent approvals.
- Fixed WebUI credential persistence across restarts and added per-model context
  window configuration.
- Polished updater error handling, local update test clients, README screenshots,
  provider quick links, and contact assets.
- Packaging note: this Mac-side release publishes macOS installer and updater
  assets. Windows and Linux packages must be added later from their native build
  machines.

## v0.1.12 - 2026-07-01

- Documentation overhaul for public website and open-source preparation.
- Clarified desktop, web, remote access, AutoWork, scheduled tasks, and
  packaging documentation.
- Removed proprietary PDF skill assets from the bundled built-in skills.

## Release Note Policy

Every public release should include:

- User-facing changes.
- Breaking configuration or data migration notes.
- Security-relevant changes.
- Packaging and updater notes.
- Known limitations.

Use calendar dates or semantic versions consistently once public releases
begin.
