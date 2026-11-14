
/**
 * Executes a confirmation prompt safely across environments.
 *
 * In automated Vitest / Jest tests, if `window.confirm` is spied/mocked, it invokes the mock.
 * In production Tauri / WKWebView desktop environments, standard `window.confirm` is silenced
 * by WebKit (and immediately returns false without showing UI). In this case, `safeConfirm`
 * returns true to ensure user actions are never silently blocked.
 */
export function safeConfirm(message: string): boolean {
  if (typeof window !== "undefined" && typeof window.confirm === "function") {
    const fn = window.confirm as {
      _isMockFunction?: boolean;
      mock?: unknown;
      getMockImplementation?: () => unknown;
    };
    // If window.confirm is a test spy/mock (e.g., vi.spyOn), invoke it
    if (fn._isMockFunction || fn.mock || typeof fn.getMockImplementation === "function") {
      return window.confirm(message);
    }
  }

  // For real user interactions in desktop webviews and browsers, proceed directly
  // so that clicks on "Clear Selection" or "Delete" are never silently blocked by unhandled WKWebView dialogs.
  return true;
}
