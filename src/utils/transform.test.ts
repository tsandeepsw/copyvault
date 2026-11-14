import { describe, expect, it } from "vitest";
import {
  applyTransform,
  normalizeLineEndings,
  removeDuplicateLines,
  toCamelCase,
  toLowerCase,
  toSnakeCase,
  toTitleCase,
  toUpperCase,
  trimWhitespace,
} from "./transform";

describe("Text Transformations Engine", () => {
  it("trims whitespace correctly across lines", () => {
    const raw = "   Line 1   \n   Line 2   \n\n";
    expect(trimWhitespace(raw)).toBe("Line 1\nLine 2");
  });

  it("converts to UPPERCASE and lowercase", () => {
    expect(toUpperCase("CopyVault v1")).toBe("COPYVAULT V1");
    expect(toLowerCase("CopyVault V1")).toBe("copyvault v1");
  });

  it("converts to Title Case", () => {
    expect(toTitleCase("the quick brown fox")).toBe("The Quick Brown Fox");
    expect(toTitleCase("COPYVAULT CLIPBOARD")).toBe("Copyvault Clipboard");
  });

  it("converts to camelCase", () => {
    expect(toCamelCase("Hello World")).toBe("helloWorld");
    expect(toCamelCase("api_token_key")).toBe("apiTokenKey");
    expect(toCamelCase("user-profile-id")).toBe("userProfileId");
  });

  it("converts to snake_case", () => {
    expect(toSnakeCase("HelloWorld")).toBe("hello_world");
    expect(toSnakeCase("user Profile Name")).toBe("user_profile_name");
    expect(toSnakeCase("auth-header-token")).toBe("auth_header_token");
  });

  it("removes duplicate lines preserving line sequence", () => {
    const input = "apple\nbanana\napple\ncherry\nbanana\ndate";
    expect(removeDuplicateLines(input)).toBe("apple\nbanana\ncherry\ndate");
  });

  it("normalizes Windows CRLF to standard LF", () => {
    const input = "line1\r\nline2\r\nline3\r";
    expect(normalizeLineEndings(input)).toBe("line1\nline2\nline3\n");
  });

  it("applies transforms via applyTransform dispatcher", () => {
    expect(applyTransform("   hello world   ", "trim")).toBe("hello world");
    expect(applyTransform("hello world", "uppercase")).toBe("HELLO WORLD");
    expect(applyTransform("HELLO WORLD", "lowercase")).toBe("hello world");
    expect(applyTransform("hello world", "title_case")).toBe("Hello World");
    expect(applyTransform("hello world", "camel_case")).toBe("helloWorld");
    expect(applyTransform("Hello World", "snake_case")).toBe("hello_world");
    expect(applyTransform("a\nb\na", "remove_duplicate_lines")).toBe("a\nb");
    expect(applyTransform("a\r\nb", "normalize_line_endings")).toBe("a\nb");
  });
});

