import type { Metadata } from "next";
import { Geist } from "next/font/google";

import { cn } from "@/lib/utils";

import "./globals.css";

const geist = Geist({
  subsets: ["latin", "cyrillic"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: {
    default: "Личная CRM",
    template: "%s · Личная CRM",
  },
  description: "Контакты людей, которых я знаю лично, и заметки о общении с ними",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={cn("font-sans", geist.variable)}>
      <body className="min-h-svh antialiased">
        <div className="mx-auto w-full max-w-3xl px-4 pt-8 pb-16 sm:px-6 sm:pt-12">
          {children}
        </div>
      </body>
    </html>
  );
}
