import React, { useState } from 'react';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import { createLowlight } from 'lowlight';
import { Check, Copy } from 'lucide-react';

const lowlight = createLowlight();

function CodeBlockComponent({ node }: { node: { attrs: { language?: string }; textContent: string } }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const text = node.textContent ?? '';
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
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
    });
  };

  return (
    <NodeViewWrapper className="code-block-wrapper">
      <button
        className={`code-copy-btn ${copied ? 'code-copy-btn--copied' : ''}`}
        onClick={handleCopy}
        onMouseDown={e => e.preventDefault()}
        contentEditable={false}
        title="Copy code"
        aria-label="Copy code"
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
        {copied ? 'Copied!' : 'Copy'}
      </button>
      {node.attrs.language && (
        <span className="code-block-lang" contentEditable={false}>
          {node.attrs.language}
        </span>
      )}
      <pre>
        <NodeViewContent as="code" />
      </pre>
    </NodeViewWrapper>
  );
}

export const CodeBlockWithCopy = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockComponent);
  },
}).configure({ lowlight });
