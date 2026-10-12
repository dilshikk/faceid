export type Cell = string | number | boolean | null;
export type BrowseKind = "users" | "logs" | "errors";

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;

// Table names are interpolated into SQL, so only plain identifiers
// ("table" or "schema.table") are ever allowed.
export function isValidTableName(name: string): boolean {
  const parts = name.split(".");
  return parts.length <= 2 && parts.every((part) => IDENTIFIER.test(part));
}

export function quoteTable(name: string): string {
  if (!isValidTableName(name)) {
    throw new Error("Некорректное имя таблицы");
  }
  return name
    .split(".")
    .map((part) => `"${part}"`)
    .join(".");
}

export function splitTable(name: string): {
  schema: string | null;
  table: string;
} {
  const parts = name.split(".");
  return parts.length === 2
    ? { schema: parts[0], table: parts[1] }
    : { schema: null, table: parts[0] };
}

export function quoteColumn(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}
