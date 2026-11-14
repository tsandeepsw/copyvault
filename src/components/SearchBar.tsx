import React, { useRef, useEffect } from "react";

interface SearchBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onOpenAddModal?: () => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  autoFocus?: boolean;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  searchQuery,
  onSearchChange,
  onOpenAddModal,
  inputRef: externalRef,
  autoFocus,
}) => {
  const internalRef = useRef<HTMLInputElement>(null);
  const inputRef = externalRef || internalRef;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [inputRef]);

  return (
    <div className="cv-search-bar" role="search">
      <div className="cv-search-input-wrapper">
        <span className="cv-search-icon" aria-hidden="true">🔍</span>
        <input
          ref={inputRef}
          type="text"
          className="cv-search-input"
          placeholder="Search history, code, or links... (Press / or ⌘K)"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Search clipboard history"
          autoFocus={autoFocus}
        />
        {searchQuery && (
          <button
            type="button"
            className="cv-search-clear-btn"
            onClick={() => onSearchChange("")}
            aria-label="Clear search query"
          >
            ✕
          </button>
        )}
      </div>

      {onOpenAddModal && (
        <button
          type="button"
          className="cv-add-item-btn"
          onClick={onOpenAddModal}
          aria-label="Add a test clipboard item"
        >
          <span aria-hidden="true">+</span>
          <span>Add Item</span>
        </button>
      )}
    </div>
  );
};
