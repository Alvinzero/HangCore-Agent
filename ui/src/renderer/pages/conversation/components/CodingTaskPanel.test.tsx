/**
 * @license
 * Copyright 2025-2026 NomiFun (nomifun.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const readSource = (url: URL) => readFileSync(url, "utf8");

describe("CodingTaskPanel", () => {
  test("renders the empty state, bound task metadata, and Spec/Plan/Tasks tabs", () => {
    const source = readSource(
      new URL("./CodingTaskPanel.tsx", import.meta.url),
    );

    expect(source.includes("conversation.codingTask.empty")).toBe(true);
    expect(source.includes("conversation.codingTask.status")).toBe(true);
    expect(source.includes("conversation.codingTask.profile")).toBe(true);
    expect(source.includes("conversation.codingTask.agent")).toBe(true);
    expect(/key=["']spec["']/.test(source)).toBe(true);
    expect(/key=["']plan["']/.test(source)).toBe(true);
    expect(/key=["']tasks["']/.test(source)).toBe(true);
  });

  test("mounts inside the conversation workspace sidebar without replacing ChatSlider", () => {
    const source = readSource(
      new URL("./ChatConversation.tsx", import.meta.url),
    );

    expect(source.includes("CodingTaskPanel")).toBe(true);
    expect(source.includes("<ChatSlider conversation={conversation} />")).toBe(
      true,
    );
  });
});
