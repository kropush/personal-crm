"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-col items-center gap-4 py-20 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="text-title font-medium text-balance">
          Не получилось загрузить данные
        </h1>
        <p className="max-w-md text-balance text-muted-foreground">
          Скорее всего, не запущена база данных. Запустите её командой{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-foreground">
            docker compose up -d
          </code>{" "}
          и попробуйте ещё раз.
        </p>
      </div>
      <Button size="lg" onClick={() => retry()}>
        Попробовать ещё раз
      </Button>
    </main>
  );
}
