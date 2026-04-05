import React, { useState, useEffect, useCallback } from 'react';
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
  onClose: () => void;
  onRestored: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function HistoryModal({ pageId, onClose, onRestored }: HistoryModalProps) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [selected, setSelected] = useState<VersionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    axios
      .get<Version[]>(`/api/pages/${pageId}/versions`)
      .then((res) => { setVersions(res.data); })
      .catch((err) => { console.error('Failed to load versions:', err); })
      .finally(() => setLoading(false));
  }, [pageId]);

  const handleSelect = useCallback(async (v: Version) => {
    try {
      const res = await axios.get<VersionDetail>(`/api/pages/${pageId}/versions/${v.id}`);
      setSelected(res.data);
    } catch (err) {
      console.error('Failed to load version:', err);
    }
  }, [pageId]);

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
                  <button
                    className="btn-primary history-restore-btn"
                    onClick={handleRestore}
                    disabled={restoring}
                  >
                    <RotateCcw size={14} />
                    {restoring ? 'Restoring...' : 'Restore this version'}
                  </button>
                </div>
                <div
                  className="history-preview-content tiptap-editor"
                  dangerouslySetInnerHTML={{ __html: selected.content }}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
