import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { Search, X, FileText } from 'lucide-react';

interface PageItem {
  id: string;
  title: string;
}

interface WikiLinkModalProps {
  onClose: () => void;
  onSelect: (pageId: string, pageTitle: string) => void;
}

export default function WikiLinkModal({ onClose, onSelect }: WikiLinkModalProps) {
  const [query, setQuery] = useState('');
  const [allPages, setAllPages] = useState<PageItem[]>([]);
  const [results, setResults] = useState<PageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    axios
      .get<PageItem[]>('/api/pages')
      .then((res) => {
        setAllPages(res.data);
        setResults(res.data);
      })
      .catch((err) => console.error('Failed to fetch pages:', err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults(allPages);
    } else {
      const q = query.toLowerCase();
      setResults(allPages.filter((p) => (p.title || 'Untitled').toLowerCase().includes(q)));
    }
    setSelectedIndex(0);
  }, [query, allPages]);

  const handleSelect = useCallback(
    (page: PageItem) => {
      onSelect(page.id, page.title || 'Untitled');
    },
    [onSelect]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      handleSelect(results[selectedIndex]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="search-modal-backdrop" onClick={handleBackdropClick}>
      <div className="search-modal" role="dialog" aria-label="Link to page" aria-modal="true">
        <div className="search-input-wrapper">
          <Search size={17} className="search-input-icon" />
          <input
            ref={inputRef}
            className="search-input"
            type="text"
            placeholder="Search pages to link..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Search query"
          />
          {query && (
            <button className="search-clear-btn" onClick={() => setQuery('')} aria-label="Clear search">
              <X size={15} />
            </button>
          )}
        </div>

        <div className="search-results">
          {loading && <div className="search-loading">Loading pages...</div>}

          {!loading && results.length === 0 && (
            <div className="search-no-results">No pages found{query ? ` for "${query}"` : ''}</div>
          )}

          {!loading &&
            results.map((page, index) => (
              <button
                key={page.id}
                className={`search-result-item ${index === selectedIndex ? 'search-result-item--selected' : ''}`}
                onClick={() => handleSelect(page)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <FileText size={15} className="search-result-icon" />
                <div className="search-result-text">
                  <div className="search-result-title">{page.title || 'Untitled'}</div>
                </div>
              </button>
            ))}
        </div>

        <div className="search-footer">
          <span className="search-shortcut"><kbd>↑↓</kbd> Navigate</span>
          <span className="search-shortcut"><kbd>Enter</kbd> Link</span>
          <span className="search-shortcut"><kbd>Esc</kbd> Close</span>
        </div>
      </div>
    </div>
  );
}
