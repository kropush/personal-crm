import { formatNumber, pluralize } from "@/lib/format";

const contactForms = { one: "контакт", few: "контакта", many: "контактов" };

export function ContactCount({ total, found }: { total: number; found?: number }) {
  return (
    <p
      className="font-mono text-label tracking-label text-muted-foreground uppercase"
      aria-live="polite"
    >
      {found === undefined
        ? `${formatNumber(total)} ${pluralize(total, contactForms)}`
        : `Найдено: ${formatNumber(found)} из ${formatNumber(total)}`}
    </p>
  );
}
