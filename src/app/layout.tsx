import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/features/theme/theme-provider";

export const metadata: Metadata = {
  title: "CollabBoard",
  description: "Real-time collaborative whiteboard MVP",
};

type RootLayoutProps = Readonly<{
  children: React.ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
