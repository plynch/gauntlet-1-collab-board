import { notFound } from "next/navigation";

import SwotResizeLab from "@/features/boards/components/swot-resize-lab";

export const dynamic = "force-dynamic";

export default function SwotContainerResizeLabPage() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ENABLE_E2E_LAB !== "1"
  ) {
    notFound();
  }

  return <SwotResizeLab />;
}
