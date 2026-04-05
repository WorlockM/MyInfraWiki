import React, { useState, useRef, useEffect, useId } from 'react';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import { createLowlight, all } from 'lowlight';
import { Check, Copy } from 'lucide-react';
import mermaid from 'mermaid';

const lowlight = createLowlight(all);

// ─── Mermaid diagram renderer ─────────────────────────────────────────────────

function getMermaidTheme(): 'dark' | 'default' {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'default';
}

function MermaidDiagram({ code }: { code: string }) {
  const reactId = useId();
  const id = `mermaid-${reactId.replace(/[^a-z0-9]/gi, '')}`;
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');
  const [theme, setTheme] = useState(getMermaidTheme);

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(getMermaidTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!code.trim()) return;
    mermaid.initialize({ startOnLoad: false, theme, securityLevel: 'strict' });
    mermaid
      .render(id, code.trim())
      .then(({ svg: rendered }) => { setSvg(rendered); setError(''); })
      .catch((err: unknown) => {
        setError(String(err instanceof Error ? err.message : err).split('\n')[0]);
        setSvg('');
      })
      .finally(() => { document.getElementById(id)?.remove(); });
  }, [code, id, theme]);

  if (error) return (
    <div className="mermaid-error">
      <strong>Diagram error:</strong> {error}
    </div>
  );
  if (!svg) return null;
  return <div className="mermaid-diagram" dangerouslySetInnerHTML={{ __html: svg }} />;
}

const LANGUAGES = [
  { value: '',           label: 'Auto' },
  { value: 'bash',       label: 'Bash / Shell' },
  { value: 'powershell', label: 'PowerShell' },
  { value: 'python',     label: 'Python' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'json',       label: 'JSON' },
  { value: 'yaml',       label: 'YAML' },
  { value: 'toml',       label: 'TOML' },
  { value: 'ini',        label: 'INI' },
  { value: 'dockerfile', label: 'Dockerfile' },
  { value: 'nginx',      label: 'Nginx' },
  { value: 'sql',        label: 'SQL' },
  { value: 'xml',        label: 'XML' },
  { value: 'html',       label: 'HTML' },
  { value: 'css',        label: 'CSS' },
  { value: 'go',         label: 'Go' },
  { value: 'rust',       label: 'Rust' },
  { value: 'java',       label: 'Java' },
  { value: 'csharp',     label: 'C#' },
  { value: 'cpp',        label: 'C++' },
  { value: 'php',        label: 'PHP' },
  { value: 'ruby',       label: 'Ruby' },
  { value: 'swift',      label: 'Swift' },
  { value: 'kotlin',     label: 'Kotlin' },
  { value: 'markdown',   label: 'Markdown' },
  { value: 'plaintext',  label: 'Plain text' },
  { value: 'mermaid',    label: 'Mermaid diagram' },
];

interface CodeBlockProps {
  node: { attrs: { language?: string }; textContent: string };
  updateAttributes: (attrs: Record<string, unknown>) => void;
  extension: { options: { editable?: boolean } };
  editor: { isEditable: boolean };
}

function CodeBlockComponent({ node, updateAttributes, editor }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [lineCount, setLineCount] = useState(() =>
    Math.max(1, (node.textContent ?? '').split('\n').length)
  );
  const buttonRef = useRef<HTMLButtonElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const nodeRef = useRef(node);
  nodeRef.current = node;

  useEffect(() => {
    const pre = preRef.current;
    if (!pre) return;

    const getCount = () => {
      const codeEl = pre.querySelector('code:not(.code-line-numbers)');
      const text = codeEl?.textContent ?? '';
      return Math.max(1, text.split('\n').length);
    };

    setLineCount(getCount());

    const observer = new MutationObserver(() => setLineCount(getCount()));
    observer.observe(pre, { characterData: true, subtree: true, childList: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const btn = buttonRef.current;
    if (!btn) return;

    const handler = (e: MouseEvent) => {
      e.stopPropagation();
      const text = nodeRef.current.textContent ?? '';

      const fallback = () => {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      };

      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }).catch(fallback);
      } else {
        fallback();
      }
    };

    btn.addEventListener('click', handler);
    return () => btn.removeEventListener('click', handler);
  }, []);

  const currentLang = node.attrs.language ?? '';

  // In read mode, render Mermaid diagrams instead of code
  if (currentLang === 'mermaid' && !editor.isEditable) {
    return (
      <NodeViewWrapper className="code-block-wrapper">
        <MermaidDiagram code={node.textContent} />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper className="code-block-wrapper">
      <div className="code-block-header" contentEditable={false}>
        {editor.isEditable ? (
          <select
            className="code-block-lang-select"
            value={currentLang}
            onChange={(e) => updateAttributes({ language: e.target.value || null })}
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.value} value={lang.value}>
                {lang.label}
              </option>
            ))}
          </select>
        ) : (
          currentLang && <span className="code-block-lang">{currentLang}</span>
        )}
        <button
          ref={buttonRef}
          className={`code-copy-btn ${copied ? 'code-copy-btn--copied' : ''}`}
          title="Copy code"
          aria-label="Copy code"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre ref={preRef}>
        <code className="code-line-numbers" contentEditable={false}>
          {Array.from({ length: lineCount }, (_, i) => (
            <span key={i}>{i + 1}</span>
          ))}
        </code>
        <NodeViewContent as="code" />
      </pre>
    </NodeViewWrapper>
  );
}

export const CodeBlockWithCopy = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockComponent as any);
  },
}).configure({ lowlight });
