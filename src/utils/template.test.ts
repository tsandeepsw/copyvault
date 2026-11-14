import { describe, expect, it } from "vitest";
import { expandTemplate, extractPlaceholders } from "./template";

describe("Snippet Template Placeholder Expander", () => {
  it("extracts placeholders from template syntax", () => {
    const tpl = "Hello {{name}}, order {{order_id}} scheduled for {{date}} at {time}!";
    const vars = extractPlaceholders(tpl);
    expect(vars).toContain("name");
    expect(vars).toContain("order_id");
    expect(vars).toContain("date");
    expect(vars).toContain("time");
  });

  it("expands built-in date, time, and clipboard placeholders", () => {
    const tpl = "Captured: {{date}} {{time}} - Copied: {{clipboard}}";
    const expanded = expandTemplate(tpl, {}, "https://github.com");

    const todayIso = new Date().toISOString().slice(0, 10);
    expect(expanded).toContain(todayIso);
    expect(expanded).toContain("Copied: https://github.com");
  });

  it("replaces custom user variable placeholders", () => {
    const tpl = "Hi {{name}}, your balance is {{amount}}.";
    const expanded = expandTemplate(tpl, { name: "Alice", amount: "$150" });
    expect(expanded).toBe("Hi Alice, your balance is $150.");
  });

  it("leaves unsupplied placeholders intact without crashing", () => {
    const tpl = "Hi {{name}}, token {{token}}.";
    const expanded = expandTemplate(tpl, { name: "Bob" });
    expect(expanded).toBe("Hi Bob, token {{token}}.");
  });
});

