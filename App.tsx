import React, { useState, useEffect, useRef } from 'react';
import { Play, RotateCcw, Box, Activity, Cpu, Code2, Bug, FileText, TestTube, Send, Square, Eye, Terminal as TerminalIcon, Plus, Trash2, Sparkles } from 'lucide-react';
import Terminal from './components/Terminal';
import ProjectMetrics from './components/ProjectMetrics';
import FileExplorer from './components/FileExplorer';
import CodeEditor from './components/CodeEditor';
import Preview from './components/Preview';
import { 
    AgentStatus, 
    LogEntry, 
    ProjectState, 
    ProjectFile, 
    ChartDataPoint,
    Message
} from './types';
import { 
    generateProjectPlan, 
    generateFileContent, 
    runAutonomousTests, 
    refactorCode,
    generateFinalReport,
    refineProject
} from './services/geminiService';

const INITIAL_STATE: ProjectState = {
  name: '',
  description: '',
  files: [],
  testResults: [],
  qualityScore: 0,
  iteration: 0,
  logs: [],
  status: AgentStatus.IDLE,
  generatedArtifacts: [],
  report: null
};

const STORAGE_KEY_STATE = 'daion_project_state_v1';
const STORAGE_KEY_MESSAGES = 'daion_messages_v1';

const App: React.FC = () => {
  // Load state from local storage or use initial
  const [state, setState] = useState<ProjectState>(() => {
    try {
        const saved = localStorage.getItem(STORAGE_KEY_STATE);
        return saved ? JSON.parse(saved) : INITIAL_STATE;
    } catch (e) {
        return INITIAL_STATE;
    }
  });

  const [messages, setMessages] = useState<Message[]>(() => {
    try {
        const saved = localStorage.getItem(STORAGE_KEY_MESSAGES);
        return saved ? JSON.parse(saved) : [];
    } catch (e) {
        return [];
    }
  });

  const [chatInput, setChatInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<ProjectFile | null>(null);
  const [metricsData, setMetricsData] = useState<ChartDataPoint[]>([]);
  const [activeTab, setActiveTab] = useState<'code' | 'preview'>('code');
  
  const abortController = useRef<boolean>(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Persistence Effects
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_STATE, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(messages));
  }, [messages]);

  // Re-calculate metrics from loaded state history (simplification)
  useEffect(() => {
    if (state.iteration > 0 && metricsData.length === 0) {
        // Recover simple metrics if lost on refresh
        setMetricsData([{ iteration: state.iteration, quality: state.qualityScore, bugs: state.testResults.filter(t => !t.passed).length }]);
    }
  }, []);

  // Helper to add log
  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    setState(prev => ({
      ...prev,
      logs: [...prev.logs, {
        id: Math.random().toString(36).substr(2, 9),
        timestamp: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second:'2-digit' }),
        message,
        type
      }]
    }));
  };

  const handleCodeChange = (newContent: string) => {
    if (!selectedFile) return;
    setSelectedFile(prev => prev ? { ...prev, content: newContent } : null);
    setState(prev => ({
      ...prev,
      files: prev.files.map(f => f.name === selectedFile.name ? { ...f, content: newContent } : f)
    }));
  };

  const handleNewProject = () => {
    if (window.confirm("Start a new project? This will clear all current history and files.")) {
        setState(INITIAL_STATE);
        setMessages([]);
        setMetricsData([]);
        setSelectedFile(null);
        setChatInput('');
        localStorage.removeItem(STORAGE_KEY_STATE);
        localStorage.removeItem(STORAGE_KEY_MESSAGES);
    }
  };

  const handleManualTest = async () => {
    if (state.files.length === 0) return;
    const wasCompleted = state.status === AgentStatus.COMPLETED;
    setState(prev => ({ ...prev, status: AgentStatus.TESTING }));
    addLog('Manual Override: Initiating autonomous test suite...', 'system');

    try {
        const analysis = await runAutonomousTests(state.files);
        const qualityScore = analysis.qualityScore;
        const bugCount = analysis.results.filter(r => !r.passed).length;
        
        setMetricsData(prev => {
            const nextIter = prev.length > 0 ? prev[prev.length - 1].iteration + 1 : 1;
            return [...prev, { iteration: nextIter, quality: qualityScore, bugs: bugCount }];
        });

        setState(prev => ({ 
            ...prev, 
            testResults: analysis.results,
            qualityScore: analysis.qualityScore,
            status: wasCompleted ? AgentStatus.COMPLETED : AgentStatus.IDLE
        }));

        if (analysis.vibeCheck.degraded) {
            addLog('System vibe degraded.', 'warning');
            addLog(`Vibe Inspector: ${analysis.vibeCheck.reason}`, 'info');
        } else {
            addLog(`Quality Score: ${qualityScore}/100. Bugs detected: ${bugCount}`, qualityScore > 80 ? 'success' : 'warning');
        }
    } catch (e: any) {
        addLog(`Test run failed: ${e.message}`, 'error');
        setState(prev => ({ ...prev, status: AgentStatus.IDLE }));
    }
  };

  const handleStop = () => {
    abortController.current = true;
    addLog('Process termination requested by user.', 'warning');
    setState(prev => ({ ...prev, status: AgentStatus.STOPPED }));
  };

  const checkAbort = () => {
    if (abortController.current) {
        throw new Error("Process stopped by user");
    }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || !process.env.API_KEY) return;

    const userMsg: Message = { role: 'user', text: chatInput, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setChatInput('');
    abortController.current = false;

    // SCENARIO 1: START NEW PROJECT
    if (state.status === AgentStatus.IDLE || state.status === AgentStatus.STOPPED || state.files.length === 0) {
        handleStartMarathon(userMsg.text);
        return;
    }

    // SCENARIO 2: REFINE EXISTING PROJECT
    if (state.status === AgentStatus.COMPLETED || state.status === AgentStatus.FAILED || state.status === AgentStatus.TESTING || state.status === AgentStatus.CODING) {
        // Allow interruption for refinement if mostly idle or if user insists (status logic can be lenient here)
        await handleRefinement(userMsg.text);
    }
  };

  const handleRefinement = async (request: string) => {
      setState(prev => ({ ...prev, status: AgentStatus.REFINING }));
      addLog(`User Request: ${request}`, 'system');
      addLog('Analyzing request and updating codebase...', 'info');

      try {
          const { files, explanation } = await refineProject(request, state.files);
          checkAbort();

          setState(prev => ({ ...prev, files, status: AgentStatus.TESTING }));
          addLog(`Refinement applied: ${explanation}`, 'success');
          
          setMessages(prev => [...prev, { role: 'agent', text: `I've updated the code: ${explanation}. Running tests now...`, timestamp: Date.now() }]);

          // Run tests after refinement
          await handleManualTest(); 

      } catch (e: any) {
          if (e.message !== "Process stopped by user") {
             addLog(`Refinement failed: ${e.message}`, 'error');
             setMessages(prev => [...prev, { role: 'agent', text: "I couldn't apply those changes. Check the logs.", timestamp: Date.now() }]);
          }
          setState(prev => ({ ...prev, status: AgentStatus.IDLE }));
      }
  };

  const handleStartMarathon = async (promptText: string) => {
    setState({ ...INITIAL_STATE, name: 'New Project', description: promptText, status: AgentStatus.PLANNING });
    setMetricsData([]);
    setMessages(prev => [...prev, { role: 'agent', text: "Target acquired. Initializing DAION build sequence...", timestamp: Date.now() }]);
    
    addLog('DAION Agent Initialized.', 'system');
    addLog(`Goal: ${promptText}`, 'info');

    try {
        // --- PHASE 1: PLANNING ---
        checkAbort();
        addLog('Phase 1: Architecture & Planning', 'system');
        const plan = await generateProjectPlan(promptText);
        checkAbort();
        
        setState(prev => ({
            ...prev,
            files: plan.files,
            status: AgentStatus.CODING
        }));
        addLog(`Plan generated. ${plan.files.length} artifacts defined.`, 'success');

        // --- PHASE 2: CODING ---
        addLog('Phase 2: Autonomous Construction', 'system');
        let currentFiles = [...plan.files];
        
        for (let i = 0; i < currentFiles.length; i++) {
            checkAbort();
            const file = currentFiles[i];
            addLog(`Generating artifact: ${file.name}...`, 'info');
            
            const content = await generateFileContent(file.name, promptText, currentFiles);
            
            currentFiles[i] = { ...file, content, status: 'created' };
            
            setState(prev => ({ ...prev, files: [...currentFiles] }));
            if (i === 0) setSelectedFile(currentFiles[i]);
            
            await new Promise(r => setTimeout(r, 600)); // Slight delay for visual pacing
        }

        // --- PHASE 3: LOOP ---
        addLog('Phase 3: Optimization Loop', 'system');
        
        let iteration = 1;
        let qualityScore = 0;
        const MAX_ITERATIONS = 3; 
        
        while (iteration <= MAX_ITERATIONS && qualityScore < 95) {
            checkAbort();
            setState(prev => ({ ...prev, status: AgentStatus.TESTING, iteration }));
            addLog(`Iteration ${iteration}: Running tests...`, 'system');
            
            // TEST
            const analysis = await runAutonomousTests(currentFiles);
            checkAbort();

            qualityScore = analysis.qualityScore;
            
            const bugCount = analysis.results.filter(r => !r.passed).length;
            setMetricsData(prev => [...prev, { iteration, quality: qualityScore, bugs: bugCount }]);
            
            setState(prev => ({ 
                ...prev, 
                testResults: analysis.results,
                qualityScore: analysis.qualityScore
            }));

            if (analysis.vibeCheck.degraded) {
                addLog('Vibe degraded. Refactoring.', 'warning');
            }

            const needsRefinement = bugCount > 0 || analysis.vibeCheck.degraded;

            if (needsRefinement && iteration < MAX_ITERATIONS) {
                checkAbort();
                setState(prev => ({ ...prev, status: AgentStatus.REFINING }));
                
                const failedTests = analysis.results.filter(r => !r.passed);
                let errorContext = failedTests.map(t => t.message).join('\n');
                if (analysis.vibeCheck.degraded) {
                    errorContext += `\nQUALITY ISSUE: ${analysis.vibeCheck.reason}\nAction: Refactor to clean up code, remove hacks, deduplicate logic.`;
                }

                let filesToFix = currentFiles.filter(f => f.language !== 'json' && f.content.length > 0);
                filesToFix = filesToFix.slice(0, 3);
                
                for (const file of filesToFix) {
                   checkAbort();
                   addLog(`Refactoring ${file.name}...`, 'info');
                   const newContent = await refactorCode(file, errorContext);
                   
                   const index = currentFiles.findIndex(f => f.name === file.name);
                   if (index !== -1) {
                       currentFiles[index] = { ...file, content: newContent, status: 'verified' };
                       setState(prev => ({ ...prev, files: [...currentFiles] }));
                   }
                }
            } else {
                if (qualityScore >= 95 && !analysis.vibeCheck.degraded) {
                    addLog('System stable.', 'success');
                    break;
                } else if (iteration >= MAX_ITERATIONS) {
                    addLog('Max iterations reached.', 'warning');
                    break;
                }
            }
            iteration++;
        }

        // --- PHASE 4: REPORTING ---
        checkAbort();
        setState(prev => ({ ...prev, status: AgentStatus.COMPLETED }));
        const report = await generateFinalReport({ ...state, iteration, qualityScore, files: currentFiles });
        setState(prev => ({ ...prev, report }));
        addLog('Mission Complete.', 'success');
        setMessages(prev => [...prev, { role: 'agent', text: "Mission complete. I've built the application. Check the Preview tab.", timestamp: Date.now() }]);

    } catch (e: any) {
        if (e.message === "Process stopped by user") {
             addLog('Process halted.', 'warning');
             setMessages(prev => [...prev, { role: 'agent', text: "Process stopped.", timestamp: Date.now() }]);
        } else {
             addLog(`FAILURE: ${e.message}`, 'error');
             setState(prev => ({ ...prev, status: AgentStatus.FAILED }));
             setMessages(prev => [...prev, { role: 'agent', text: "I encountered a critical error.", timestamp: Date.now() }]);
        }
    }
  };

  const isBusy = [AgentStatus.PLANNING, AgentStatus.CODING, AgentStatus.TESTING, AgentStatus.REFINING].includes(state.status);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-300 flex flex-col font-sans selection:bg-indigo-500/30">
      {/* Header */}
      <header className="h-20 flex items-center justify-between px-8 bg-[#09090b] border-b border-white/5 z-50">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center shadow-lg shadow-indigo-900/20 ring-1 ring-white/10">
            <Sparkles size={20} className="text-white" />
          </div>
          <div>
            <h1 className="font-bold text-xl tracking-tight text-white">DAION</h1>
            <div className="flex items-center gap-2 text-xs font-mono text-zinc-500">
                <span className={`w-1.5 h-1.5 rounded-full ${state.status === AgentStatus.IDLE ? 'bg-zinc-600' : 'bg-indigo-500 animate-pulse'}`}></span>
                {state.status}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
             <button
                onClick={handleNewProject}
                disabled={isBusy}
                className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors px-3 py-2 rounded-lg hover:bg-white/5 text-sm"
             >
                <Plus size={16} /> New Project
             </button>
             <div className="h-6 w-px bg-zinc-800 mx-2"></div>
             {/* Preview Toggle */}
             <button 
                onClick={() => setActiveTab(prev => prev === 'preview' ? 'code' : 'preview')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-sm ring-1 ring-inset ${
                    activeTab === 'preview' 
                    ? 'bg-indigo-600 text-white ring-indigo-500 hover:bg-indigo-500' 
                    : 'bg-zinc-800/50 text-zinc-200 ring-white/10 hover:bg-zinc-800'
                }`}
             >
                {activeTab === 'preview' ? <Code2 size={16} /> : <Eye size={16} />}
                {activeTab === 'preview' ? 'Back to Code' : 'Preview App'}
             </button>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 flex overflow-hidden p-6 gap-6">
        
        {/* Left Column: Chat & Controls */}
        <div className="w-[340px] flex flex-col gap-6 shrink-0">
          
          {/* Chat Area */}
          <div className="flex-1 bg-zinc-900/40 border border-white/10 rounded-xl flex flex-col overflow-hidden shadow-sm backdrop-blur-sm">
             <div className="p-4 border-b border-white/5 bg-white/5 flex justify-between items-center">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Command Center</span>
                {isBusy && (
                    <button onClick={handleStop} className="text-red-400 hover:text-red-300 flex items-center gap-1.5 text-[10px] bg-red-500/10 px-2.5 py-1 rounded-full border border-red-500/20 transition-all">
                        <Square size={8} fill="currentColor" /> STOP
                    </button>
                )}
             </div>
             
             {/* Messages */}
             <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar bg-[#0c0c0e]">
                {messages.length === 0 && (
                    <div className="text-center mt-20 opacity-40">
                        <Sparkles size={40} className="mx-auto mb-4 text-zinc-600" />
                        <p className="text-sm text-zinc-500">DAION is ready.</p>
                        <p className="text-xs text-zinc-600 mt-2">Describe your idea to begin.</p>
                    </div>
                )}
                {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[90%] p-3.5 rounded-2xl text-sm leading-relaxed ${
                            msg.role === 'user' 
                            ? 'bg-zinc-800 text-zinc-100 rounded-tr-sm' 
                            : 'bg-indigo-900/20 text-indigo-100 border border-indigo-500/20 rounded-tl-sm'
                        }`}>
                            {msg.text}
                        </div>
                    </div>
                ))}
                <div ref={chatEndRef} />
             </div>

             {/* Input */}
             <div className="p-4 bg-zinc-900/80 border-t border-white/5">
                <div className="relative">
                    <textarea 
                        className="w-full bg-black/20 border border-white/10 rounded-xl p-3 pr-10 text-sm focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 outline-none resize-none h-16 custom-scrollbar placeholder:text-zinc-600 transition-all"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        placeholder={isBusy ? "Agent working..." : "How can I help you build?"}
                        disabled={isBusy && state.status !== AgentStatus.COMPLETED} 
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSendMessage();
                            }
                        }}
                    />
                    <button 
                        onClick={handleSendMessage}
                        disabled={isBusy || !chatInput.trim()}
                        className="absolute right-3 bottom-3 p-1.5 text-zinc-400 hover:text-indigo-400 disabled:opacity-30 disabled:hover:text-zinc-400 transition-colors"
                    >
                        <Send size={16} />
                    </button>
                </div>
             </div>
          </div>

          {/* Metrics Panel - Reduced height slightly to give more room to chat */}
          <div className="h-44 shrink-0">
            <ProjectMetrics data={metricsData} />
          </div>
        </div>

        {/* Center Column: Code Editor & Preview */}
        <div className="flex-1 flex flex-col gap-0 min-w-[400px] border border-white/10 rounded-xl overflow-hidden bg-[#0c0c0e] shadow-xl">
            
            {/* Tab Bar */}
            <div className="h-10 flex items-center bg-[#18181b]/50 border-b border-white/5">
                 <div className="flex h-full">
                    <button 
                        onClick={() => setActiveTab('code')}
                        className={`px-5 h-full text-xs font-medium flex items-center gap-2 border-r border-white/5 transition-colors ${activeTab === 'code' ? 'bg-[#0c0c0e] text-white border-t-2 border-t-indigo-500' : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'}`}
                    >
                        <Code2 size={14} /> 
                        Codebase
                    </button>
                    <button 
                        onClick={() => setActiveTab('preview')}
                        className={`px-5 h-full text-xs font-medium flex items-center gap-2 border-r border-white/5 transition-colors ${activeTab === 'preview' ? 'bg-[#0c0c0e] text-white border-t-2 border-t-emerald-500' : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'}`}
                    >
                        <Eye size={14} /> 
                        Live Preview
                    </button>
                 </div>
                {selectedFile && activeTab === 'code' && (
                    <div className="ml-auto mr-4 text-xs text-zinc-500 font-mono opacity-60">
                        {selectedFile.name}
                    </div>
                )}
            </div>

            {/* Content Area */}
            <div className="flex-1 relative bg-[#0c0c0e]">
                {activeTab === 'preview' ? (
                    <Preview files={state.files} />
                ) : (
                    <>
                        {state.report && !selectedFile ? (
                            <div className="absolute inset-0 p-10 overflow-y-auto custom-scrollbar">
                                <div className="max-w-3xl mx-auto prose prose-invert prose-sm">
                                    <h1 className="text-zinc-200 mb-6">Mission Report</h1>
                                    <div className="whitespace-pre-wrap font-mono text-sm text-zinc-400 bg-zinc-900/50 p-6 rounded-lg border border-white/5">
                                        {state.report}
                                    </div>
                                </div>
                            </div>
                        ) : selectedFile ? (
                             <CodeEditor 
                                file={selectedFile} 
                                onChange={handleCodeChange} 
                             />
                        ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-700 gap-4">
                                <Box size={48} strokeWidth={1} className="opacity-20" />
                                <div className="text-center">
                                    <p className="text-sm font-medium text-zinc-500">No file selected</p>
                                    <p className="text-xs mt-1 text-zinc-600">Select a file from the explorer to edit.</p>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>

        {/* Right Column: Files & Terminal */}
        <div className="w-[300px] flex flex-col gap-6 shrink-0">
            <div className="h-1/2 flex flex-col border border-white/10 rounded-xl overflow-hidden relative bg-zinc-900/30 shadow-sm backdrop-blur-sm">
                <FileExplorer 
                    files={state.files} 
                    onSelectFile={(f) => { setSelectedFile(f); setActiveTab('code'); }} 
                    selectedFile={selectedFile} 
                />
                 <div className="absolute top-2 right-2">
                    <button
                        onClick={handleManualTest}
                        disabled={isBusy || state.files.length === 0}
                        className="text-zinc-500 hover:text-white disabled:opacity-30 p-1.5 hover:bg-white/10 rounded transition-all"
                        title="Run Test Suite"
                    >
                        <TestTube size={14} />
                    </button>
                 </div>
            </div>
            <div className="h-1/2">
                <Terminal logs={state.logs} />
            </div>
        </div>

      </main>
    </div>
  );
};

export default App;