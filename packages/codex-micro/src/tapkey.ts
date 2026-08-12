// Posts a synthetic keystroke via the compiled tapkey helper; requires the
// Accessibility permission for the daemon's process tree. Isolated from the
// dispatch logic so that logic can be exercised without driving the real
// keyboard.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { KeyCombo } from "./keys.js";

export type KeyMode = "tap" | "down" | "up";

export function postKey(
  combo: KeyCombo,
  mode: KeyMode,
  log: (message: string) => void,
): void {
  const helper = fileURLToPath(new URL("../bin/tapkey", import.meta.url));
  const args = [String(combo.keyCode), mode, String(combo.modifiers)];
  const child = spawn(helper, args, { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (data: Buffer) => (stderr += data.toString("utf8")));
  child.on("close", (status) => {
    if (status !== 0) {
      log(`key ${combo.keyCode} ${mode} failed: ${stderr.trim()}`);
    }
  });
  child.on("error", (error: Error) =>
    log(`tapkey spawn failed: ${error.message}`),
  );
}

// Targets the supplied terminal-pane position only while that terminal owns
// keyboard focus; otherwise the helper falls back to the pointer location.
export function postScroll(
  lines: number,
  xFraction: number,
  yFraction: number,
  windowOwner: string,
  log: (message: string) => void,
): void {
  const helper = fileURLToPath(new URL("../bin/tapkey", import.meta.url));
  const args = [
    "scroll",
    String(lines),
    String(xFraction),
    String(yFraction),
    windowOwner,
  ];
  const child = spawn(helper, args, { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (data: Buffer) => (stderr += data.toString("utf8")));
  child.on("close", (status) => {
    if (status !== 0) {
      log(`scroll ${lines} failed: ${stderr.trim()}`);
    }
  });
  child.on("error", (error: Error) =>
    log(`tapkey scroll spawn failed: ${error.message}`),
  );
}

// Behaves like a physical mouse wheel: macOS routes the event to the window
// beneath the pointer, regardless of which app owns it.
export function postSystemScroll(
  lines: number,
  log: (message: string) => void,
): void {
  const helper = fileURLToPath(new URL("../bin/tapkey", import.meta.url));
  const child = spawn(helper, ["scroll", String(lines)], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (data: Buffer) => (stderr += data.toString("utf8")));
  child.on("close", (status) => {
    if (status !== 0) {
      log(`system scroll ${lines} failed: ${stderr.trim()}`);
    }
  });
  child.on("error", (error: Error) =>
    log(`tapkey system scroll spawn failed: ${error.message}`),
  );
}
