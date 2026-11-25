export function firstValue(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export function contactListHref(query: string, groupId: string | number = "") {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (groupId) params.set("group", String(groupId));
  const search = params.toString();
  return search ? `/?${search}` : "/";
}
