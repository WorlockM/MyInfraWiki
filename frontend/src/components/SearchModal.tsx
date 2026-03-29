import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { Search, X, FileText } from 'lucide-react';

interface SearchResult {
  id: string;
  title: string;
  snippet: string;
}

interface SearchModalProps {
  onClose: () => void;
  onSelectPage: (id: string) => void;
}

export default function SearchModal({ onClose, onSelectPage }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await axios.get<SearchResult[]>(`/api/search?q=${encodeURIComponent(q)}`);
      setResults(res.data);
      setSelectedIndex(0);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      search(query);
    }, 200);
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [query, search]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      onSelectPage(results[selectedIndex].id);
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
      <div className="search-modal" role="dialog" aria-label="Search pages" aria-modal="true">
        <div className="search-input-wrapper">
          <Search size={17} className="search-input-icon" />
          <input
            ref={inputRef}
            className="search-input"
            type="text"
            placeholder="Search pages..."
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
          {loading && <div className="search-loading">Searching...</div>}

          {!loading && query && results.length === 0 && (
            <div className="search-no-results">No results for &ldquo;{query}&rdquo;</div>
          )}

          {!loading && results.map((result, index) => (
            <button
              key={result.id}
              className={`search-result-item ${index === selectedIndex ? 'search-result-item--selected' : ''}`}
              onClick={() => onSelectPage(result.id)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <FileText size={15} className="search-result-icon" />
              <div className="search-result-text">
                <div className="search-result-title">{result.title || 'Untitled'}</div>
                {result.snippet && (
                  <div className="search-result-snippet">{result.snippet}</div>
                )}
              </div>
            </button>
          ))}

          {!query && (
            <div className="search-hint">
              Type to search across all pages
            </div>
          )}
        </div>

        <div className="search-footer">
          <span className="search-shortcut"><kbd>↑↓</kbd> Navigate</span>
          <span className="search-shortcut"><kbd>Enter</kbd> Open</span>
          <span className="search-shortcut"><kbd>Esc</kbd> Close</span>
        </div>
      </div>
    </div>
  );
}
