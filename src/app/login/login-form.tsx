"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { requestLoginAction } from "./actions";

export function LoginForm() {
  const [notice, action, pending] = useActionState(requestLoginAction, null, "/login");
  const invalid = notice?.status === "invalid";

  return (
    <form
      action={action}
      noValidate
      aria-busy={pending}
      className="flex flex-col items-start gap-4"
    >
      <div className="flex w-full flex-col gap-2">
        <Label htmlFor="email">Почта</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          aria-invalid={invalid}
          aria-describedby={invalid ? "login-notice" : undefined}
        />
        {notice && (
          <p
            id="login-notice"
            role={notice.status === "sent" ? "status" : "alert"}
            className={notice.status === "sent" ? "text-sm" : "text-sm text-destructive"}
          >
            {notice.message}
          </p>
        )}
      </div>
      <Button type="submit" size="lg" disabled={pending}>
        Получить ссылку
      </Button>
    </form>
  );
}
