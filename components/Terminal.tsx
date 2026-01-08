import React, { useEffect, useRef } from 'react';
import { LogEntry } from '../types';
import { Terminal as TerminalIcon, Circle } from 'lucide-react';

interface TerminalProps {
  logs: LogEntry[];
}

const Terminal: React.FC<TerminalProps> = ({ logs }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const getLogColor = (type: LogEntry['type']) => {
    switch (type) {
      case 'error': return 'text-red-400';
      case 'success': return 'text-emerald-400';
      case 'warning': return 'text-amber-400';
      case 'system': return 'text-indigo-400';
      default: return 'text-zinc-400';
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] border border-white/10 rounded-xl overflow-hidden font-mono text-sm shadow-lg relative">
      {/* Terminal Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#141417] border-b border-white/5">
        <div className="flex items-center gap-2">
          <TerminalIcon size={12} className="text-zinc-600" />
          <span className="text-zinc-500 text-xs font-medium tracking-wide">DAION_CORE.LOG</span>
        </div>
        <div className="flex gap-1.5 opacity-50">
          <div className="w-2 h-2 rounded-full bg-zinc-700"></div>
          <div className="w-2 h-2 rounded-full bg-zinc-700"></div>
        </div>
      </div>

      {/* Terminal Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-thin scrollbar-thumb-zinc-800 bg-black/40">
        {logs.length === 0 && (
            <div className="text-zinc-700 italic text-xs">System standby...</div>
        )}
        {logs.map((log) => (
          <div key={log.id} className="flex gap-3 text-xs font-mono leading-relaxed">
            <span className="text-zinc-700 shrink-0 select-none w-14">{log.timestamp.split(' ')[0]}</span>
            <span className={`${getLogColor(log.type)} break-words flex-1`}>
              {log.type === 'system' && <span className="mr-2 text-indigo-500">➜</span>}
              {log.type === 'success' && <span className="mr-2 text-emerald-500">✔</span>}
              {log.type === 'error' && <span className="mr-2 text-red-500">✖</span>}
              {log.message}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Active Line Indicator */}
      <div className="p-1.5 bg-[#141417] border-t border-white/5 flex items-center gap-2 text-[10px] text-zinc-600 justify-end px-3">
         <span className="animate-pulse">●</span> ONLINE
      </div>
    </div>
  );
};

export default Terminal;