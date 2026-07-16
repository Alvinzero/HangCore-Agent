#!/usr/bin/env bun
import { startStdio } from './acpServer';

const VERSION = '0.1.12';

type CliOptions = {
  stdio: boolean;
  baseUrl?: string;
  token?: string;
  model?: string;
  help: boolean;
  version: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { stdio: false, help: false, version: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--stdio') options.stdio = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--version' || arg === '-V') options.version = true;
    else if (arg === '--base-url' || arg === '--runtime-url') options.baseUrl = argv[++i];
    else if (arg.startsWith('--base-url=')) options.baseUrl = arg.slice('--base-url='.length);
    else if (arg.startsWith('--runtime-url=')) options.baseUrl = arg.slice('--runtime-url='.length);
    else if (arg === '--token' || arg === '--runtime-token') options.token = argv[++i];
    else if (arg.startsWith('--token=')) options.token = arg.slice('--token='.length);
    else if (arg.startsWith('--runtime-token=')) options.token = arg.slice('--runtime-token='.length);
    else if (arg === '--model') options.model = argv[++i];
    else if (arg.startsWith('--model=')) options.model = arg.slice('--model='.length);
  }
  return options;
}

const USAGE = `kun-acp-adapter ${VERSION}

Usage:
  kun-acp-adapter --stdio [--runtime-url http://127.0.0.1:18899] [--runtime-token TOKEN]

Environment:
  KUN_RUNTIME_URL    Kun HTTP/SSE runtime URL. Default: http://127.0.0.1:18899
  KUN_RUNTIME_TOKEN  Bearer token for Kun runtime, if Kun was started with one
  KUN_THREAD_MODEL   Kun thread model used when the ACP session creates a Kun thread
  KUN_PROVIDER_ID    NomiFun provider id injected for the selected system model
  KUN_PROVIDER       Provider protocol injected by NomiFun (openai, anthropic, ...)
  KUN_API_KEY        Provider API key injected by NomiFun for Kun runtime startup
  KUN_BASE_URL       Provider base URL injected by NomiFun for Kun runtime startup
  KUN_API_PATH       Provider API path injected by NomiFun for Kun runtime startup
  KUN_PROVIDER_FALLBACK  Set 1 to allow provider-only diagnostic fallback when Kun runtime is unavailable
  KUN_RUNTIME_AUTO_START  Auto-start local Kun runtime when default URL is unreachable. Set 0 to disable
  KUN_SOURCE_DIR          Kun source checkout to use when no global kun command is installed
  KUN_DATA_DIR            Kun runtime data directory. Default: NomiFun data dir/kun-runtime
  KUN_RUNTIME_LOG_DIR     Managed Kun runtime log directory. Default: KUN_DATA_DIR/logs
  KUN_RUNTIME_FOREGROUND  Set 1 to keep managed Kun runtime output attached for debugging
  KUN_RUNTIME_COMMAND     Runtime command for auto-start. Default: discovered Kun source runtime, then kun
  KUN_RUNTIME_ARGS        Runtime args for auto-start. Default: serve --host 127.0.0.1 --port 18899 --data-dir ...
`;

async function main(): Promise<number> {
  const options = parseArgs(process.argv.slice(2));
  if (options.version) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  if (options.help || !options.stdio) {
    process.stdout.write(USAGE);
    return options.help ? 0 : 64;
  }
  await startStdio({
    baseUrl: options.baseUrl,
    runtimeToken: options.token,
    model: options.model,
  });
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    process.stderr.write(`[kun-acp-adapter] ${error instanceof Error ? error.stack || error.message : String(error)}\n`);
    process.exit(70);
  }
);
