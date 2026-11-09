import type { ReactNode } from 'react';

/** Mise en forme en ligne : **gras** et `code`. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((part, i) => {
    if (part.startsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`')) return <code key={i} className="ath-mono">{part.slice(1, -1)}</code>;
    return part;
  });
}

/** Rendu du sous-ensemble de Markdown utilisé par le guide : titres, paragraphes, listes à puces, blocs de code. */
export function Markdown({ source }: { source: string }) {
  const out: ReactNode[] = [];
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.startsWith('```')) {
      const code: string[] = [];
      for (i += 1; i < lines.length && !lines[i]!.startsWith('```'); i += 1) code.push(lines[i]!);
      out.push(<pre key={out.length} className="ath-mono ath-codeblock"><code>{code.join('\n')}</code></pre>);
      i += 1;
    } else if (/^#{1,4} /.test(line)) {
      const level = /^#+/.exec(line)![0].length;
      const Tag = (`h${Math.min(level + 1, 4)}`) as 'h2' | 'h3' | 'h4';
      out.push(<Tag key={out.length} className="ath-label">{inline(line.replace(/^#+ /, ''))}</Tag>);
      i += 1;
    } else if (/^\s*[-*] /.test(line)) {
      const items: string[] = [];
      for (; i < lines.length && /^\s*[-*] /.test(lines[i]!); i += 1) items.push(lines[i]!.replace(/^\s*[-*] /, ''));
      out.push(<ul key={out.length}>{items.map((t, k) => <li key={k}>{inline(t)}</li>)}</ul>);
    } else if (line.trim() === '') {
      i += 1;
    } else {
      const para: string[] = [];
      for (; i < lines.length && lines[i]!.trim() !== '' && !/^(#{1,4} |```|\s*[-*] )/.test(lines[i]!); i += 1) para.push(lines[i]!);
      out.push(<p key={out.length}>{inline(para.join(' '))}</p>);
    }
  }
  return <>{out}</>;
}
