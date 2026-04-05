import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { X, Clock, RotateCcw } from 'lucide-react';

interface Version {
  id: string;
  title: string;
  saved_at: string;
  version_number: number;
}

interface VersionDetail extends Version {
  content: string;
}

interface HistoryModalProps {
  pageId: string;
  currentContent: string;
  onClose: () => void;
  onRestored: () => void;
}

// ─── Word-level diff (no external dependency) ─────────────────────────────────

interface DiffToken {
  value: string;
  added?: boolean;
  removed?: boolean;
}

function htmlToText(html: string): string {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el.textContent ?? '';
}

/** Split text into word+whitespace tokens, preserving whitespace as separate entries */
function tokenize(text: string): string[] {
  return text.split(/(\s+)/).filter((t) => t.length > 0);
}

/** LCS-based word diff between two plain-text strings */
function wordDiff(oldText: string, newText: string): DiffToken[] {
  const a = tokenize(oldText);
  const b = tokenize(newText);
  const m = a.length;
  const n = b.length;

  // Build LCS table (limit size to avoid extreme slowness on huge docs)
  const MAX = 4000;
  if (m > MAX || n > MAX) {
    // Fallback: show old as removed, new as added
    return [
      ...a.map((v) => ({ value: v, removed: true as const })),
      ...b.map((v) => ({ value: v, added: true as const })),
    ];
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack
  const result: DiffToken[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.unshift({ value: a[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ value: b[j - 1], added: true });
      j--;
    } else {
      result.unshift({ value: a[i - 1], removed: true });
      i--;
    }
  }
  return result;
}

function DiffView({ oldContent, newContent }: { oldContent: string; newContent: string }) {
  const tokens = useMemo(
    () => wordDiff(htmlToText(oldContent), htmlToText(newContent)),
    [oldContent, newContent]
  );

  return (
    <div className="history-diff-view">
      {tokens.map((t, i) =>
        t.added ? (
          <mark key={i} className="diff-added">{t.value}</mark>
        ) : t.removed ? (
          <del key={i} className="diff-removed">{t.value}</del>
        ) : (
          <span key={i}>{t.value}</span>
        )
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function HistoryModal({ pageId, currentContent, onClose, onRestored }: HistoryModalProps) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [selected, setSelected] = useState<VersionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(false);
  const [view, setView] = useState<'preview' | 'changes'>('preview');

  useEffect(() => {
    axios
      .get<Version[]>(`/api/pages/${pageId}/versions`)
      .then((res) => setVersions(res.data))
      .catch((err) => console.error('Failed to load versions:', err))
      .finally(() => setLoading(false));
  }, [pageId]);

  const handleSelect = useCallback(
    async (v: Version) => {
      try {
        const res = await axios.get<VersionDetail>(`/api/pages/${pageId}/versions/${v.id}`);
        setSelected(res.data);
        setView('preview');
      } catch (err) {
        console.error('Failed to load version:', err);
      }
    },
    [pageId]
  );

  const handleRestore = useCallback(async () => {
    if (!selected) return;
    if (!window.confirm(`Restore to version ${selected.version_number}? The current version is automatically saved to history.`)) return;
    setRestoring(true);
    try {
      await axios.post(`/api/pages/${pageId}/restore/${selected.id}`);
      onRestored();
      onClose();
    } catch (err) {
      console.error('Failed to restore:', err);
      setRestoring(false);
    }
  }, [selected, pageId, onRestored, onClose]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="history-modal-backdrop" onClick={handleBackdropClick}>
      <div className="history-modal" role="dialog" aria-label="Page history" aria-modal="true">
        <div className="history-modal-header">
          <div className="history-modal-title">
            <Clock size={15} />
            <span>Page history</span>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close history">
            <X size={16} />
          </button>
        </div>

        <div className="history-modal-body">
          <div className="history-version-list">
            {loading && <div className="history-empty">Loading...</div>}
            {!loading && versions.length === 0 && (
              <div className="history-empty">
                No previous versions yet. Versions are saved automatically each time you save the page.
              </div>
            )}
            {versions.map((v) => (
              <button
                key={v.id}
                className={`history-version-item${selected?.id === v.id ? ' history-version-item--selected' : ''}`}
                onClick={() => handleSelect(v)}
              >
                <div className="history-version-badge">v{v.version_number}</div>
                <div className="history-version-info">
                  <div className="history-version-title">{v.title || 'Untitled'}</div>
                  <div className="history-version-date">{formatDate(v.saved_at)}</div>
                </div>
              </button>
            ))}
          </div>

          <div className="history-preview">
            {!selected ? (
              <div className="history-preview-empty">Select a version on the left to preview it</div>
            ) : (
              <>
                <div className="history-preview-header">
                  <h2 className="history-preview-title">{selected.title || 'Untitled'}</h2>
                  <div className="history-preview-actions">
                    <div className="history-view-toggle">
                      <button
                        className={`history-toggle-btn${view === 'preview' ? ' history-toggle-btn--active' : ''}`}
                        onClick={() => setView('preview')}
                      >
                        Preview
                      </button>
                      <button
                        className={`history-toggle-btn${view === 'changes' ? ' history-toggle-btn--active' : ''}`}
                        onClick={() => setView('changes')}
                      >
                        Changes
                      </button>
                    </div>
                    <button
                      className="btn-primary history-restore-btn"
                      onClick={handleRestore}
                      disabled={restoring}
                    >
                      <RotateCcw size={14} />
                      {restoring ? 'Restoring...' : 'Restore this version'}
                    </button>
                  </div>
                </div>

                {view === 'preview' ? (
                  <div
                    className="history-preview-content tiptap-editor"
                    dangerouslySetInnerHTML={{ __html: selected.content }}
                  />
                ) : (
                  <div className="history-preview-content">
                    <DiffView oldContent={selected.content} newContent={currentContent} />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
