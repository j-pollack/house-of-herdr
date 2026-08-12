// In Herdr, route native wheel events to the center of its keyboard-focused
// pane. Outside the terminal, the native helper falls back to the pointer so
// scroll mode keeps behaving like an ordinary system wheel.
import type { HerdrClient, SessionSnapshot } from "./herdr.js";
import {
  postScroll,
  postSystemScroll,
  type ScrollOperation,
} from "./tapkey.js";

export type ScrollDirection = "up" | "down";

const REVERSAL_BRAKE_MS = 120;

export interface ScrollController {
  scroll(direction: ScrollDirection): Promise<void> | void;
  stop(): void;
}

interface PaneTarget {
  windowX: number;
  windowY: number;
}

type PostHostScroll = typeof postScroll;
type PostFallbackScroll = typeof postSystemScroll;

const WINDOW_OWNERS: Record<string, string> = {
  ghostty: "Ghostty",
  "iterm.app": "iTerm2",
  apple_terminal: "Terminal",
  wezterm: "WezTerm",
  kitty: "kitty",
  alacritty: "Alacritty",
};

function terminalWindowOwner(): string | null {
  return WINDOW_OWNERS[(process.env.TERM_PROGRAM ?? "").toLowerCase()] ?? null;
}

function focusedTarget(snapshot: SessionSnapshot): PaneTarget | null {
  const paneId = snapshot.focused_pane_id;
  if (!paneId) return null;
  const pane = snapshot.panes.find((candidate) => candidate.pane_id === paneId);
  if (!pane?.tab_id) return null;
  const layout = snapshot.layouts.find(
    (candidate) => candidate.tab_id === pane.tab_id,
  );
  const placement = layout?.panes.find(
    (candidate) => candidate.pane_id === paneId,
  );
  if (!layout || !placement) return null;

  const totalCols = layout.area.x + layout.area.width;
  const totalRows = layout.area.y + layout.area.height;
  if (totalCols < 1 || totalRows < 1) return null;
  return {
    // The native helper maps these outer-terminal cell fractions onto the
    // terminal window and commits the pointer move before scrolling, which
    // Ghostty needs to route the wheel gesture to the virtual pane.
    windowX: (placement.rect.x + placement.rect.width / 2) / totalCols,
    windowY: (placement.rect.y + placement.rect.height / 2) / totalRows,
  };
}

export class HerdrScroller implements ScrollController {
  private generation = 0;
  private queue: Promise<void> = Promise.resolve();
  private direction: ScrollDirection | null = null;
  private active = new Set<ScrollOperation>();
  private pending = new Set<object>();
  private brakeUntil = 0;

  constructor(
    private herdr: HerdrClient,
    private log: (message: string) => void,
    private stepsPerTick: () => number = () => 1,
    private postHostScroll: PostHostScroll = postScroll,
    private postFallbackScroll: PostFallbackScroll = postSystemScroll,
    private now: () => number = Date.now,
  ) {}

  scroll(direction: ScrollDirection): Promise<void> {
    const now = this.now();
    if (now < this.brakeUntil) return Promise.resolve();
    this.brakeUntil = 0;

    if (
      this.direction !== null &&
      direction !== this.direction &&
      this.pending.size > 0
    ) {
      this.cancelBufferedScroll();
      this.direction = direction;
      this.brakeUntil = now + REVERSAL_BRAKE_MS;
      return Promise.resolve();
    }
    this.direction = direction;
    const tick = {};
    this.pending.add(tick);
    const generation = this.generation;
    const run = this.queue
      .catch(() => {})
      .then(async () => {
        if (generation !== this.generation) return;
        const target = focusedTarget(await this.herdr.sessionSnapshot());
        if (generation !== this.generation) return;
        const lines = (direction === "up" ? 1 : -1) * this.stepsPerTick();
        const owner = terminalWindowOwner();
        let operation: ScrollOperation;
        if (target && owner) {
          operation = this.postHostScroll(
            lines,
            target.windowX,
            target.windowY,
            owner,
            this.log,
          );
        } else {
          operation = this.postFallbackScroll(lines, this.log);
        }
        if (generation !== this.generation) {
          operation.cancel();
          return;
        }
        this.active.add(operation);
        try {
          await operation.done;
        } finally {
          this.active.delete(operation);
        }
      });
    this.queue = run
      .catch((error: Error) => {
        this.log(`focus-aware scroll failed: ${error.message}`);
      })
      .finally(() => this.pending.delete(tick));
    return this.queue;
  }

  // Invalidates a snapshot lookup already in flight when the user leaves
  // scroll mode or the device disconnects.
  stop(): void {
    this.cancelBufferedScroll();
    this.direction = null;
    this.brakeUntil = 0;
  }

  private cancelBufferedScroll(): void {
    this.generation += 1;
    this.queue = Promise.resolve();
    for (const operation of this.active) operation.cancel();
    this.active.clear();
    this.pending.clear();
  }
}
