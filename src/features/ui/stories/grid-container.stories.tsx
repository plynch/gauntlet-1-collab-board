import type { Meta, StoryObj } from "@storybook/react";
import type { ReactNode } from "react";

import { GridContainer } from "@/features/ui/components/grid-container";

/**
 * Renders board canvas frame around a story.
 */
function CanvasFrame({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "32px",
        backgroundColor: "#e2e8f0",
        backgroundImage:
          "linear-gradient(to right, rgba(148,163,184,0.22) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.22) 1px, transparent 1px)",
        backgroundSize: "40px 40px",
      }}
    >
      <div
        style={{
          width: "min(1200px, 95vw)",
          height: "min(720px, calc(100vh - 96px))",
          margin: "0 auto",
          border: "2px solid #64748b",
          borderRadius: "14px",
          background: "rgba(255,255,255,0.58)",
          padding: "20px",
          boxSizing: "border-box",
          boxShadow: "0 12px 30px rgba(15, 23, 42, 0.16)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

const meta = {
  title: "UI/GridContainer",
  component: GridContainer,
  args: {
    rows: 2,
    cols: 2,
    gap: 2,
    minCellHeight: 120,
  },
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <CanvasFrame>
        <Story />
      </CanvasFrame>
    ),
  ],
} satisfies Meta<typeof GridContainer>;

export default meta;

type Story = StoryObj<typeof meta>;

export const TwoByTwo: Story = {
  args: {
    containerTitle: "SWOT Analysis",
    sectionTitles: ["Strengths", "Weaknesses", "Opportunities", "Threats"],
  },
};

export const ThreeByThreeWithColorPickers: Story = {
  args: {
    rows: 3,
    cols: 3,
    gap: 2,
    minCellHeight: 92,
    showCellColorPickers: true,
    containerTitle: "Planning Matrix",
  },
};
