import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, createEvent, act, within, waitFor } from "@testing-library/react";
import App from "./App.tsx";

describe("CopyVault Polished Interface", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the main desktop layout with navigation and main landmarks", async () => {
    await act(async () => {
      render(<App />);
    });

    expect(screen.getByRole("navigation", { name: /vault navigation/i })).toBeDefined();
    expect(screen.getByRole("main", { name: /clipboard history workspace/i })).toBeDefined();
    expect(screen.getByText("CopyVault")).toBeDefined();
    expect(screen.getByText("All History")).toBeDefined();
    expect(screen.getByText("Pinned")).toBeDefined();
  });

  it("displays the genuine clean empty state when no items are present", async () => {
    await act(async () => {
      render(<App />);
    });

    expect(screen.getByText("Clipboard History is Empty")).toBeDefined();
    expect(
      screen.getByText(/Copy text, code, links, or images anywhere on your desktop/i)
    ).toBeDefined();
  });

  it("adds a test text item and renders the text clipboard card", async () => {
    await act(async () => {
      render(<App />);
    });

    // Open Add Item Modal
    const addBtn = screen.getByRole("button", { name: /add a test clipboard item/i });
    await act(async () => {
      fireEvent.click(addBtn);
    });

    expect(screen.getByText("Add Clipboard Item")).toBeDefined();

    // Fill form
    const textarea = screen.getByLabelText(/content text/i);
    await act(async () => {
      fireEvent.change(textarea, { target: { value: "Hello CopyVault Local-First" } });
    });

    const submitBtn = screen.getByRole("button", { name: /add to history/i });
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    // Card should now be visible in list
    expect(screen.getByText("Hello CopyVault Local-First")).toBeDefined();
    expect(screen.getByText("📝 Text")).toBeDefined();
  });

  it("supports adding an image item with safe placeholder layout", async () => {
    await act(async () => {
      render(<App />);
    });

    // Open modal
    const addBtn = screen.getByRole("button", { name: /add a test clipboard item/i });
    await act(async () => {
      fireEvent.click(addBtn);
    });

    // Select Image format
    const formatSelect = screen.getByRole("combobox", { name: /^content format$/i });
    await act(async () => {
      fireEvent.change(formatSelect, { target: { value: "image" } });
    });

    const textarea = screen.getByLabelText(/image filename \/ description/i);
    await act(async () => {
      fireEvent.change(textarea, { target: { value: "screenshot_desktop_v1.png" } });
    });

    const submitBtn = screen.getByRole("button", { name: /add to history/i });
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    expect(screen.getByText("screenshot_desktop_v1.png")).toBeDefined();
    expect(screen.getByText("🖼️ Image")).toBeDefined();
    expect(screen.getByLabelText("Image thumbnail preview")).toBeDefined();
  });

  it("handles ordered multi-selection, visible sequence numbers, and dynamic renumbering", async () => {
    await act(async () => {
      render(<App />);
    });

    // Add item 1
    const addBtn = screen.getByRole("button", { name: /add a test clipboard item/i });
    await act(async () => {
      fireEvent.click(addBtn);
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/content text/i), { target: { value: "Item Alpha" } });
      fireEvent.click(screen.getByRole("button", { name: /add to history/i }));
    });

    // Add item 2
    await act(async () => {
      fireEvent.click(addBtn);
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/content text/i), { target: { value: "Item Beta" } });
      fireEvent.click(screen.getByRole("button", { name: /add to history/i }));
    });

    // Add item 3
    await act(async () => {
      fireEvent.click(addBtn);
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/content text/i), { target: { value: "Item Gamma" } });
      fireEvent.click(screen.getByRole("button", { name: /add to history/i }));
    });

    // Select Item Alpha first
    const alphaCard = screen.getByText("Item Alpha").closest("article")!;
    const alphaCheckbox = alphaCard.querySelector('button[role="checkbox"]')!;
    await act(async () => {
      fireEvent.click(alphaCheckbox);
    });

    // Select Item Beta second
    const betaCard = screen.getByText("Item Beta").closest("article")!;
    const betaCheckbox = betaCard.querySelector('button[role="checkbox"]')!;
    await act(async () => {
      fireEvent.click(betaCheckbox);
    });

    // Select Item Gamma third
    const gammaCard = screen.getByText("Item Gamma").closest("article")!;
    const gammaCheckbox = gammaCard.querySelector('button[role="checkbox"]')!;
    await act(async () => {
      fireEvent.click(gammaCheckbox);
    });

    // Queue bar should appear with 3 items
    expect(screen.getByText(/3 items in paste order/i)).toBeDefined();

    // Alpha checkbox should show "1", Beta "2", Gamma "3"
    expect(alphaCheckbox.textContent).toContain("1");
    expect(betaCheckbox.textContent).toContain("2");
    expect(gammaCheckbox.textContent).toContain("3");

    // Deselect Item Beta (number 2)
    await act(async () => {
      fireEvent.click(betaCheckbox);
    });

    // Queue bar should now show 2 items
    expect(screen.getByText(/2 items in paste order/i)).toBeDefined();

    // Dynamic Renumbering verification:
    // Alpha remains "1", and Gamma must be renumbered from "3" to "2"!
    expect(alphaCheckbox.textContent).toContain("1");
    expect(gammaCheckbox.textContent).toContain("2");
  });

  it("supports copying selected items in sequential order to clipboard without self-recording duplicates", async () => {
    await act(async () => {
      render(<App />);
    });

    const addBtn = screen.getByRole("button", { name: /add a test clipboard item/i });

    // Add 2 items
    await act(async () => {
      fireEvent.click(addBtn);
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/content text/i), { target: { value: "First Line" } });
      fireEvent.click(screen.getByRole("button", { name: /add to history/i }));
    });
    await act(async () => {
      fireEvent.click(addBtn);
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/content text/i), { target: { value: "Second Line" } });
      fireEvent.click(screen.getByRole("button", { name: /add to history/i }));
    });

    const firstCard = screen.getByText("First Line").closest("article")!;
    const secondCard = screen.getByText("Second Line").closest("article")!;
    const firstCheckbox = firstCard.querySelector('button[role="checkbox"]')!;
    const secondCheckbox = secondCard.querySelector('button[role="checkbox"]')!;

    // Select first, then second
    await act(async () => {
      fireEvent.click(firstCheckbox);
      fireEvent.click(secondCheckbox);
    });

    // Check for "Copy in Order" button
    const copyInOrderBtn = screen.getByRole("button", { name: /copy in order/i });
    expect(copyInOrderBtn).toBeDefined();

    // Click "Copy in Order"
    await act(async () => {
      fireEvent.click(copyInOrderBtn);
    });

    // Success toast shown
    expect(screen.getByText(/copied 2 items in order to clipboard/i)).toBeDefined();

    // Selection queue is cleared
    expect(screen.queryByText(/2 items in paste order/i)).toBeNull();
  });

  it("opens detail inspection pane when card is clicked and allows copying", async () => {
    await act(async () => {
      render(<App />);
    });

    // Add item
    const addBtn = screen.getByRole("button", { name: /add a test clipboard item/i });
    await act(async () => {
      fireEvent.click(addBtn);
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/content text/i), {
        target: { value: "Detailed Inspection Sample" },
      });
      fireEvent.click(screen.getByRole("button", { name: /add to history/i }));
    });

    // Click card
    const card = screen.getByText("Detailed Inspection Sample").closest("article")!;
    await act(async () => {
      fireEvent.click(card);
    });

    // Detail pane should open
    expect(screen.getByRole("complementary", { name: /item inspection panel/i })).toBeDefined();
    expect(screen.getByText("Item Details")).toBeDefined();
    expect(screen.getByText(/26 characters/)).toBeDefined();

    // Click Copy Again
    const copyBtn = screen.getByRole("button", { name: /copy item text to clipboard/i });
    await act(async () => {
      fireEvent.click(copyBtn);
    });
    expect(screen.getByText("✓ Copied!")).toBeDefined();

    // Close detail pane
    const closeBtn = screen.getByRole("button", { name: /close details inspection pane/i });
    await act(async () => {
      fireEvent.click(closeBtn);
    });
  });

  it("toggles between dark and light themes", async () => {
    await act(async () => {
      render(<App />);
    });

    const themeToggle = screen.getByRole("button", { name: /switch to light theme/i });
    await act(async () => {
      fireEvent.click(themeToggle);
    });
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");

    const darkToggle = screen.getByRole("button", { name: /switch to dark theme/i });
    await act(async () => {
      fireEvent.click(darkToggle);
    });
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("opens and closes Settings modal", async () => {
    await act(async () => {
      render(<App />);
    });

    const settingsBtn = screen.getByRole("button", { name: /open copyvault settings/i });
    await act(async () => {
      fireEvent.click(settingsBtn);
    });

    expect(screen.getByText("CopyVault Settings")).toBeDefined();
    expect(screen.getByText(/password manager/i)).toBeDefined();
    expect(screen.getByText("Storage & Retention Limits")).toBeDefined();

    // Close via Done button
    const doneBtn = screen.getByRole("button", { name: "Done" });
    await act(async () => {
      fireEvent.click(doneBtn);
    });

    expect(screen.queryByText("CopyVault Settings")).toBeNull();
  });

  it("renders simulated loading and error states for QA validation", async () => {
    await act(async () => {
      render(<App />);
    });

    const stateSelect = screen.getByLabelText(/simulate ui state for testing/i);

    // Switch to Loading
    await act(async () => {
      fireEvent.change(stateSelect, { target: { value: "loading" } });
    });
    expect(screen.getByText(/loading clipboard vault/i)).toBeDefined();

    // Switch to Error
    await act(async () => {
      fireEvent.change(stateSelect, { target: { value: "error" } });
    });
    expect(screen.getByText(/unable to connect to clipboard service/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /try reconnecting/i })).toBeDefined();

    // Click retry
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /try reconnecting/i }));
    });
    expect(screen.getByText("Clipboard History is Empty")).toBeDefined();
  });

  it("supports in-place text editing from the detail pane and updates card", async () => {
    await act(async () => {
      render(<App />);
    });

    // Add item
    const addBtn = screen.getByRole("button", { name: /add a test clipboard item/i });
    await act(async () => {
      fireEvent.click(addBtn);
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/content text/i), {
        target: { value: "Initial Draft Content" },
      });
      fireEvent.click(screen.getByRole("button", { name: /add to history/i }));
    });

    // Open detail pane
    const card = screen.getByText("Initial Draft Content").closest("article")!;
    await act(async () => {
      fireEvent.click(card);
    });

    // Click Edit Text
    const editBtn = screen.getByRole("button", { name: /edit text content/i });
    await act(async () => {
      fireEvent.click(editBtn);
    });

    // Edit content
    const textarea = screen.getByLabelText(/edit text content/i);
    await act(async () => {
      fireEvent.change(textarea, { target: { value: "Updated Polished Text" } });
    });

    // Save changes
    const saveBtn = screen.getByRole("button", { name: /save changes/i });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    // Both card and detail pane should reflect updated text
    expect(screen.getAllByText("Updated Polished Text").length).toBeGreaterThanOrEqual(1);
  });

  it("supports pinning and unpinning items", async () => {
    await act(async () => {
      render(<App />);
    });

    // Add item
    const addBtn = screen.getByRole("button", { name: /add a test clipboard item/i });
    await act(async () => {
      fireEvent.click(addBtn);
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/content text/i), {
        target: { value: "Item to Pin" },
      });
      fireEvent.click(screen.getByRole("button", { name: /add to history/i }));
    });

    const pinBtn = screen.getByRole("button", { name: /pin item to top/i });
    await act(async () => {
      fireEvent.click(pinBtn);
    });

    // Button should now be for unpinning
    expect(screen.getByRole("button", { name: /unpin item/i })).toBeDefined();
  });

  it("supports single item deletion", async () => {
    await act(async () => {
      render(<App />);
    });

    // Add item
    const addBtn = screen.getByRole("button", { name: /add a test clipboard item/i });
    await act(async () => {
      fireEvent.click(addBtn);
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/content text/i), {
        target: { value: "Item to Delete" },
      });
      fireEvent.click(screen.getByRole("button", { name: /add to history/i }));
    });

    expect(screen.getByText("Item to Delete")).toBeDefined();

    const deleteBtn = screen.getByRole("button", { name: /delete item from history/i });
    await act(async () => {
      fireEvent.click(deleteBtn);
    });

    expect(screen.queryByText("Item to Delete")).toBeNull();
  });

  it("supports bulk deletion with confirmation from the selection queue bar", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    await act(async () => {
      render(<App />);
    });

    const addBtn = screen.getByRole("button", { name: /add a test clipboard item/i });

    // Add Item 1
    await act(async () => {
      fireEvent.click(addBtn);
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/content text/i), { target: { value: "Batch Item 1" } });
      fireEvent.click(screen.getByRole("button", { name: /add to history/i }));
    });

    // Add Item 2
    await act(async () => {
      fireEvent.click(addBtn);
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/content text/i), { target: { value: "Batch Item 2" } });
      fireEvent.click(screen.getByRole("button", { name: /add to history/i }));
    });

    // Select both items
    const check1 = screen.getByText("Batch Item 1").closest("article")!.querySelector('button[role="checkbox"]')!;
    const check2 = screen.getByText("Batch Item 2").closest("article")!.querySelector('button[role="checkbox"]')!;

    await act(async () => {
      fireEvent.click(check1);
      fireEvent.click(check2);
    });

    // Bulk delete button
    const bulkDeleteBtn = screen.getByRole("button", { name: /delete 2 selected items/i });
    await act(async () => {
      fireEvent.click(bulkDeleteBtn);
    });

    expect(confirmSpy).toHaveBeenCalled();
    expect(screen.queryByText("Batch Item 1")).toBeNull();
    expect(screen.queryByText("Batch Item 2")).toBeNull();

    confirmSpy.mockRestore();
  });

  it("supports date range selection in filter bar", async () => {
    await act(async () => {
      render(<App />);
    });

    const dateSelect = screen.getByLabelText(/filter history by date range/i);
    await act(async () => {
      fireEvent.change(dateSelect, { target: { value: "today" } });
    });
    expect((dateSelect as HTMLSelectElement).value).toBe("today");

    await act(async () => {
      fireEvent.change(dateSelect, { target: { value: "week" } });
    });
    expect((dateSelect as HTMLSelectElement).value).toBe("week");
  });

  it("triggers retention cleanup from Settings modal", async () => {
    await act(async () => {
      render(<App />);
    });

    // Open settings
    const settingsBtn = screen.getByRole("button", { name: /open copyvault settings/i });
    await act(async () => {
      fireEvent.click(settingsBtn);
    });

    // Click cleanup
    const cleanupBtn = screen.getByRole("button", { name: /run retention cleanup now/i });
    await act(async () => {
      fireEvent.click(cleanupBtn);
    });

    expect(screen.getByText("Retention cleanup complete.")).toBeDefined();
  });

  it("preserves sequential selection queue during filtering, sorting, and search updates", async () => {
    await act(async () => {
      render(<App />);
    });

    const addBtn = screen.getByRole("button", { name: /add a test clipboard item/i });

    // Add item 1 (text)
    await act(async () => {
      fireEvent.click(addBtn);
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/content text/i), { target: { value: "Persistent Text Item" } });
      fireEvent.click(screen.getByRole("button", { name: /add to history/i }));
    });

    // Add item 2 (code)
    await act(async () => {
      fireEvent.click(addBtn);
    });
    await act(async () => {
      fireEvent.change(screen.getByRole("combobox", { name: /^content format$/i }), {
        target: { value: "code" },
      });
      fireEvent.change(screen.getByLabelText(/code block/i), { target: { value: "const persistent = 1;" } });
      fireEvent.click(screen.getByRole("button", { name: /add to history/i }));
    });

    // Select both items
    const textCheck = screen.getByText("Persistent Text Item").closest("article")!.querySelector('button[role="checkbox"]')!;
    const codeCheck = screen.getByText("const persistent = 1;").closest("article")!.querySelector('button[role="checkbox"]')!;

    await act(async () => {
      fireEvent.click(textCheck);
      fireEvent.click(codeCheck);
    });

    expect(screen.getByText(/2 items in paste order/i)).toBeDefined();

    // 1. Filter by Code only (Text item is hidden from main feed)
    const codePill = screen.getByRole("tab", { name: /code/i });
    await act(async () => {
      fireEvent.click(codePill);
    });

    // Text card is filtered out of feed, BUT queue bar must still have 2 items!
    expect(within(screen.getByRole("feed")).queryByText("Persistent Text Item")).toBeNull();
    expect(screen.getByText(/2 items in paste order/i)).toBeDefined();

    // 2. Search for something non-existent
    const searchInput = screen.getByLabelText(/search clipboard history/i);
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: "nonexistentquery" } });
    });

    // Feed shows no-results, but sequential queue remains firmly intact!
    expect(screen.getByText(/no matching clipboard items/i)).toBeDefined();
    expect(screen.getByText(/2 items in paste order/i)).toBeDefined();
  });

  it("allows accessible reordering of queued items", async () => {
    await act(async () => {
      render(<App />);
    });

    const addBtn = screen.getByRole("button", { name: /add a test clipboard item/i });

    // Add Item A
    await act(async () => {
      fireEvent.click(addBtn);
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/content text/i), { target: { value: "Item First" } });
      fireEvent.click(screen.getByRole("button", { name: /add to history/i }));
    });

    // Add Item B
    await act(async () => {
      fireEvent.click(addBtn);
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/content text/i), { target: { value: "Item Second" } });
      fireEvent.click(screen.getByRole("button", { name: /add to history/i }));
    });

    // Select Item First (1), then Item Second (2)
    const firstCheck = screen.getByText("Item First").closest("article")!.querySelector('button[role="checkbox"]')!;
    const secondCheck = screen.getByText("Item Second").closest("article")!.querySelector('button[role="checkbox"]')!;

    await act(async () => {
      fireEvent.click(firstCheck);
      fireEvent.click(secondCheck);
    });

    expect(firstCheck.textContent).toContain("1");
    expect(secondCheck.textContent).toContain("2");

    // Click Move Later (▶) on item 1 in the queue bar
    const moveLaterBtn = screen.getByRole("button", { name: /move item 1 later in paste order/i });
    await act(async () => {
      fireEvent.click(moveLaterBtn);
    });

    // Item Second should now be sequence 1, and Item First sequence 2!
    expect(secondCheck.textContent).toContain("1");
    expect(firstCheck.textContent).toContain("2");
  });

  it("opens sequence preview modal displaying warnings, mode choices, and order", async () => {
    await act(async () => {
      render(<App />);
    });

    const addBtn = screen.getByRole("button", { name: /add a test clipboard item/i });
    await act(async () => {
      fireEvent.click(addBtn);
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/content text/i), { target: { value: "Preview Sequence Item" } });
      fireEvent.click(screen.getByRole("button", { name: /add to history/i }));
    });

    const check = screen.getByText("Preview Sequence Item").closest("article")!.querySelector('button[role="checkbox"]')!;
    await act(async () => {
      fireEvent.click(check);
    });

    // Open Sequence Preview
    const previewBtn = screen.getByRole("button", { name: /preview full sequence and execution options/i });
    await act(async () => {
      fireEvent.click(previewBtn);
    });

    // Dialog elements
    expect(screen.getByRole("dialog", { name: /sequential paste queue/i })).toBeDefined();
    expect(screen.getByText(/clipboard replacement notice/i)).toBeDefined();
    expect(screen.getByText(/automated synthetic paste/i)).toBeDefined();
    expect(screen.getByText(/stepped clipboard mode/i)).toBeDefined();

    // Confirm Start
    const startBtn = screen.getByRole("button", { name: /start sequential paste session/i });
    await act(async () => {
      fireEvent.click(startBtn);
    });

    // Active session bar should now be visible
    expect(screen.getByRole("region", { name: /active sequential paste session/i })).toBeDefined();
    expect(screen.getByText(/step 1 of 1/i)).toBeDefined();
  });

  it("advances sequential paste session and completes successfully", async () => {
    await act(async () => {
      render(<App />);
    });

    const addBtn = screen.getByRole("button", { name: /add a test clipboard item/i });

    // Add item 1
    await act(async () => {
      fireEvent.click(addBtn);
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/content text/i), { target: { value: "Step One Data" } });
      fireEvent.click(screen.getByRole("button", { name: /add to history/i }));
    });

    // Add item 2
    await act(async () => {
      fireEvent.click(addBtn);
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/content text/i), { target: { value: "Step Two Data" } });
      fireEvent.click(screen.getByRole("button", { name: /add to history/i }));
    });

    // Select both
    const check1 = screen.getByText("Step One Data").closest("article")!.querySelector('button[role="checkbox"]')!;
    const check2 = screen.getByText("Step Two Data").closest("article")!.querySelector('button[role="checkbox"]')!;
    await act(async () => {
      fireEvent.click(check1);
      fireEvent.click(check2);
    });

    // Start session
    const pasteOrderBtn = screen.getByRole("button", { name: /start sequential paste with 2 items/i });
    await act(async () => {
      fireEvent.click(pasteOrderBtn);
    });

    const confirmStartBtn = screen.getByRole("button", { name: /start sequential paste session/i });
    await act(async () => {
      fireEvent.click(confirmStartBtn);
    });

    // Active session bar showing Step 1 of 2
    expect(screen.getByText(/step 1 of 2/i)).toBeDefined();

    // Click Advance Next
    const advanceBtn = screen.getByRole("button", { name: /advance to next item/i });
    await act(async () => {
      fireEvent.click(advanceBtn);
    });

    // Now Step 2 of 2 in active session bar
    expect(screen.getAllByText(/step 2 of 2/i).length).toBeGreaterThanOrEqual(1);

    // Click Advance Next again -> Completed
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /advance to next item/i }));
    });

    expect(screen.getByText(/all 2 items successfully pasted/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /dismiss completed sequential session/i })).toBeDefined();

    // Dismiss
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /dismiss completed sequential session/i }));
    });
    expect(screen.queryByRole("region", { name: /active sequential paste session/i })).toBeNull();
  });

  it("prevents accidental queue loss when clearing queue of multiple items", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false); // User cancels confirmation

    await act(async () => {
      render(<App />);
    });

    const addBtn = screen.getByRole("button", { name: /add a test clipboard item/i });
    await act(async () => {
      fireEvent.click(addBtn);
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/content text/i), { target: { value: "Item Unclear 1" } });
      fireEvent.click(screen.getByRole("button", { name: /add to history/i }));
    });
    await act(async () => {
      fireEvent.click(addBtn);
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/content text/i), { target: { value: "Item Unclear 2" } });
      fireEvent.click(screen.getByRole("button", { name: /add to history/i }));
    });

    const check1 = screen.getByText("Item Unclear 1").closest("article")!.querySelector('button[role="checkbox"]')!;
    const check2 = screen.getByText("Item Unclear 2").closest("article")!.querySelector('button[role="checkbox"]')!;
    await act(async () => {
      fireEvent.click(check1);
      fireEvent.click(check2);
    });

    // Click Clear Queue
    const clearBtn = screen.getByRole("button", { name: /clear all items from sequential paste queue/i });
    await act(async () => {
      fireEvent.click(clearBtn);
    });

    // Because user cancelled confirm, queue remains intact!
    expect(confirmSpy).toHaveBeenCalled();
    expect(screen.getByText(/2 items in paste order/i)).toBeDefined();

    // Now user confirms
    confirmSpy.mockReturnValue(true);
    await act(async () => {
      fireEvent.click(clearBtn);
    });
    expect(screen.queryByText(/items in paste order/i)).toBeNull();

    confirmSpy.mockRestore();
  });

  it("removes item from queue without deleting it from history", async () => {
    await act(async () => {
      render(<App />);
    });

    const addBtn = screen.getByRole("button", { name: /add a test clipboard item/i });
    await act(async () => {
      fireEvent.click(addBtn);
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/content text/i), { target: { value: "Keep In History Item" } });
      fireEvent.click(screen.getByRole("button", { name: /add to history/i }));
    });

    const check = screen.getByText("Keep In History Item").closest("article")!.querySelector('button[role="checkbox"]')!;
    await act(async () => {
      fireEvent.click(check);
    });

    expect(screen.getByText(/1 items in paste order/i)).toBeDefined();

    // Click remove (✕) in the queue bar
    const removeBtn = screen.getByRole("button", { name: /remove item 1 from queue/i });
    await act(async () => {
      fireEvent.click(removeBtn);
    });

    // Queue bar disappears because queue is empty
    expect(screen.queryByText(/items in paste order/i)).toBeNull();

    // BUT item still exists in the history list!
    expect(screen.getByText("Keep In History Item")).toBeDefined();
  });

  it("toggles between workspace and compact quick panel window modes", async () => {
    await act(async () => {
      render(<App />);
    });

    // Toggle window mode to Quick Panel
    const toggleBtn = screen.getByRole("button", { name: /switch to compact quick panel/i });
    await act(async () => {
      fireEvent.click(toggleBtn);
    });

    const appRoot = screen.getByTestId("copyvault-desktop-app");
    expect(appRoot.className).toContain("cv-quick-panel-mode");

    // Toggle back to Full View
    const fullBtn = screen.getByRole("button", { name: /switch to full workspace/i });
    await act(async () => {
      fireEvent.click(fullBtn);
    });
    expect(appRoot.className).not.toContain("cv-quick-panel-mode");
  });

  it("configures desktop integration settings including global shortcut and launch-at-login", async () => {
    await act(async () => {
      render(<App />);
    });

    // Open settings
    const settingsBtn = screen.getByRole("button", { name: /open copyvault settings/i });
    await act(async () => {
      fireEvent.click(settingsBtn);
    });

    expect(screen.getByText(/desktop & quick panel integration/i)).toBeDefined();

    // Check global shortcut field
    const shortcutInput = screen.getByLabelText(/global quick panel shortcut/i) as HTMLInputElement;
    expect(shortcutInput.value).toBe("Cmd+Shift+V");

    // Test conflict error on system edit shortcut
    await act(async () => {
      fireEvent.change(shortcutInput, { target: { value: "Cmd+C" } });
      fireEvent.blur(shortcutInput);
    });
    expect(screen.getByText(/conflicts with os clipboard shortcut/i)).toBeDefined();

    // Set valid custom shortcut
    await act(async () => {
      fireEvent.change(shortcutInput, { target: { value: "Ctrl+Shift+V" } });
      fireEvent.blur(shortcutInput);
    });
    expect(screen.queryByText(/conflicts with os clipboard shortcut/i)).toBeNull();

    // Check launch at login checkbox (starts unchecked)
    const autostartToggle = screen.getByLabelText(/launch copyvault at login/i) as HTMLInputElement;
    expect(autostartToggle.checked).toBe(false);

    await act(async () => {
      fireEvent.click(autostartToggle);
    });
    expect(autostartToggle.checked).toBe(true);

    // Check auto-hide on blur checkbox
    const autohideToggle = screen.getByLabelText(/auto hide on blur/i) as HTMLInputElement;
    expect(autohideToggle.checked).toBe(true);
  });

  it("supports number keys 1..9 for instant pasting top items", async () => {
    await act(async () => {
      render(<App />);
    });

    const addBtn = screen.getByRole("button", { name: /add a test clipboard item/i });
    await act(async () => {
      fireEvent.click(addBtn);
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/content text/i), { target: { value: "Top Number One" } });
      fireEvent.click(screen.getByRole("button", { name: /add to history/i }));
    });

    // Press number key 1 after blurring input
    (document.activeElement as HTMLElement)?.blur();
    await act(async () => {
      fireEvent.keyDown(window, { key: "1" });
    });

    expect(screen.getByText(/copied to local clipboard/i)).toBeDefined();
  });

  it("handles pause/resume capture toggle from the toolbar and settings", async () => {
    await act(async () => {
      render(<App />);
    });

    // Check visible capture status indicator in toolbar
    const captureStatusBtn = screen.getByRole("button", { name: /pause clipboard capture/i });
    expect(captureStatusBtn).toBeDefined();
    expect(screen.getByText("Active")).toBeDefined();

    // Toggle pause
    await act(async () => {
      fireEvent.click(captureStatusBtn);
    });
    expect(screen.getByText("Paused")).toBeDefined();

    // Resume capture
    const resumeBtn = screen.getByRole("button", { name: /resume clipboard capture/i });
    await act(async () => {
      fireEvent.click(resumeBtn);
    });
    expect(screen.getByText("Active")).toBeDefined();
  });

  it("configures application exclusions and sensitive heuristics in settings", async () => {
    await act(async () => {
      render(<App />);
    });

    // Open settings
    const settingsBtn = screen.getByRole("button", { name: /open copyvault settings/i });
    await act(async () => {
      fireEvent.click(settingsBtn);
    });

    // Check heuristics toggle
    const heuristicsToggle = screen.getByLabelText(/filter sensitive credentials and one-time codes/i) as HTMLInputElement;
    expect(heuristicsToggle.checked).toBe(true);

    // Verify existing default exclusions
    expect(screen.getByText("1Password")).toBeDefined();
    expect(screen.getByText("Bitwarden")).toBeDefined();

    // Add custom exclusion
    const addInput = screen.getByLabelText(/add application name or bundle id to exclusion list/i);
    const addBtn = screen.getByRole("button", { name: /add app to exclusion list/i });

    await act(async () => {
      fireEvent.change(addInput, { target: { value: "KeePass" } });
      fireEvent.click(addBtn);
    });

    expect(screen.getByText("KeePass")).toBeDefined();

    // Remove exclusion
    const remove1Password = screen.getByRole("button", { name: /remove exclusion 1password/i });
    await act(async () => {
      fireEvent.click(remove1Password);
    });
    expect(screen.queryByText("1Password")).toBeNull();
  });

  it("displays local storage paths and privacy diagnostics without leaking secrets", async () => {
    await act(async () => {
      render(<App />);
    });

    const settingsBtn = screen.getByRole("button", { name: /open copyvault settings/i });
    await act(async () => {
      fireEvent.click(settingsBtn);
    });

    expect(screen.getByText(/local storage & privacy diagnostics/i)).toBeDefined();
    expect(screen.getByText(/where is your data stored\?/i)).toBeDefined();
    expect(screen.getByText(/sqlite database:/i)).toBeDefined();
    expect(screen.getByText(/media directory:/i)).toBeDefined();
    expect(screen.getByText(/security boundary notice/i)).toBeDefined();
  });

  it("supports clear all history with explicit confirmation", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    await act(async () => {
      render(<App />);
    });

    // Add a test item
    const addBtn = screen.getByRole("button", { name: /add a test clipboard item/i });
    await act(async () => {
      fireEvent.click(addBtn);
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/content text/i), { target: { value: "To Be Cleared Completely" } });
      fireEvent.click(screen.getByRole("button", { name: /add to history/i }));
    });
    expect(screen.getByText("To Be Cleared Completely")).toBeDefined();

    // Open settings
    const settingsBtn = screen.getByRole("button", { name: /open copyvault settings/i });
    await act(async () => {
      fireEvent.click(settingsBtn);
    });

    // Cancel confirmation test
    confirmSpy.mockReturnValueOnce(false);
    const clearAllBtn = screen.getByRole("button", { name: /clear all items including pinned/i });
    await act(async () => {
      fireEvent.click(clearAllBtn);
    });
    expect(confirmSpy).toHaveBeenCalled();

    // Close settings and verify item remains
    const doneBtn = screen.getByRole("button", { name: "Done" });
    await act(async () => {
      fireEvent.click(doneBtn);
    });
    expect(screen.getByText("To Be Cleared Completely")).toBeDefined();

    // Now accept confirmation
    confirmSpy.mockReturnValueOnce(true);
    await act(async () => {
      fireEvent.click(settingsBtn);
    });
    const clearAllBtn2 = screen.getByRole("button", { name: /clear all items including pinned/i });
    await act(async () => {
      fireEvent.click(clearAllBtn2);
    });

    // Close settings and verify history is empty
    await act(async () => {
      fireEvent.click(doneBtn);
    });
    expect(screen.queryByText("To Be Cleared Completely")).toBeNull();

    confirmSpy.mockRestore();
  });

  it("navigates to Snippets & Templates view and manages permanent snippets", async () => {
    await act(async () => {
      render(<App />);
    });

    // Navigate to Snippets & Templates
    const snippetsNav = screen.getByRole("button", { name: /snippets & templates/i });
    await act(async () => {
      fireEvent.click(snippetsNav);
    });

    await waitFor(() => {
      expect(screen.getByText(/Saved Snippets & Templates/i)).toBeDefined();
      expect(screen.getByText(/Email Introduction/i)).toBeDefined();
    });

    expect(screen.getByText(/!intro/i)).toBeDefined();

    // Click Expand & Copy
    const expandBtn = await screen.findAllByRole("button", { name: /expand and copy/i });
    await act(async () => {
      fireEvent.click(expandBtn[0]);
    });

    expect(screen.getByText(/Expand Template: Email Introduction/i)).toBeDefined();
    const closeExpander = screen.getByRole("button", { name: /close/i });
    await act(async () => {
      fireEvent.click(closeExpander);
    });

    // Navigate back to All History
    const historyNav = screen.getByRole("button", { name: /all history/i });
    await act(async () => {
      fireEvent.click(historyNav);
    });
    expect(screen.getByText(/Clipboard History is Empty/i)).toBeDefined();
  });

  it("supports text transformations and snippet promotion in detail pane", async () => {
    await act(async () => {
      render(<App />);
    });

    // Add item
    const addBtn = screen.getByRole("button", { name: /add a test clipboard item/i });
    await act(async () => {
      fireEvent.click(addBtn);
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/content text/i), { target: { value: "hello world" } });
      fireEvent.click(screen.getByRole("button", { name: /add to history/i }));
    });

    // Click card to open detail pane
    const card = screen.getByText("hello world").closest("article")!;
    await act(async () => {
      fireEvent.click(card);
    });

    expect(screen.getByRole("complementary", { name: /item inspection panel/i })).toBeDefined();

    // Open Transform Menu
    const transformBtn = screen.getByRole("button", { name: /transform text/i });
    await act(async () => {
      fireEvent.click(transformBtn);
    });

    // Click UPPERCASE
    const uppercaseBtn = screen.getByRole("button", { name: /uppercase/i });
    await act(async () => {
      fireEvent.click(uppercaseBtn);
    });

    // Verify detail pane has "Save as Snippet" button
    const saveSnippetBtn = screen.getByRole("button", { name: /save as permanent snippet/i });
    expect(saveSnippetBtn).toBeDefined();

    await act(async () => {
      fireEvent.click(saveSnippetBtn);
    });

    expect(screen.getByRole("heading", { name: /save to permanent snippets/i })).toBeDefined();
    const cancelSnippet = screen.getByRole("button", { name: /cancel/i });
    await act(async () => {
      fireEvent.click(cancelSnippet);
    });
  });

  it("saves active selection queue as reusable sequence and loads it", async () => {
    await act(async () => {
      render(<App />);
    });

    // Add items
    const addBtn = screen.getByRole("button", { name: /add a test clipboard item/i });
    await act(async () => {
      fireEvent.click(addBtn);
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/content text/i), { target: { value: "Sequence Step Alpha" } });
      fireEvent.click(screen.getByRole("button", { name: /add to history/i }));
    });

    const check = screen.getByText("Sequence Step Alpha").closest("article")!.querySelector('button[role="checkbox"]')!;
    await act(async () => {
      fireEvent.click(check);
    });

    // Save sequence button in queue bar
    const saveSeqBtn = screen.getByRole("button", { name: /save current queue as a permanent reusable sequence/i });
    await act(async () => {
      fireEvent.click(saveSeqBtn);
    });

    expect(screen.getByRole("heading", { name: /save as reusable sequence/i })).toBeDefined();

    const nameInput = screen.getByLabelText(/sequence name/i);
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: "Alpha Form Workflow" } });
      fireEvent.click(screen.getByRole("button", { name: /💾 save sequence/i }));
    });

    // Navigate to Paste Sequences view
    const sequencesNav = screen.getByRole("button", { name: /paste sequences/i });
    await act(async () => {
      fireEvent.click(sequencesNav);
    });

    expect(screen.getByText(/Reusable Paste Sequences/i)).toBeDefined();
    expect(screen.getByText(/Customer Onboarding Sequence/i)).toBeDefined();
  });

  it("supports vault backup export and safe import in settings", async () => {
    await act(async () => {
      render(<App />);
    });

    const settingsBtn = screen.getByRole("button", { name: /open copyvault settings/i });
    await act(async () => {
      fireEvent.click(settingsBtn);
    });

    expect(screen.getByText(/Backup & Data Portability/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /export complete vault backup/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /select backup json file to import/i })).toBeDefined();
  });

  it("renders large 5-page text inside a scrollable fixed-height box element", async () => {
    await act(async () => {
      render(<App />);
    });

    const addBtn = screen.getByRole("button", { name: /add a test clipboard item/i });
    await act(async () => {
      fireEvent.click(addBtn);
    });

    // 5 pages of text with 250 lines
    const bigText = Array.from({ length: 250 }, (_, i) => `Paragraph line ${i + 1} of 5-page copied text content.`).join("\n");
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/content text/i), { target: { value: bigText } });
      fireEvent.click(screen.getByRole("button", { name: /add to history/i }));
    });

    // Verify it is rendered in a scrollable region
    const scrollBox = screen.getByRole("region", { name: /scrollable text content/i });
    expect(scrollBox).toBeDefined();
    expect(scrollBox.className).toContain("cv-card-scroll-box");
    expect(scrollBox.textContent).toContain("Paragraph line 1");
    expect(scrollBox.textContent).toContain("Paragraph line 250");
  });

  it("opens full-resolution Image Preview Modal when user clicks Preview button on an image card", async () => {
    await act(async () => {
      render(<App />);
    });

    const addBtn = screen.getByRole("button", { name: /add a test clipboard item/i });
    await act(async () => {
      fireEvent.click(addBtn);
    });

    const formatSelect = screen.getByRole("combobox", { name: /^content format$/i });
    await act(async () => {
      fireEvent.change(formatSelect, { target: { value: "image" } });
    });

    const textarea = screen.getByLabelText(/image filename \/ description/i);
    await act(async () => {
      fireEvent.change(textarea, { target: { value: "quarterly_financial_chart.png" } });
      fireEvent.click(screen.getByRole("button", { name: /add to history/i }));
    });

    // Click Preview button
    const previewBtn = screen.getByRole("button", { name: /open image preview/i });
    expect(previewBtn).toBeDefined();

    await act(async () => {
      fireEvent.click(previewBtn);
    });

    // Image Preview Modal should be open
    expect(screen.getByRole("dialog", { name: /image preview/i })).toBeDefined();
    expect(screen.getByText("quarterly_financial_chart.png")).toBeDefined();
    expect(screen.getByRole("button", { name: /copy image back to clipboard/i })).toBeDefined();

    // Close preview modal via Escape key
    await act(async () => {
      fireEvent.keyDown(window, { key: "Escape" });
    });

    expect(screen.queryByRole("dialog", { name: /image preview/i })).toBeNull();
  });

  it("supports dragging text preview items with text/plain payload for cross-window drag and drop", async () => {
    await act(async () => {
      render(<App />);
    });

    const addBtn = screen.getByRole("button", { name: /add a test clipboard item/i });
    await act(async () => {
      fireEvent.click(addBtn);
    });

    const textarea = screen.getByPlaceholderText(/enter sample clipboard text/i);
    await act(async () => {
      fireEvent.change(textarea, { target: { value: "john.doe@example.com" } });
      fireEvent.click(screen.getByRole("button", { name: /add to history/i }));
    });

    const textPreview = screen.getByText("john.doe@example.com");
    expect(textPreview.getAttribute("draggable")).toBe("true");

    const setDataMock = vi.fn();
    const mockDataTransfer = {
      setData: setDataMock,
      effectAllowed: "",
    };
    const dragStartEvent = createEvent.dragStart(textPreview);
    Object.defineProperty(dragStartEvent, "dataTransfer", {
      value: mockDataTransfer,
    });

    fireEvent(textPreview, dragStartEvent);
    expect(setDataMock).toHaveBeenCalledWith("text/plain", "john.doe@example.com");
    expect(mockDataTransfer.effectAllowed).toBe("copy");
  });
});
