import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export default function ContactNotFound() {
  return (
    <main className="flex flex-col items-center gap-4 py-20 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="text-title font-medium text-balance">
          Контакт не найден
        </h1>
        <p className="text-balance text-muted-foreground">
          Такого контакта нет. Возможно, в адресе опечатка.
        </p>
      </div>
      <Link href="/" className={buttonVariants({ size: "lg" })}>
        К списку контактов
      </Link>
    </main>
  );
}
