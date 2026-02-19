import type { Meta, StoryObj } from "@storybook/react";

import { Button } from "@/features/ui/components/button";

const meta = {
  title: "UI/Button",
  component: Button,
  args: {
    children: "Create board",
  },
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    variant: "primary",
  },
};

export const Success: Story = {
  args: {
    variant: "success",
  },
};

export const Outline: Story = {
  args: {
    variant: "outline",
  },
};
