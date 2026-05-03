import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { python } from '@codemirror/lang-python';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { markdown } from '@codemirror/lang-markdown';
import { yaml } from '@codemirror/lang-yaml';
import { oneDark } from '@codemirror/theme-one-dark';
import { useMemo } from 'react';

function langForPath(path: string) {
  const lower = path.toLowerCase();
  const ext = lower.slice(lower.lastIndexOf('.') + 1);
  switch (ext) {
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return [javascript({ jsx: ext === 'jsx' })];
    case 'ts':
    case 'tsx':
      return [javascript({ jsx: ext === 'tsx', typescript: true })];
    case 'json':
      return [json()];
    case 'py':
      return [python()];
    case 'html':
    case 'htm':
      return [html()];
    case 'css':
    case 'scss':
      return [css()];
    case 'md':
    case 'markdown':
      return [markdown()];
    case 'yaml':
    case 'yml':
      return [yaml()];
    default:
      return [];
  }
}

interface Props {
  path: string;
  value: string;
  onChange: (v: string) => void;
  height?: string;
  readOnly?: boolean;
}

export function CodeEditor({ path, value, onChange, height = '60vh', readOnly = false }: Props) {
  const extensions = useMemo(() => langForPath(path), [path]);
  return (
    <CodeMirror
      value={value}
      height={height}
      theme={oneDark}
      extensions={extensions}
      onChange={onChange}
      readOnly={readOnly}
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        highlightActiveLine: true,
        bracketMatching: true,
        autocompletion: true,
        searchKeymap: true,
        tabSize: 2,
      }}
    />
  );
}
