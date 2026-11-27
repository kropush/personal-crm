import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Вход" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 rounded-card bg-card p-6 shadow-card sm:p-8">
      <h1 className="text-title font-medium">Вход</h1>
      <Suspense fallback={<Skeleton className="h-24 w-full rounded-card" />}>
        <LoginContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function LoginContent({
  searchParams,
}: {
  searchParams: PageProps<"/login">["searchParams"];
}) {
  if ((await searchParams).expired !== "1") return <LoginForm />;
  return (
    <div className="flex flex-col items-start gap-4">
      <p>Ссылка устарела, запроси новую</p>
      <Link href="/login" className={buttonVariants({ size: "lg" })}>
        На страницу входа
      </Link>
    </div>
  );
}
