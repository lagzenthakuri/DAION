export enum AgentStatus {
  IDLE = 'IDLE',
  PLANNING = 'PLANNING',
  CODING = 'CODING',
  TESTING = 'TESTING',
  REFINING = 'REFINING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  STOPPED = 'STOPPED'
}

export interface LogEntry {
  id: string;
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'system';
}

export interface ProjectFile {
  name: string;
  language: string;
  content: string;
  status: 'pending' | 'created' | 'verified' | 'buggy';
}

export interface TestResult {
  id: string;
  testName: string;
  passed: boolean;
  message: string;
}

export interface ProjectState {
  name: string;
  description: string;
  files: ProjectFile[];
  testResults: TestResult[];
  qualityScore: number; // 0-100
  iteration: number;
  logs: LogEntry[];
  status: AgentStatus;
  generatedArtifacts: string[]; // List of completed tasks
  report: string | null;
}

export interface ChartDataPoint {
  iteration: number;
  quality: number;
  bugs: number;
}

export interface Message {
  role: 'user' | 'agent';
  text: string;
  timestamp: number;
}