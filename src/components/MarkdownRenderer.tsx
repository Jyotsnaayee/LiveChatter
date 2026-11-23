import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';

function isSafeHttpUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function SpoilerSpan({ text }: { text: string }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setRevealed((r) => !r)}
      title={revealed ? 'Click to hide spoiler' : 'Click to reveal spoiler'}
      className={`inline rounded px-1.5 py-0.5 text-left transition-colors ${
        revealed
          ? 'bg-slate-200/80 dark:bg-slate-700/80 text-inherit'
          : 'bg-slate-800 dark:bg-slate-600 text-transparent hover:bg-slate-700 select-none'
      }`}
    >
      {text}
    </button>
  );
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard?.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  return (
    <div className="my-2 overflow-hidden rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#14171F]">
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/8 px-3 py-1.5 text-xs text-slate-500 dark:text-slate-400">
        <span className="font-mono">{lang || 'code'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 transition-colors"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-[13px] leading-relaxed text-slate-800 dark:text-slate-200">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function renderInline(line: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const tokenRegex =
    /(\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\|\|[^|]+\|\||`[^`]+`|\*[^*\s][^*]*\*|\[([^\]]+)\]\(([^)]+)\)|@[a-zA-Z0-9._-]+|#[a-zA-Z0-9_-]+)/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = tokenRegex.exec(line)) !== null) {
    if (match.index > lastIdx) {
      nodes.push(line.slice(lastIdx, match.index));
    }
    const token = match[0];
    const key = `${keyPrefix}-${idx++}`;

    if (token.startsWith('**') && token.endsWith('**')) {
      nodes.push(
        <strong key={key} className="font-semibold text-slate-950 dark:text-white">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('__') && token.endsWith('__')) {
      nodes.push(
        <span key={key} className="underline underline-offset-2">
          {token.slice(2, -2)}
        </span>
      );
    } else if (token.startsWith('~~') && token.endsWith('~~')) {
      nodes.push(
        <del key={key} className="text-slate-500 dark:text-slate-400">
          {token.slice(2, -2)}
        </del>
      );
    } else if (token.startsWith('||') && token.endsWith('||')) {
      nodes.push(<SpoilerSpan key={key} text={token.slice(2, -2)} />);
    } else if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(
        <code
          key={key}
          className="rounded bg-slate-200/80 dark:bg-white/10 px-1.5 py-0.5 font-mono text-[12.5px] text-slate-800 dark:text-slate-200"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      nodes.push(
        <em key={key} className="italic">
          {token.slice(1, -1)}
        </em>
      );
    } else if (match[2] && match[3]) {
      const label = match[2];
      const href = match[3];
      if (isSafeHttpUrl(href)) {
        nodes.push(
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent)] underline decoration-[var(--accent)]/40 underline-offset-2 hover:decoration-[var(--accent)]"
          >
            {label}
          </a>
        );
      } else {
        nodes.push(label);
      }
    } else if (token.startsWith('@')) {
      nodes.push(
        <span
          key={key}
          className="rounded bg-[var(--accent-soft)] px-1 py-0.5 font-medium text-[var(--accent)]"
        >
          {token}
        </span>
      );
    } else if (token.startsWith('#')) {
      nodes.push(
        <span
          key={key}
          className="rounded bg-slate-200/70 dark:bg-white/8 px-1 py-0.5 font-medium text-slate-700 dark:text-slate-200"
        >
          {token}
        </span>
      );
    } else {
      nodes.push(token);
    }
    lastIdx = match.index + token.length;
  }

  if (lastIdx < line.length) {
    nodes.push(line.slice(lastIdx));
  }
  return nodes;
}

export function MarkdownRenderer({ content }: { content: string }) {
  if (!content) return null;

  const segments: Array<{ kind: 'code'; lang: string; value: string } | { kind: 'text'; value: string }> = [];
  const fenceRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = fenceRegex.exec(content)) !== null) {
    if (m.index > last) {
      segments.push({ kind: 'text', value: content.slice(last, m.index) });
    }
    segments.push({ kind: 'code', lang: m[1] || '', value: m[2].replace(/\n$/, '') });
    last = m.index + m[0].length;
  }
  if (last < content.length) {
    segments.push({ kind: 'text', value: content.slice(last) });
  }

  return (
    <div className="space-y-1.5 text-[15px] leading-relaxed text-slate-800 dark:text-slate-200 break-words">
      {segments.map((seg, sIdx) => {
        if (seg.kind === 'code') {
          return <CodeBlock key={sIdx} lang={seg.lang} code={seg.value} />;
        }
        const lines = seg.value.split('\n');
        return (
          <div key={sIdx} className="space-y-1">
            {lines.map((line, lIdx) => {
              if (!line.trim()) return <div key={lIdx} className="h-1.5" />;
              if (line.startsWith('## ')) {
                return (
                  <h4 key={lIdx} className="font-display text-base font-bold text-slate-950 dark:text-white pt-1">
                    {renderInline(line.slice(3), `${sIdx}-${lIdx}`)}
                  </h4>
                );
              }
              if (line.startsWith('# ')) {
                return (
                  <h3 key={lIdx} className="font-display text-lg font-bold text-slate-950 dark:text-white pt-1">
                    {renderInline(line.slice(2), `${sIdx}-${lIdx}`)}
                  </h3>
                );
              }
              if (line.startsWith('> ')) {
                return (
                  <blockquote
                    key={lIdx}
                    className="rounded-md bg-slate-100/80 dark:bg-white/[0.04] border border-slate-200 dark:border-white/8 px-3 py-1.5 text-slate-600 dark:text-slate-300"
                  >
                    {renderInline(line.slice(2), `${sIdx}-${lIdx}`)}
                  </blockquote>
                );
              }
              if (line.startsWith('- ') || line.startsWith('• ')) {
                return (
                  <div key={lIdx} className="flex gap-2 pl-2">
                    <span className="text-slate-400 select-none">•</span>
                    <span>{renderInline(line.slice(2), `${sIdx}-${lIdx}`)}</span>
                  </div>
                );
              }
              return <p key={lIdx}>{renderInline(line, `${sIdx}-${lIdx}`)}</p>;
            })}
          </div>
        );
      })}
    </div>
  );
}
