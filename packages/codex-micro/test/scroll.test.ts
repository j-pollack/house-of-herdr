import { describe, expect, it, vi } from "vitest";
import { HerdrScroller } from "../src/scroll.js";

function snapshot(agent = "claude") {
  return {
    focused_pane_id: "wA:p1",
    focused_tab_id: "wA:t1",
    focused_workspace_id: "wA",
    panes: [
      {
        pane_id: "wA:p1",
        tab_id: "wA:t1",
        agent,
        scroll: {
          max_offset_from_bottom: agent === "codex" ? 100 : 0,
          offset_from_bottom: 0,
          viewport_rows: 58,
        },
      },
    ],
    layouts: [
      {
        workspace_id: "wA",
        tab_id: "wA:t1",
        focused_pane_id: "wA:p1",
        zoomed: false,
        area: { x: 26, y: 1, width: 189, height: 60 },
        panes: [
          {
            pane_id: "wA:p1",
            focused: true,
            rect: { x: 26, y: 1, width: 95, height: 60 },
          },
        ],
      },
    ],
  };
}

describe("HerdrScroller", () => {
  it("posts native wheel events over Herdr's focused pane", async () => {
    const previousTermProgram = process.env.TERM_PROGRAM;
    process.env.TERM_PROGRAM = "ghostty";
    try {
      const herdr = {
        sessionSnapshot: vi.fn(async () => snapshot()),
        request: vi.fn(async () => ({})),
      };
      const postHostScroll = vi.fn();
      const postFallbackScroll = vi.fn();
      const log = vi.fn();
      const scroller = new HerdrScroller(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        herdr as any,
        log,
        () => 2,
        postHostScroll,
        postFallbackScroll,
      );

      await scroller.scroll("up");
      await scroller.scroll("down");

      expect(postHostScroll.mock.calls).toEqual([
        [2, 73.5 / 215, 31 / 61, "Ghostty", log],
        [-2, 73.5 / 215, 31 / 61, "Ghostty", log],
      ]);
      expect(postFallbackScroll).not.toHaveBeenCalled();
      expect(herdr.request).not.toHaveBeenCalled();
    } finally {
      if (previousTermProgram === undefined) delete process.env.TERM_PROGRAM;
      else process.env.TERM_PROGRAM = previousTermProgram;
    }
  });

  it("targets an ordinary focused Herdr shell pane too", async () => {
    const previousTermProgram = process.env.TERM_PROGRAM;
    process.env.TERM_PROGRAM = "ghostty";
    try {
      const herdr = {
        sessionSnapshot: vi.fn(async () => snapshot("")),
        request: vi.fn(async () => ({})),
      };
      const postHostScroll = vi.fn();
      const scroller = new HerdrScroller(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        herdr as any,
        vi.fn(),
        () => 1,
        postHostScroll,
      );

      await scroller.scroll("up");

      expect(postHostScroll).toHaveBeenCalledWith(
        1,
        73.5 / 215,
        31 / 61,
        "Ghostty",
        expect.any(Function),
      );
      expect(herdr.request).not.toHaveBeenCalled();
    } finally {
      if (previousTermProgram === undefined) delete process.env.TERM_PROGRAM;
      else process.env.TERM_PROGRAM = previousTermProgram;
    }
  });

  it("falls back to system scrolling without pane geometry", async () => {
    const herdr = {
      sessionSnapshot: vi.fn(async () => ({ ...snapshot(), layouts: [] })),
      request: vi.fn(async () => ({})),
    };
    const postFallbackScroll = vi.fn();
    const log = vi.fn();
    const scroller = new HerdrScroller(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      herdr as any,
      log,
      () => 2,
      vi.fn(),
      postFallbackScroll,
    );

    await scroller.scroll("down");

    expect(postFallbackScroll).toHaveBeenCalledWith(-2, log);
  });
});
