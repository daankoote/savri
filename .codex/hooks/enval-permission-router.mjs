#!/usr/bin/env node

import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { CLASSIFICATION, classifyScript } from "./command-classifier.mjs";
import { handleResultHook } from "../../scripts/tools/enval-result.mjs";

export const HUMAN_GATE_MESSAGE = [
  "HUMAN_GATE",
  "Do not retry or bypass.",
  "Stop the bounded batch and report the exact requested action.",
].join("\n");

function readEvent(input = process.stdin) {
  return new Promise((resolveInput, rejectInput) => {
    let raw = "";
    input.setEncoding("utf8");
    input.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 65_536) rejectInput(new Error("hook_input_too_large"));
    });
    input.on("end", () => {
      try {
        resolveInput(JSON.parse(raw));
      } catch {
        rejectInput(new Error("hook_input_invalid"));
      }
    });
    input.on("error", rejectInput);
  });
}

function commandHash(command) {
  return createHash("sha256").update(command).digest("hex");
}

function record(eventName, classified, command) {
  try {
    const directory = join(tmpdir(), "enval-codex-hooks");
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const entry = {
      at: new Date().toISOString(),
      event: eventName,
      classification: classified.classification,
      reason: classified.reason,
      command_hash: commandHash(command),
    };
    appendFileSync(
      join(directory, "permission-router.jsonl"),
      `${JSON.stringify(entry)}\n`,
      {
        encoding: "utf8",
        mode: 0o600,
      },
    );
  } catch {
    // Observability failure must not weaken or break the permission decision.
  }
}

export function routeEvent(event, options = {}) {
  const eventName = event?.hook_event_name;
  if (
    ["UserPromptSubmit", "Stop", "Interrupt", "SessionEnd"].includes(
      eventName,
    )
  ) {
    handleResultHook(event, options);
    return {
      output: null,
      classification: CLASSIFICATION.DEFER,
      reason: "RESULT_LIFECYCLE",
    };
  }
  const command = event?.tool_input?.command;
  if (event?.tool_name !== "Bash" || typeof command !== "string") {
    return {
      output: null,
      classification: CLASSIFICATION.DEFER,
      reason: "INVALID_EVENT",
    };
  }
  const classified = classifyScript(command, { cwd: event.cwd });
  record(eventName, classified, command);

  if (
    eventName === "PreToolUse" &&
    classified.classification === CLASSIFICATION.DENY
  ) {
    handleResultHook(
      { ...event, hook_event_name: "Interrupt" },
      { ...options, terminalStatus: "HUMAN_GATE" },
    );
    return {
      classification: classified.classification,
      reason: classified.reason,
      output: {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: HUMAN_GATE_MESSAGE,
        },
      },
    };
  }
  if (
    eventName === "PermissionRequest" &&
    classified.classification === CLASSIFICATION.ALLOW
  ) {
    return {
      classification: classified.classification,
      reason: classified.reason,
      output: {
        hookSpecificOutput: {
          hookEventName: "PermissionRequest",
          decision: { behavior: "allow" },
        },
      },
    };
  }
  if (
    eventName === "PermissionRequest" &&
    classified.classification === CLASSIFICATION.DENY
  ) {
    handleResultHook(
      { ...event, hook_event_name: "Interrupt" },
      { ...options, terminalStatus: "HUMAN_GATE" },
    );
    return {
      classification: classified.classification,
      reason: classified.reason,
      output: {
        hookSpecificOutput: {
          hookEventName: "PermissionRequest",
          decision: { behavior: "deny", message: HUMAN_GATE_MESSAGE },
        },
      },
    };
  }
  return {
    output: null,
    classification: classified.classification,
    reason: classified.reason,
  };
}

export async function main() {
  try {
    const routed = routeEvent(await readEvent());
    if (routed.output !== null) {
      process.stdout.write(`${JSON.stringify(routed.output)}\n`);
    }
    return 0;
  } catch {
    process.stderr.write("ENVAL_RESULT_PUBLICATION=FAIL\n");
    return 2;
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) process.exitCode = await main();
