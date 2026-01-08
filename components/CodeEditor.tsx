import React, { useEffect, useState } from 'react';
import { ProjectFile } from '../types';

interface CodeEditorProps {
  file: ProjectFile;
  onChange: (newContent: string) => void;
}

const CodeEditor: React.FC<CodeEditorProps> = ({ file, onChange }) => {
  const [lines, setLines] = useState<number[]>([]);

  useEffect(() => {
    // Calculate line numbers
    const lineCount = (file.content || '').split('\n').length;
    setLines(Array.from({ length: Math.max(lineCount, 1) }, (_, i) => i + 1));
  }, [file.content]);

  return (
    <div className="flex h-full w-full bg-[#1e1e1e] font-mono text-sm overflow-hidden rounded-br-lg">
      {/* Line Numbers */}
      <div className="flex-none w-12 bg-[#1e1e1e] text-[#858585] text-right pr-3 pt-4 select-none border-r border-[#333] leading-6">
        {lines.map((line) => (
          <div key={line} className="h-6 text-xs">{line}</div>
        ))}
      </div>

      {/* Text Area */}
      <textarea
        className="flex-1 bg-[#1e1e1e] text-[#d4d4d4] p-0 pl-2 pt-4 border-none outline-none resize-none leading-6 whitespace-pre custom-scrollbar"
        value={file.content}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
      />
    </div>
  );
};

export default CodeEditor;
