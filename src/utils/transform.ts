import { TextTransformType } from "../types/clipboard";

/**
 * Trims leading and trailing whitespace from the text and each line.
 */
export function trimWhitespace(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .join("\n")
    .trim();
}

/**
 * Converts text to UPPERCASE.
 */
export function toUpperCase(text: string): string {
  return text.toUpperCase();
}

/**
 * Converts text to lowercase.
 */
export function toLowerCase(text: string): string {
  return text.toLowerCase();
}

/**
 * Converts words in text to Title Case.
 */
export function toTitleCase(text: string): string {
  return text.replace(
    /\w\S*/g,
    (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase()
  );
}

/**
 * Converts text to camelCase.
 */
export function toCamelCase(text: string): string {
  const words = text
    .replace(/[^\w\s-]/g, "")
    .trim()
    .split(/[\s_-]+/);
  if (words.length === 0 || !words[0]) return "";
  return (
    words[0].toLowerCase() +
    words
      .slice(1)
      .map((w) => w.charAt(0).toUpperCase() + w.substring(1).toLowerCase())
      .join("")
  );
}

/**
 * Converts text to snake_case.
 */
export function toSnakeCase(text: string): string {
  return text
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w_]/g, "")
    .toLowerCase();
}

/**
 * Removes duplicate lines while strictly preserving first-occurrence order.
 */
export function removeDuplicateLines(text: string): string {
  const lines = text.split(/\r?\n/);
  const seen = new Set<string>();
  const uniqueLines: string[] = [];

  for (const line of lines) {
    if (!seen.has(line)) {
      seen.add(line);
      uniqueLines.push(line);
    }
  }

  return uniqueLines.join("\n");
}

/**
 * Normalizes all line endings to standard Unix line feeds (\n).
 */
export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/**
 * Dispatches a text transformation by identifier.
 */
export function applyTransform(text: string, transformType: TextTransformType): string {
  switch (transformType) {
    case "trim":
      return trimWhitespace(text);
    case "uppercase":
      return toUpperCase(text);
    case "lowercase":
      return toLowerCase(text);
    case "title_case":
      return toTitleCase(text);
    case "camel_case":
      return toCamelCase(text);
    case "snake_case":
      return toSnakeCase(text);
    case "remove_duplicate_lines":
      return removeDuplicateLines(text);
    case "normalize_line_endings":
      return normalizeLineEndings(text);
    default:
      return text;
  }
}

