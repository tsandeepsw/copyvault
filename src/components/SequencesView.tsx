import React, { useState, useEffect } from "react";
import { PasteSequence } from "../types/clipboard";
import { listPasteSequences, deletePasteSequence } from "../api/vault";
import { safeConfirm } from "../utils/confirm.ts";

interface SequencesViewProps {
  onLoadSequenceToQueue: (sequence: PasteSequence) => void;
}

export const SequencesView: React.FC<SequencesViewProps> = ({ onLoadSequenceToQueue }) => {
  const [sequences, setSequences] = useState<PasteSequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedbackId, setFeedbackId] = useState<number | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await listPasteSequences();
      setSequences(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDelete = async (id: number) => {
    if (safeConfirm("Delete this reusable paste sequence?")) {
      await deletePasteSequence(id);
      await loadData();
    }
  };

  const handleRun = (seq: PasteSequence) => {
    onLoadSequenceToQueue(seq);
    setFeedbackId(seq.id);
    setTimeout(() => setFeedbackId(null), 2500);
  };

  return (
    <div className="cv-sequences-view" aria-label="Reusable Paste Sequences">
      <div className="cv-sequences-header">
        <div>
          <h2>🔁 Reusable Paste Sequences</h2>
          <p className="cv-sequences-subtitle">
            Permanent multi-field paste workflows saved from ordered multi-selections. Re-run anytime to fill forms sequentially.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="cv-loading-state" role="status">
          <div className="cv-spinner" />
          <span>Loading sequences...</span>
        </div>
      ) : sequences.length === 0 ? (
        <div className="cv-empty-state">
          <div className="cv-empty-icon">📋</div>
          <h3>No Saved Sequences</h3>
          <p>
            Select multiple clipboard items in order from your history, then click &quot;Save Queue as Sequence&quot; in the selection queue bar to save them here!
          </p>
        </div>
      ) : (
        <div className="cv-sequences-grid">
          {sequences.map((seq) => (
            <div key={seq.id} className="cv-sequence-card">
              <div className="cv-sequence-card-header">
                <div>
                  <h3 className="cv-sequence-title">{seq.name}</h3>
                  {seq.description && <p className="cv-sequence-desc">{seq.description}</p>}
                </div>
                <button
                  type="button"
                  className="cv-btn-icon cv-btn-icon-danger"
                  onClick={() => handleDelete(seq.id)}
                  title="Delete sequence"
                  aria-label={`Delete sequence ${seq.name}`}
                >
                  🗑️
                </button>
              </div>

              <div className="cv-sequence-steps-list">
                <span className="cv-steps-label">Steps ({seq.items.length}):</span>
                <ol className="cv-steps-ordered-list">
                  {seq.items.map((step) => (
                    <li key={step.id || step.sequence_order} className="cv-step-item">
                      <span className="cv-step-badge">[{step.sequence_order}]</span>
                      <span className="cv-step-text">
                        {step.static_text || `Item #${step.item_id}`}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="cv-sequence-card-footer">
                <button
                  type="button"
                  className="cv-btn cv-btn-primary"
                  onClick={() => handleRun(seq)}
                  aria-label={`Load sequence ${seq.name} into active paste queue`}
                >
                  {feedbackId === seq.id ? "✓ Loaded to Queue!" : "▶️ Load into Active Queue"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

