/**
 * Extracts all unique placeholder variable names from a template string.
 * Supports both {{variable}} and {variable} syntax.
 */
export function extractPlaceholders(template: string): string[] {
  const matches = template.match(/\{\{?([a-zA-Z0-9_-]+)\}?\}/g) || [];
  const set = new Set<string>();

  for (const m of matches) {
    const clean = m.replace(/^\{+/, "").replace(/\}+$/, "").trim();
    if (clean) {
      set.add(clean);
    }
  }

  return Array.from(set);
}

/**
 * Expands placeholders within a template string.
 * Automatically resolves built-in variables ('date', 'time', 'clipboard')
 * and replaces user variables from the supplied map.
 */
export function expandTemplate(
  template: string,
  userValues: Record<string, string> = {},
  clipboardText = ""
): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const dateStr = `${year}-${month}-${day}`;

  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const timeStr = `${hours}:${minutes}`;

  return template.replace(/\{\{?([a-zA-Z0-9_-]+)\}?\}/g, (match, key: string) => {
    const lowerKey = key.toLowerCase();
    if (lowerKey === "date") return dateStr;
    if (lowerKey === "time") return timeStr;
    if (lowerKey === "clipboard") return clipboardText;

    if (Object.prototype.hasOwnProperty.call(userValues, key)) {
      return userValues[key];
    }
    if (Object.prototype.hasOwnProperty.call(userValues, lowerKey)) {
      return userValues[lowerKey];
    }

    return match; // Keep unresolved placeholder intact
  });
}

