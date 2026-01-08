import React, { useState, useMemo } from 'react';
import { ProjectFile } from '../types';
import { 
  FileCode, 
  FileJson, 
  ChevronRight, 
  ChevronDown, 
  Folder, 
  FolderOpen,
  File,
  Layout,
  FileText
} from 'lucide-react';

interface FileExplorerProps {
  files: ProjectFile[];
  onSelectFile: (file: ProjectFile) => void;
  selectedFile: ProjectFile | null;
}

type TreeNode = {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children: Record<string, TreeNode>;
  file?: ProjectFile;
};

const FileIcon = ({ name }: { name: string }) => {
  if (name.endsWith('.tsx') || name.endsWith('.ts')) return <FileCode size={14} className="text-blue-400" />;
  if (name.endsWith('.css')) return <Layout size={14} className="text-sky-300" />;
  if (name.endsWith('.json')) return <FileJson size={14} className="text-amber-300" />;
  if (name.endsWith('.html')) return <FileCode size={14} className="text-orange-400" />;
  return <FileText size={14} className="text-zinc-400" />;
};

interface TreeItemProps {
  node: TreeNode;
  level: number;
  onSelectFile: (file: ProjectFile) => void;
  selectedFile: ProjectFile | null;
}

const TreeItem: React.FC<TreeItemProps> = ({ 
  node, 
  level, 
  onSelectFile, 
  selectedFile 
}) => {
  const [isOpen, setIsOpen] = useState(true);

  const isSelected = selectedFile?.name === node.path;
  const paddingLeft = `${level * 16 + 12}px`; // Increased indentation

  if (node.type === 'folder') {
    const children = Object.values(node.children) as TreeNode[];
    return (
      <div>
        <div 
          className="flex items-center gap-2 py-1.5 cursor-pointer hover:bg-white/5 text-zinc-400 transition-colors"
          style={{ paddingLeft }}
          onClick={() => setIsOpen(!isOpen)}
        >
          {isOpen ? <ChevronDown size={14} className="opacity-70" /> : <ChevronRight size={14} className="opacity-70" />}
          {isOpen ? <FolderOpen size={14} className="text-zinc-500" /> : <Folder size={14} className="text-zinc-500" />}
          <span className="text-xs font-medium ml-0.5 select-none">{node.name}</span>
        </div>
        {isOpen && (
          <div>
            {children
              .sort((a, b) => {
                 if (a.type === b.type) return a.name.localeCompare(b.name);
                 return a.type === 'folder' ? -1 : 1;
              })
              .map(child => (
              <TreeItem 
                key={child.path} 
                node={child} 
                level={level + 1} 
                onSelectFile={onSelectFile}
                selectedFile={selectedFile}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div 
      className={`flex items-center gap-2 py-1.5 cursor-pointer text-zinc-400 hover:text-white transition-all ${isSelected ? 'bg-indigo-500/10 text-indigo-200' : 'hover:bg-white/5'}`}
      style={{ paddingLeft }}
      onClick={() => node.file && onSelectFile(node.file)}
    >
      <FileIcon name={node.name} />
      <span className={`text-xs select-none truncate ${node.file?.status === 'buggy' ? 'text-red-400' : ''}`}>
        {node.name}
      </span>
      {node.file?.status === 'buggy' && (
        <div className="w-1.5 h-1.5 rounded-full bg-red-500 ml-auto mr-2" title="Bug Detected" />
      )}
    </div>
  );
};

const FileExplorer: React.FC<FileExplorerProps> = ({ files, onSelectFile, selectedFile }) => {
  const tree = useMemo(() => {
    const root: Record<string, TreeNode> = {};

    files.forEach(file => {
      const parts = file.name.split('/');
      let currentLevel = root;
      let currentPath = '';

      parts.forEach((part, index) => {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        const isFile = index === parts.length - 1;
        
        if (!currentLevel[part]) {
          currentLevel[part] = {
            name: part,
            path: currentPath,
            type: isFile ? 'file' : 'folder',
            children: {},
            file: isFile ? file : undefined
          };
        }
        
        if (!isFile) {
          currentLevel = currentLevel[part].children;
        }
      });
    });

    return root;
  }, [files]);

  const rootNodes = Object.values(tree) as TreeNode[];

  return (
    <div className="flex flex-col h-full bg-[#101012] border-r border-white/5">
      <div className="px-4 py-3 text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center justify-between border-b border-white/5 bg-[#141417]">
        <span>Project Files</span>
        <span className="text-zinc-700">{files.length} ITEMS</span>
      </div>
      <div className="overflow-y-auto flex-1 custom-scrollbar py-2">
        {files.length === 0 && (
            <div className="text-zinc-700 text-xs text-center p-6 italic">No files generated yet</div>
        )}
        {rootNodes
           .sort((a, b) => {
               if (a.type === b.type) return a.name.localeCompare(b.name);
               return a.type === 'folder' ? -1 : 1;
           })
           .map(node => (
          <TreeItem 
            key={node.path} 
            node={node} 
            level={0} 
            onSelectFile={onSelectFile}
            selectedFile={selectedFile}
          />
        ))}
      </div>
    </div>
  );
};

export default FileExplorer;