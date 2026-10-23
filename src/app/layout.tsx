import type { Metadata, Viewport } from "next";
import { Inter_Tight, JetBrains_Mono } from "next/font/google";

import { AppHeader } from "@/components/app-header";
import { cn } from "@/lib/utils";

import "./globals.css";

const interTight = Inter_Tight({
  subsets: ["latin", "cyrillic"],
  variable: "--font-inter-tight",
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin", "cyrillic"],
  variable: "--font-jetbrains-mono",
});

// Same as on the landing page
const description =
  "Все контакты и заметки в одном месте: открыл, нашел человека, вспомнил, о чем договорились.";

export const metadata: Metadata = {
  // Link previews need absolute URLs, e.g. for opengraph-image
  metadataBase: new URL("https://app.kropcrm.ru"),
  title: {
    default: "Личная CRM",
    template: "%s · Личная CRM",
  },
  description,
  // Link preview. Pages set only their own title, so a contact's name never gets into it
  openGraph: {
    type: "website",
    locale: "ru_RU",
    siteName: "Личная CRM",
    title: "Личная CRM",
    description,
  },
  twitter: {
    card: "summary_large_image",
  },
};

export const viewport: Viewport = {
  // The browser bar matches the dark header (--color-night)
  themeColor: "#08081a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ru"
      className={cn("font-sans", interTight.variable, jetBrainsMono.variable)}
    >
      <body className="min-h-svh antialiased">
        <AppHeader />
        <div className="mx-auto w-full max-w-3xl px-4 pt-8 pb-16 sm:px-6 sm:pt-10">
          {children}
        </div>
      </body>
    </html>
  );
}
