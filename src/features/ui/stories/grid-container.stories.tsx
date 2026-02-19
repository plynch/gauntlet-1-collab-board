import type { Meta, StoryObj } from "@storybook/react";

import { GridContainer } from "@/features/ui/components/grid-container";

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
