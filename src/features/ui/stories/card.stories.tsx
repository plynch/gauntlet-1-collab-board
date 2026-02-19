import type { Meta, StoryObj } from "@storybook/react";

import {
  Card,
  CardDescription,
  CardTitle,
} from "@/features/ui/components/card";

/**
 * Handles card preview.
 */
function CardPreview() {
  return (
    <Card className="w-[360px] space-y-2">
      <CardTitle>Realtime Canvas</CardTitle>
      <CardDescription>
        A calm, neutral container for collaborative whiteboard controls.
      </CardDescription>
    </Card>
  );
}

const meta = {
  title: "UI/Card",
  component: CardPreview,
} satisfies Meta<typeof CardPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
