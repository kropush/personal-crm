import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export default function ContactNotFound() {
  return (
    <main className="flex flex-col items-center gap-4 py-20 text-center">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Контакт не найден
        </h1>
        <p className="text-balance text-muted-foreground">
          Такого контакта нет. Возможно, в адресе опечатка.
        </p>
      </div>
      <Link href="/" className={buttonVariants({ size: "lg", className: "px-3.5" })}>
        К списку контактов
      </Link>
    </main>
  );
}
