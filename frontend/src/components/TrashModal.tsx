import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Trash2, X, FileText, RotateCcw } from 'lucide-react';
import { showError, showToast } from '../toast';

interface TrashItem {
  id: string;
  title: string;
  deleted_at: string;
  subpage_count: number;
}

interface TrashResponse {
  retention_days: number;
  items: TrashItem[];
}

interface TrashModalProps {
  onClose: () => void;
  onRestored: (pageId: string) => void;
}

export default function TrashModal({ onClose, onRestored }: TrashModalProps) {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [retentionDays, setRetentionDays] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await axios.get<TrashResponse>('/api/trash');
      setItems(res.data.items);
      setRetentionDays(res.data.retention_days);
    } catch (err) {
      showError('Could not load the trash', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Close on Escape, consistent with the other modals
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleRestore = async (item: TrashItem) => {
    setBusyId(item.id);
    try {
      await axios.post(`/api/trash/${item.id}/restore`);
      showToast('success', `Restored "${item.title || 'Untitled'}"`);
      onRestored(item.id);
    } catch (err) {
      showError('Could not restore the page', err);
      setBusyId(null);
    }
  };

  const handleDelete = async (item: TrashItem) => {
    const subpages = item.subpage_count > 0 ? ` and its ${item.subpage_count} sub-page(s)` : '';
    if (!window.confirm(`Permanently delete "${item.title || 'Untitled'}"${subpages}? This cannot be undone.`)) return;
    setBusyId(item.id);
    try {
      await axios.delete(`/api/trash/${item.id}`);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch (err) {
      showError('Could not delete the page', err);
    } finally {
      setBusyId(null);
    }
  };

  const handleEmpty = async () => {
    if (!window.confirm('Permanently delete all pages in the trash? This cannot be undone.')) return;
    setBusyId('*');
    try {
      await axios.delete('/api/trash');
      setItems([]);
    } catch (err) {
      showError('Could not empty the trash', err);
    } finally {
      setBusyId(null);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="search-modal-backdrop" onClick={handleBackdropClick}>
      <div className="search-modal trash-modal" role="dialog" aria-label="Trash" aria-modal="true">
        <div className="trash-modal__header">
          <span className="trash-modal__title">
            <Trash2 size={15} />
            Trash
          </span>
          <button className="icon-btn" onClick={onClose} aria-label="Close trash">
            <X size={16} />
          </button>
        </div>

        <div className="search-results">
          {loading && <div className="search-loading">Loading...</div>}
          {!loading && items.length === 0 && <div className="search-no-results">The trash is empty</div>}
          {items.map((item) => (
            <div key={item.id} className="trash-item">
              <FileText size={15} className="search-result-icon" />
              <div className="search-result-text">
                <div className="search-result-title">{item.title || 'Untitled'}</div>
                <div className="trash-item__meta">
                  Deleted{' '}
                  {new Date(item.deleted_at).toLocaleString(undefined, {
                    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                  })}
                  {item.subpage_count > 0 && ` · ${item.subpage_count} sub-page${item.subpage_count === 1 ? '' : 's'}`}
                </div>
              </div>
              <button
                className="trash-item__btn"
                onClick={() => handleRestore(item)}
                disabled={busyId !== null}
                title="Restore page"
              >
                <RotateCcw size={13} />
                Restore
              </button>
              <button
                className="trash-item__btn trash-item__btn--danger"
                onClick={() => handleDelete(item)}
                disabled={busyId !== null}
                title="Delete permanently"
                aria-label="Delete permanently"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>

        <div className="search-footer trash-modal__footer">
          <span className="search-shortcut">
            {retentionDays !== null && `Pages are permanently deleted after ${retentionDays} days in the trash.`}
          </span>
          {items.length > 0 && (
            <button className="trash-item__btn trash-item__btn--danger" onClick={handleEmpty} disabled={busyId !== null}>
              Empty trash
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
