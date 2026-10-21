import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Страница не найдена",
};

export default function NotFound() {
  return (
    <main className="flex flex-col items-center gap-4 py-20 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="text-title font-medium text-balance">
          Такой страницы нет
        </h1>
        <p className="text-balance text-muted-foreground">
          Возможно, ссылка устарела или в адресе опечатка.
        </p>
      </div>
      <Link href="/" className={buttonVariants({ size: "lg" })}>
        К списку контактов
      </Link>
    </main>
  );
}
