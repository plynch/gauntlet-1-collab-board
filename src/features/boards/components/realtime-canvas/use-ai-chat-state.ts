"use client";

import {
  useCallback,
  useRef,
  useState,
  type ChangeEvent as ReactChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import type { ChatMessage } from "@/features/boards/components/realtime-canvas/ai-chat-content";

const DEFAULT_MAX_CHAT_HISTORY = 50;

function createChatMessageId(prefix: "u" | "a"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function isLocalAiHelpCommand(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return (
    normalized === "/help" ||
    normalized === "/commands" ||
    normalized === "help" ||
    normalized === "commands" ||
    normalized === "/?"
  );
}

type UseAiChatStateInput = {
  welcomeMessage: string;
  maxHistory?: number;
};

type UseAiChatStateResult = {
  chatMessages: ChatMessage[];
  chatInput: string;
  appendUserMessage: (message: string) => void;
  appendAssistantMessage: (message: string) => void;
  clearChatInputForSubmit: () => void;
  resetHistoryNavigation: () => void;
  handleChatInputChange: (event: ReactChangeEvent<HTMLInputElement>) => void;
  handleChatInputKeyDown: (
    event: ReactKeyboardEvent<HTMLInputElement>,
    isSubmitting: boolean,
  ) => void;
};

export function useAiChatState(
  input: UseAiChatStateInput,
): UseAiChatStateResult {
  const maxHistory = input.maxHistory ?? DEFAULT_MAX_CHAT_HISTORY;
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => [
    {
      id: createChatMessageId("a"),
      role: "assistant",
      text: input.welcomeMessage,
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatInputHistory, setChatInputHistory] = useState<string[]>([]);
  const [chatInputHistoryIndex, setChatInputHistoryIndex] = useState(-1);
  const chatInputHistoryDraftRef = useRef("");

  const appendUserMessage = useCallback(
    (message: string) => {
      setChatMessages((previous) => [
        ...previous,
        {
          id: createChatMessageId("u"),
          role: "user",
          text: message,
        },
      ]);

      setChatInputHistory((previous) => {
        const filtered = previous.filter((item) => item !== message);
        filtered.push(message);
        return filtered.slice(-maxHistory);
      });
      setChatInputHistoryIndex(-1);
      chatInputHistoryDraftRef.current = "";
    },
    [maxHistory],
  );

  const appendAssistantMessage = useCallback((message: string) => {
    setChatMessages((previous) => [
      ...previous,
      {
        id: createChatMessageId("a"),
        role: "assistant",
        text: message,
      },
    ]);
  }, []);

  const clearChatInputForSubmit = useCallback(() => {
    setChatInput("");
    setChatInputHistoryIndex(-1);
    chatInputHistoryDraftRef.current = "";
  }, []);

  const resetHistoryNavigation = useCallback(() => {
    setChatInputHistoryIndex(-1);
    chatInputHistoryDraftRef.current = "";
  }, []);

  const handleChatInputChange = useCallback(
    (event: ReactChangeEvent<HTMLInputElement>) => {
      setChatInput(event.target.value);
      setChatInputHistoryIndex(-1);
      chatInputHistoryDraftRef.current = event.target.value;
    },
    [],
  );

  const handleChatInputKeyDown = useCallback(
    (
      event: ReactKeyboardEvent<HTMLInputElement>,
      isSubmitting: boolean,
    ): void => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
        return;
      }

      if (chatInputHistory.length === 0 || isSubmitting) {
        return;
      }

      event.preventDefault();

      if (event.key === "ArrowUp") {
        const nextIndex =
          chatInputHistoryIndex < 0
            ? chatInputHistory.length - 1
            : Math.max(0, chatInputHistoryIndex - 1);

        if (chatInputHistoryIndex < 0) {
          chatInputHistoryDraftRef.current = chatInput;
        }

        setChatInputHistoryIndex(nextIndex);
        setChatInput(chatInputHistory[nextIndex] ?? "");
        return;
      }

      if (chatInputHistoryIndex < 0) {
        return;
      }

      if (chatInputHistoryIndex >= chatInputHistory.length - 1) {
        setChatInputHistoryIndex(-1);
        setChatInput(chatInputHistoryDraftRef.current);
        return;
      }

      const nextIndex = chatInputHistoryIndex + 1;
      setChatInputHistoryIndex(nextIndex);
      setChatInput(chatInputHistory[nextIndex] ?? "");
    },
    [chatInput, chatInputHistory, chatInputHistoryIndex],
  );

  return {
    chatMessages,
    chatInput,
    appendUserMessage,
    appendAssistantMessage,
    clearChatInputForSubmit,
    resetHistoryNavigation,
    handleChatInputChange,
    handleChatInputKeyDown,
  };
}
