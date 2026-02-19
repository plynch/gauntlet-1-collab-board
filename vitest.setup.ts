import { cleanup } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
});

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string | { pathname?: string };
    children: ReactNode;
    [key: string]: unknown;
  }) =>
    createElement(
      "a",
      {
        href: typeof href === "string" ? href : (href.pathname ?? "#"),
        ...props,
      },
      children,
    ),
}));
