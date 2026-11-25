import { BackLink } from "@/components/back-link";

export default function GroupNotFound() {
  return (
    <main className="flex flex-col gap-6">
      <BackLink href="/groups">Все группы</BackLink>
      <h1 className="text-title font-medium">Группа не найдена</h1>
    </main>
  );
}
