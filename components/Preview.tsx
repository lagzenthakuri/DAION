import React, { useEffect, useRef, useState } from 'react';
import { ProjectFile } from '../types';
import { RefreshCw, Smartphone, Monitor } from 'lucide-react';

interface PreviewProps {
  files: ProjectFile[];
}

const Preview: React.FC<PreviewProps> = ({ files }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [key, setKey] = useState(0);
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>('desktop');

  useEffect(() => {
    const updatePreview = () => {
      const iframe = iframeRef.current;
      if (!iframe) return;

      // Filter relevant files
      const cssFiles = files.filter(f => f.name.endsWith('.css'));
      const jsFiles = files.filter(f => (f.name.endsWith('.ts') || f.name.endsWith('.tsx') || f.name.endsWith('.js') || f.name.endsWith('.jsx')) && !f.name.endsWith('.d.ts'));

      // Sort files: Dependencies first (helpers/components) -> Entry point last
      // Heuristic: Entry points usually import others. Files importing './X' should come after 'X'.
      // Simple heuristic: 'App' or 'index' or 'main' come last.
      const sortedJsFiles = [...jsFiles].sort((a, b) => {
        const isEntryA = a.name.includes('index') || a.name.includes('main') || a.name.includes('App');
        const isEntryB = b.name.includes('index') || b.name.includes('main') || b.name.includes('App');
        if (isEntryA && !isEntryB) return 1;
        if (!isEntryA && isEntryB) return -1;
        return 0;
      });

      let bundledCode = '';
      
      // Shim external libraries
      bundledCode += `
        // Environment Shims
        window.process = { env: { NODE_ENV: 'development' } };
        const { useState, useEffect, useRef, useMemo, useCallback, useContext, createContext, useReducer } = React;
        const { createRoot } = ReactDOM;
        // Lucide Shim - try to get from global or fallback
        const Lucide = window.lucide || {}; 
        const Recharts = window.Recharts || {};
      `;

      sortedJsFiles.forEach(file => {
        let content = file.content;
        
        // 1. Handle External Imports
        // import { X } from 'lucide-react' -> const { X } = Lucide;
        content = content.replace(/import\s+\{([^}]+)\}\s+from\s+['"]lucide-react['"];?/g, (match, imports) => {
            return `const {${imports}} = window.lucide;`;
        });
        
        // import { X } from 'recharts' -> const { X } = Recharts;
        content = content.replace(/import\s+\{([^}]+)\}\s+from\s+['"]recharts['"];?/g, (match, imports) => {
            return `const {${imports}} = window.Recharts;`;
        });

        // import React from 'react' -> nothing (React is global)
        content = content.replace(/import\s+React\s*,?\s*(\{?[^}]*\}?)?\s+from\s+['"]react['"];?/g, '');
        content = content.replace(/import\s+\*?\s*as\s+React\s+from\s+['"]react['"];?/g, '');
        
        // 2. Handle Local Imports
        // import Header from './Header' -> nothing (Header is in global scope)
        // import { Header } from './Header' -> nothing
        content = content.replace(/import\s+.*?\s+from\s+['"]\.\/.*?['"];?/g, '');

        // 3. Handle Exports
        // export default function App -> window.App = function App
        content = content.replace(/export\s+default\s+function\s+(\w+)/g, 'window.$1 = function $1');
        content = content.replace(/export\s+default\s+class\s+(\w+)/g, 'window.$1 = class $1');
        // export default App -> window.App = App
        content = content.replace(/export\s+default\s+(\w+);?/g, 'window.$1 = $1;');
        
        // export function X -> window.X = function X
        content = content.replace(/export\s+function\s+(\w+)/g, 'window.$1 = function $1');
        // export const X = ... -> window.X = ...
        content = content.replace(/export\s+const\s+(\w+)/g, 'window.$1');
        
        // Remove remaining 'export' keywords for anything else
        content = content.replace(/^export\s+/gm, '');

        bundledCode += `\n/* --- ${file.name} --- */\n${content}\n`;
      });

      // 4. Entry Point Execution
      if (!bundledCode.includes('createRoot') && !bundledCode.includes('ReactDOM.render')) {
         bundledCode += `
           const rootElement = document.getElementById('root');
           // Try to find the App component on window
           const AppComp = window.App || window.Main || (typeof App !== 'undefined' ? App : null);
           
           if (rootElement && AppComp) {
             const root = createRoot(rootElement);
             root.render(<AppComp />);
           } else {
             console.warn("Could not find App component to render");
           }
         `;
      }

      const cssContent = cssFiles.map(f => f.content).join('\n');

      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            
            <!-- React & ReactDOM -->
            <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
            <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
            
            <!-- Babel -->
            <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
            
            <!-- Tailwind -->
            <script src="https://cdn.tailwindcss.com"></script>
            
            <!-- Libraries: Lucide React, Recharts -->
            <!-- Lucide UMD is tricky, using a comprehensive build or just vanilla might be safer, 
                 but generated code uses React components. 
                 Using a specialized build for lucide-react if available. 
                 If not, we might need to rely on the shim returning empty spans to prevent crashes.
            -->
            <script src="https://unpkg.com/lucide@latest"></script> <!-- Vanilla Lucide -->
            <script src="https://unpkg.com/lucide-react@latest/dist/umd/lucide-react.min.js"></script>
            <script src="https://unpkg.com/recharts/umd/Recharts.js"></script>

            <style>
              ${cssContent}
              body { background-color: #ffffff; color: #000000; font-family: sans-serif; }
              #root { width: 100%; height: 100%; }
            </style>
          </head>
          <body>
            <div id="root"></div>
            <script type="text/babel" data-presets="react,typescript">
              ${bundledCode}
            </script>
            <script>
              window.onerror = function(message, source, lineno, colno, error) {
                console.error(error);
                document.body.innerHTML = \`<div style="color: #ef4444; padding: 24px; font-family: monospace; background: #fee2e2; border-bottom: 2px solid #ef4444;">
                    <h3 style="margin-top:0; font-weight: bold;">Preview Runtime Error</h3>
                    <div>\${message}</div>
                    <div style="font-size: 12px; margin-top: 12px; opacity: 0.8;">Line \${lineno}</div>
                </div>\`;
              };
            </script>
          </body>
        </html>
      `;

      const blob = new Blob([htmlContent], { type: 'text/html' });
      iframe.src = URL.createObjectURL(blob);
    };

    const timeout = setTimeout(updatePreview, 500);
    return () => clearTimeout(timeout);
  }, [files, key]);

  return (
    <div className="flex flex-col h-full bg-[#0c0c0e] rounded-br-lg overflow-hidden">
      <div className="h-10 bg-[#18181b] border-b border-white/5 flex items-center justify-between px-4">
        <span className="text-xs text-zinc-500 font-medium">Live Preview Environment</span>
        <div className="flex items-center gap-2">
            <button 
                onClick={() => setViewMode('desktop')} 
                className={`p-1.5 rounded transition-all ${viewMode === 'desktop' ? 'text-white bg-white/10' : 'text-zinc-500 hover:text-zinc-300'}`}
                title="Desktop View"
            >
                <Monitor size={14} />
            </button>
            <button 
                onClick={() => setViewMode('mobile')} 
                className={`p-1.5 rounded transition-all ${viewMode === 'mobile' ? 'text-white bg-white/10' : 'text-zinc-500 hover:text-zinc-300'}`}
                title="Mobile View"
            >
                <Smartphone size={14} />
            </button>
            <button 
                onClick={() => setKey(k => k + 1)} 
                className="p-1.5 text-zinc-500 hover:text-white hover:bg-white/10 rounded transition-colors"
                title="Refresh Preview"
            >
                <RefreshCw size={14} />
            </button>
        </div>
      </div>
      <div className="flex-1 bg-[#0c0c0e] flex items-center justify-center p-6 relative">
        <div className="absolute inset-0 bg-[radial-gradient(#1f2937_1px,transparent_1px)] [background-size:16px_16px] opacity-20 pointer-events-none"></div>
        <div 
            className={`bg-white transition-all duration-300 ease-in-out shadow-2xl overflow-hidden relative z-10 ${
                viewMode === 'mobile' ? 'w-[375px] h-[667px] rounded-[3rem] border-8 border-zinc-800' : 'w-full h-full rounded-lg border border-zinc-800'
            }`}
        >
            <iframe 
            ref={iframeRef}
            className="w-full h-full border-0 bg-white"
            title="Preview"
            sandbox="allow-scripts allow-same-origin allow-modals"
            />
        </div>
      </div>
    </div>
  );
};

export default Preview;