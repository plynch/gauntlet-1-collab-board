import { notFound } from "next/navigation";

import E2eEmulatorLogin from "@/features/auth/components/e2e-emulator-login";

export const dynamic = "force-dynamic";

export default function EmulatorLoginPage() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ENABLE_E2E_LAB !== "1"
  ) {
    notFound();
  }

  return <E2eEmulatorLogin />;
}
