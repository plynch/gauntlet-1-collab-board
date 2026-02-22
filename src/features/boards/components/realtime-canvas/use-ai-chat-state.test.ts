import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  isLocalAiHelpCommand,
  useAiChatState,
} from "@/features/boards/components/realtime-canvas/use-ai-chat-state";

describe("use-ai-chat-state", () => {
  it("initializes with assistant welcome message", () => {
    const { result } = renderHook(() =>
      useAiChatState({
        welcomeMessage: "Welcome",
      }),
    );

    expect(result.current.chatMessages).toHaveLength(1);
    expect(result.current.chatMessages[0]).toMatchObject({
      role: "assistant",
      text: "Welcome",
    });
    expect(result.current.chatInput).toBe("");
  });

  it("tracks history and supports up/down keyboard recall without auto-submit", () => {
    const { result } = renderHook(() =>
      useAiChatState({
        welcomeMessage: "Welcome",
      }),
    );

    act(() => {
      result.current.appendUserMessage("create sticky");
      result.current.appendUserMessage("create frame");
    });

    act(() => {
      result.current.handleChatInputChange({
        target: {
          value: "draft input",
        },
      } as never);
    });

    const preventDefault = vi.fn();
    act(() => {
      result.current.handleChatInputKeyDown(
        {
          key: "ArrowUp",
          preventDefault,
        } as never,
        false,
      );
    });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(result.current.chatInput).toBe("create frame");

    act(() => {
      result.current.handleChatInputKeyDown(
        {
          key: "ArrowDown",
          preventDefault,
        } as never,
        false,
      );
    });
    expect(result.current.chatInput).toBe("draft input");
  });

  it("detects local help aliases", () => {
    expect(isLocalAiHelpCommand("/help")).toBe(true);
    expect(isLocalAiHelpCommand("commands")).toBe(true);
    expect(isLocalAiHelpCommand("/?")).toBe(true);
    expect(isLocalAiHelpCommand("create a sticky")).toBe(false);
  });
});
