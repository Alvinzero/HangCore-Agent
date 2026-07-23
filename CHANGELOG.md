# Changelog

NomiFun is pre-1.0. Until the first public release, this file records release
notes at a high level rather than a complete historical log.

## Unreleased

## v0.1.16 - 2026-07-23

- Updated the desktop updater so one approved update automatically downloads, installs, and restarts the application without a second install confirmation.
- Embedded the managed Kun runtime as one verified compressed archive in Windows release builds instead of shipping thousands of individual runtime files, reducing NSIS extraction overhead.
- Added an atomic, content-addressed runtime cache with a file lock, checksum, entrypoint validation, and background prewarming so later launches reuse the extracted runtime.

## v0.1.15 - 2026-07-22

- Consolidated the recent Kun interaction, Chinese reasoning, workspace delivery, updater, managed runtime, and Windows install identity fixes onto the main release line.
- Removed unused desktop companion, resource card, intelligent orchestration, and CodingTask surfaces from the main workbench UI while keeping the underlying settings/runtime capabilities intact.
- Kept the GitHub Actions Windows release path producing the Tauri updater assets: `.exe`, `.exe.sig`, and `latest.json`.

## v0.1.13 - 2026-07-18

- Required all built-in and newly added Agents to save generated code and document deliverables into the active workspace so the files appear in the conversation workspace panel.
- Strengthened Chinese output constraints for the 8位MCU Profile's visible Kun reasoning stream while preserving the native Kun runtime loop.
- Reduced managed Kun runtime package clutter to improve Windows package extraction and installation time without removing runtime entry files.
- Removed the automatic-update disclaimer from the update dialog.
- Migrated legacy `HangCore Agent` Windows installs, shortcuts, and startup entries to `HK AI Platform` while preserving model settings, API keys, conversations, and workspace data.

## v0.1.12 - 2026-07-16

- Fixed the ACP stdio deadlock that prevented NomiFun from delivering user-input responses while a native Kun prompt was still running.
- Fixed completed Kun `user_input` tool-call updates being misread as new requests, which caused duplicate cards and temporary-ID 404 errors.
- Added multi-step interaction regression coverage and kept the visible waiting state for native Kun reasoning/output.

## v0.1.10 - 2026-07-06

- Added the CodingTask + SpecArtifact MVP: durable `coding_tasks` and
  `spec_artifacts` records, conversation/workspace/Agent bindings, and
  structured Spec / Plan / Tasks artifacts.
- Added authenticated `/api/coding-tasks` routes with repository and app E2E
  coverage for task creation, listing, lookup, artifact upsert/list, and
  conversation binding.
- Added a compact conversation-sidebar CodingTask panel for creating a bound
  task and manually saving Spec / Plan / Tasks without changing the existing
  8位MCU Profile / Kun runtime loop.
- Kept MCU compilation, flashing, automatic repair, and 32-bit profile work out
  of this release; those remain follow-up stages.

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
