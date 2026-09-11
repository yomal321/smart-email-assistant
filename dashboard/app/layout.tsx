import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { AppStateProvider } from "@/components/AppStateProvider";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { CommandPalette } from "@/components/CommandPalette";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Smart Email Assistant",
  description: "Triaged inbox, action items, and draft review — prototype",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${plusJakarta.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <AppStateProvider>
          <div className="flex min-h-full flex-1">
            <Sidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              <TopBar />
              <main className="min-w-0 flex-1">{children}</main>
            </div>
          </div>
          <CommandPalette />
        </AppStateProvider>
      </body>
    </html>
  );
}
