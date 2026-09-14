import { Plus_Jakarta_Sans } from "next/font/google";

// Self-hosted at build time by next/font — no runtime Google CDN calls.
export const archivo = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

export const archivoNarrow = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-narrow",
  display: "swap",
});
