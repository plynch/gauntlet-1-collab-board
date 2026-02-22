import { notFound } from "next/navigation";

import ContainerMembershipLab from "@/features/boards/components/container-membership-lab";

export const dynamic = "force-dynamic";

export default function ContainerMembershipLabPage() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ENABLE_E2E_LAB !== "1"
  ) {
    notFound();
  }

  return <ContainerMembershipLab />;
}
