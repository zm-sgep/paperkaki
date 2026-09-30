import type { Metadata } from "next";
import type { ReactNode } from "react";
// Fonts are installed from npm and served by this app: nothing is loaded from another site.
import "@fontsource-variable/plus-jakarta-sans/wght.css";
import "@fontsource-variable/nunito/wght.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "PaperKaki",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-SG">
      <body>{children}</body>
    </html>
  );
}
