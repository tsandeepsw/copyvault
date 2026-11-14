import React from "react";
import { DateRangeFilter, FilterCategory, SortOrder, UIStateMode } from "../types/clipboard.ts";

interface FilterBarProps {
  activeCategory: FilterCategory;
  onCategoryChange: (category: FilterCategory) => void;
  sortOrder: SortOrder;
  onSortChange: (order: SortOrder) => void;
  dateRange: DateRangeFilter;
  onDateRangeChange: (range: DateRangeFilter) => void;
  categoryCounts: Record<FilterCategory, number>;
  uiStateMode: UIStateMode;
  onStateModeChange: (mode: UIStateMode) => void;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  activeCategory,
  onCategoryChange,
  sortOrder,
  onSortChange,
  dateRange,
  onDateRangeChange,
  categoryCounts,
  uiStateMode,
  onStateModeChange,
}) => {
  const categories: { key: FilterCategory; label: string; icon: string }[] = [
    { key: "all", label: "All", icon: "📑" },
    { key: "text", label: "Text", icon: "📝" },
    { key: "code", label: "Code", icon: "💻" },
    { key: "image", label: "Images", icon: "🖼️" },
    { key: "link", label: "Links", icon: "🔗" },
  ];

  return (
    <div className="cv-filter-bar" role="toolbar" aria-label="Filter and sort controls">
      <div className="cv-filter-pills" role="tablist" aria-label="Content format filters">
        {categories.map((cat) => (
          <button
            key={cat.key}
            type="button"
            role="tab"
            aria-selected={activeCategory === cat.key}
            className={`cv-filter-pill ${activeCategory === cat.key ? "active" : ""}`}
            onClick={() => onCategoryChange(cat.key)}
          >
            <span aria-hidden="true">{cat.icon}</span>
            <span>{cat.label}</span>
            <span className="cv-pill-count">{categoryCounts[cat.key] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="cv-filter-actions">
        {/* State mode tester (gated to development & test runs only; excluded from release builds) */}
        {import.meta.env.DEV && (
          <div className="cv-state-switcher">
            <label htmlFor="state-mode-select" className="cv-select-label">
              State:
            </label>
            <select
              id="state-mode-select"
              className="cv-compact-select"
              value={uiStateMode}
              onChange={(e) => onStateModeChange(e.target.value as UIStateMode)}
              aria-label="Simulate UI state for testing"
            >
              <option value="normal">Normal View</option>
              <option value="loading">Loading State</option>
              <option value="empty">Empty State</option>
              <option value="error">Error State</option>
            </select>
          </div>
        )}

        <div className="cv-date-controls">
          <label htmlFor="date-range-select" className="cv-select-label">
            Date:
          </label>
          <select
            id="date-range-select"
            className="cv-compact-select"
            value={dateRange}
            onChange={(e) => onDateRangeChange(e.target.value as DateRangeFilter)}
            aria-label="Filter history by date range"
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="week">Past 7 Days</option>
            <option value="month">Past 30 Days</option>
          </select>
        </div>

        <div className="cv-sort-controls">
          <label htmlFor="sort-order-select" className="cv-select-label">
            Sort:
          </label>
          <select
            id="sort-order-select"
            className="cv-compact-select"
            value={sortOrder}
            onChange={(e) => onSortChange(e.target.value as SortOrder)}
            aria-label="Sort clipboard history"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="most_used">Most Used</option>
          </select>
        </div>
      </div>
    </div>
  );
};
