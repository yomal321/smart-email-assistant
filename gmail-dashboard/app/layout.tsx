import type { Metadata } from "next";
import { archivo, archivoNarrow } from "./fonts";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Smart Email Assistant — The Departure Board",
  description: "Your inbox and your life as a station concourse: every message and every task is a scheduled departure with a platform, a time, and a delay figure.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${archivoNarrow.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
