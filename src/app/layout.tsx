import type { Metadata, Viewport } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Panel Slots",
  description: "Interview panel scheduling and slot allocation",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets the tab bar reach under the home indicator on notched phones; the
  // safe-area insets in the CSS keep its buttons clear of it.
  viewportFit: "cover",
  // Tints the phone's browser bar to match the header.
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
