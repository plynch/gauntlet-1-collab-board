import { notFound } from "next/navigation";

import ConnectorRoutingLab from "@/features/boards/components/connector-routing-lab";

export const dynamic = "force-dynamic";

export default function ConnectorRoutingLabPage() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ENABLE_E2E_LAB !== "1"
  ) {
    notFound();
  }

  return <ConnectorRoutingLab />;
}
