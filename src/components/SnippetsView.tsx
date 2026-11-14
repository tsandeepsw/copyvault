import React, { useState, useEffect } from "react";
import { SavedSnippet } from "../types/clipboard";
import {
  listSavedSnippets,
  createSavedSnippet,
  updateSavedSnippet,
  deleteSavedSnippet,
} from "../api/vault";
import { extractPlaceholders, expandTemplate } from "../utils/template";
import { safeConfirm } from "../utils/confirm.ts";

interface SnippetsViewProps {
  onCopyContent: (content: string) => void;
  onClose?: () => void;
}

export const SnippetsView: React.FC<SnippetsViewProps> = ({ onCopyContent }) => {
  const [snippets, setSnippets] = useState<SavedSnippet[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [editingSnippet, setEditingSnippet] = useState<SavedSnippet | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [expandingSnippet, setExpandingSnippet] = useState<SavedSnippet | null>(null);
  const [templateValues, setTemplateValues] = useState<Record<string, string>>({});
  const [copyFeedbackId, setCopyFeedbackId] = useState<number | null>(null);

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formPrefix, setFormPrefix] = useState("");
  const [formSyntax, setFormSyntax] = useState("text");
  const [formDescription, setFormDescription] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formIsPinned, setFormIsPinned] = useState(false);
  const [formError, setFormError] = useState("");

  const loadSnippets = async () => {
    setLoading(true);
    try {
      const data = await listSavedSnippets();
      setSnippets(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSnippets();
  }, []);

  const openCreateModal = () => {
    setFormTitle("");
    setFormPrefix("");
    setFormSyntax("text");
    setFormDescription("");
    setFormContent("");
    setFormIsPinned(false);
    setFormError("");
    setEditingSnippet(null);
    setIsCreating(true);
  };

  const openEditModal = (snippet: SavedSnippet) => {
    setFormTitle(snippet.title);
    setFormPrefix(snippet.trigger_prefix || "");
    setFormSyntax(snippet.syntax);
    setFormDescription(snippet.description || "");
    setFormContent(snippet.content);
    setFormIsPinned(snippet.is_pinned);
    setFormError("");
    setEditingSnippet(snippet);
    setIsCreating(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      setFormError("Title is required.");
      return;
    }
    if (!formContent.trim()) {
      setFormError("Content is required.");
      return;
    }

    try {
      if (editingSnippet) {
        await updateSavedSnippet({
          id: editingSnippet.id,
          title: formTitle.trim(),
          trigger_prefix: formPrefix.trim() || undefined,
          syntax: formSyntax,
          description: formDescription.trim() || undefined,
          content: formContent,
          is_pinned: formIsPinned,
        });
      } else {
        await createSavedSnippet({
          title: formTitle.trim(),
          trigger_prefix: formPrefix.trim() || undefined,
          syntax: formSyntax,
          description: formDescription.trim() || undefined,
          content: formContent,
          is_pinned: formIsPinned,
        });
      }
      setIsCreating(false);
      setEditingSnippet(null);
      await loadSnippets();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to save snippet");
    }
  };

  const handleDelete = async (id: number) => {
    if (safeConfirm("Are you sure you want to delete this permanent snippet?")) {
      await deleteSavedSnippet(id);
      await loadSnippets();
    }
  };

  const handleCopyRaw = (snippet: SavedSnippet) => {
    onCopyContent(snippet.content);
    setCopyFeedbackId(snippet.id);
    setTimeout(() => setCopyFeedbackId(null), 2000);
  };

  const handleOpenExpander = (snippet: SavedSnippet) => {
    const vars = extractPlaceholders(snippet.content);
    const initialVals: Record<string, string> = {};
    for (const v of vars) {
      if (v.toLowerCase() !== "date" && v.toLowerCase() !== "time" && v.toLowerCase() !== "clipboard") {
        initialVals[v] = "";
      }
    }
    setTemplateValues(initialVals);
    setExpandingSnippet(snippet);
  };

  const handleExpandAndCopy = () => {
    if (!expandingSnippet) return;
    const result = expandTemplate(expandingSnippet.content, templateValues);
    onCopyContent(result);
    setCopyFeedbackId(expandingSnippet.id);
    setExpandingSnippet(null);
    setTimeout(() => setCopyFeedbackId(null), 2000);
  };

  const filteredSnippets = snippets.filter((s) => {
    const q = searchQuery.toLowerCase();
    return (
      s.title.toLowerCase().includes(q) ||
      (s.trigger_prefix && s.trigger_prefix.toLowerCase().includes(q)) ||
      s.content.toLowerCase().includes(q) ||
      (s.description && s.description.toLowerCase().includes(q))
    );
  });

  return (
    <div className="cv-snippets-view" aria-label="Permanent Saved Snippets and Templates">
      <div className="cv-snippets-header">
        <div className="cv-snippets-title-box">
          <h2>📑 Saved Snippets & Templates</h2>
          <p className="cv-snippets-subtitle">
            Permanent personal templates with dynamic placeholders. Ephemeral history items are never saved here automatically.
          </p>
        </div>
        <button
          type="button"
          className="cv-btn cv-btn-primary"
          onClick={openCreateModal}
          aria-label="Create new permanent snippet"
        >
          ➕ New Snippet
        </button>
      </div>

      <div className="cv-snippets-search-bar">
        <input
          type="search"
          placeholder="Search snippets by title, prefix (e.g. !email), or content..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="cv-input"
          aria-label="Search snippets"
        />
      </div>

      {loading ? (
        <div className="cv-loading-state" role="status">
          <div className="cv-spinner" />
          <span>Loading saved snippets...</span>
        </div>
      ) : filteredSnippets.length === 0 ? (
        <div className="cv-empty-state">
          <div className="cv-empty-icon">📝</div>
          <h3>No Snippets Found</h3>
          <p>
            {searchQuery
              ? "No snippets match your search."
              : "You haven't saved any permanent snippets yet. Create one above or promote an item from history!"}
          </p>
        </div>
      ) : (
        <div className="cv-snippets-grid">
          {filteredSnippets.map((snippet) => {
            const placeholders = extractPlaceholders(snippet.content);
            const hasPlaceholders = placeholders.length > 0;

            return (
              <div key={snippet.id} className="cv-snippet-card">
                <div className="cv-snippet-card-header">
                  <div className="cv-snippet-card-title-group">
                    {snippet.is_pinned && <span className="cv-pin-badge" title="Pinned snippet">⭐</span>}
                    <h3 className="cv-snippet-card-title">{snippet.title}</h3>
                    {snippet.trigger_prefix && (
                      <span className="cv-badge cv-badge-purple" title="Dynamic expander shortcut">
                        {snippet.trigger_prefix}
                      </span>
                    )}
                    <span className="cv-badge cv-badge-syntax">{snippet.syntax}</span>
                  </div>
                  <div className="cv-snippet-card-actions">
                    <button
                      type="button"
                      className="cv-btn-icon"
                      onClick={() => openEditModal(snippet)}
                      title="Edit snippet"
                      aria-label={`Edit ${snippet.title}`}
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      className="cv-btn-icon cv-btn-icon-danger"
                      onClick={() => handleDelete(snippet.id)}
                      title="Delete snippet"
                      aria-label={`Delete ${snippet.title}`}
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                {snippet.description && (
                  <p className="cv-snippet-description">{snippet.description}</p>
                )}

                <pre className="cv-snippet-content-preview">
                  <code>{snippet.content}</code>
                </pre>

                {hasPlaceholders && (
                  <div className="cv-snippet-placeholders-strip">
                    <span className="cv-placeholders-label">Placeholders:</span>
                    {placeholders.map((p) => (
                      <span key={p} className="cv-placeholder-tag">
                        {`{{${p}}}`}
                      </span>
                    ))}
                  </div>
                )}

                <div className="cv-snippet-card-footer">
                  <button
                    type="button"
                    className="cv-btn cv-btn-secondary"
                    onClick={() => handleCopyRaw(snippet)}
                    aria-label={`Copy raw snippet ${snippet.title}`}
                  >
                    {copyFeedbackId === snippet.id ? "✓ Copied!" : "📋 Copy Raw"}
                  </button>

                  {hasPlaceholders && (
                    <button
                      type="button"
                      className="cv-btn cv-btn-primary"
                      onClick={() => handleOpenExpander(snippet)}
                      aria-label={`Expand and copy ${snippet.title}`}
                    >
                      ✨ Expand & Copy
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Snippet Create / Edit Modal */}
      {isCreating && (
        <div className="cv-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className="cv-modal-card cv-snippet-modal">
            <h3 id="modal-title">{editingSnippet ? "Edit Permanent Snippet" : "Create Permanent Snippet"}</h3>

            {formError && <div className="cv-error-banner">{formError}</div>}

            <form onSubmit={handleSave} className="cv-form">
              <div className="cv-form-group">
                <label htmlFor="snip-title">Title *</label>
                <input
                  id="snip-title"
                  type="text"
                  className="cv-input"
                  placeholder="e.g., Client Introduction Email"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  required
                />
              </div>

              <div className="cv-form-row">
                <div className="cv-form-group cv-form-col">
                  <label htmlFor="snip-prefix">Trigger Prefix (optional)</label>
                  <input
                    id="snip-prefix"
                    type="text"
                    className="cv-input"
                    placeholder="e.g., !intro"
                    value={formPrefix}
                    onChange={(e) => setFormPrefix(e.target.value)}
                  />
                  <small className="cv-form-help">Shortcut to quickly locate this template.</small>
                </div>

                <div className="cv-form-group cv-form-col">
                  <label htmlFor="snip-syntax">Syntax</label>
                  <select
                    id="snip-syntax"
                    className="cv-select"
                    value={formSyntax}
                    onChange={(e) => setFormSyntax(e.target.value)}
                  >
                    <option value="text">Plain Text</option>
                    <option value="markdown">Markdown</option>
                    <option value="sql">SQL</option>
                    <option value="json">JSON</option>
                    <option value="typescript">TypeScript</option>
                    <option value="python">Python</option>
                    <option value="shell">Shell / Bash</option>
                  </select>
                </div>
              </div>

              <div className="cv-form-group">
                <label htmlFor="snip-desc">Description (optional)</label>
                <input
                  id="snip-desc"
                  type="text"
                  className="cv-input"
                  placeholder="e.g., Used for initial reach-outs to new customers"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                />
              </div>

              <div className="cv-form-group">
                <label htmlFor="snip-content">Content *</label>
                <textarea
                  id="snip-content"
                  className="cv-textarea cv-code-font"
                  rows={8}
                  placeholder="Enter template text. Use {{variable}} for dynamic placeholders..."
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  required
                />
                <small className="cv-form-help">
                  Built-in placeholders: <code>{"{{date}}"}</code>, <code>{"{{time}}"}</code>, <code>{"{{clipboard}}"}</code>.
                </small>
              </div>

              <div className="cv-form-checkbox-row">
                <label className="cv-checkbox-label">
                  <input
                    type="checkbox"
                    checked={formIsPinned}
                    onChange={(e) => setFormIsPinned(e.target.checked)}
                  />
                  <span>Pin to top of snippets list</span>
                </label>
              </div>

              <div className="cv-modal-btn-row">
                <button type="submit" className="cv-btn cv-btn-primary">
                  {editingSnippet ? "💾 Save Changes" : "✨ Create Snippet"}
                </button>
                <button
                  type="button"
                  className="cv-btn cv-btn-secondary"
                  onClick={() => setIsCreating(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Template Expander Modal */}
      {expandingSnippet && (
        <div className="cv-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="expander-title">
          <div className="cv-modal-card cv-expander-modal">
            <h3 id="expander-title">Expand Template: {expandingSnippet.title}</h3>
            <p className="cv-modal-subtitle">
              Fill in the user variables below. Built-ins like date and time resolve automatically.
            </p>

            <div className="cv-expander-form">
              {Object.keys(templateValues).length === 0 ? (
                <p className="cv-text-muted">All placeholders in this template are resolved automatically.</p>
              ) : (
                Object.keys(templateValues).map((key) => (
                  <div key={key} className="cv-form-group">
                    <label htmlFor={`var-${key}`}>{key}</label>
                    <input
                      id={`var-${key}`}
                      type="text"
                      className="cv-input"
                      placeholder={`Enter value for ${key}`}
                      value={templateValues[key] || ""}
                      onChange={(e) =>
                        setTemplateValues((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                    />
                  </div>
                ))
              )}

              <div className="cv-expander-preview">
                <label className="cv-label-bold">Live Preview:</label>
                <pre className="cv-preview-box">
                  <code>{expandTemplate(expandingSnippet.content, templateValues)}</code>
                </pre>
              </div>

              <div className="cv-modal-btn-row">
                <button
                  type="button"
                  className="cv-btn cv-btn-primary"
                  onClick={handleExpandAndCopy}
                >
                  📋 Copy Expanded Content
                </button>
                <button
                  type="button"
                  className="cv-btn cv-btn-secondary"
                  onClick={() => setExpandingSnippet(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
