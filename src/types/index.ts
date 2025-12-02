/**
 * ClaudeKit Type Definitions
 */

// Agent Types
export type AgentRole =
  | 'planner'
  | 'scout'
  | 'researcher'
  | 'implementer'
  | 'code-reviewer'
  | 'security-auditor'
  | 'ui-ux-designer'
  | 'database-admin'
  | 'tester'
  | 'documenter'
  | 'debugger'
  | 'optimizer'
  | 'devops'
  | 'brainstormer'
  | 'aggregator';

export type AgentStatus = 'idle' | 'running' | 'completed' | 'error' | 'stopped';

export interface AgentConfig {
  id: AgentRole;
  name: string;
  icon: string;
  description: string;
  systemPrompt: string;
  capabilities: string[];
  model?: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost?: number; // USD
}

export interface AgentState {
  id: AgentRole;
  status: AgentStatus;
  output: string;
  error?: string;
  startTime?: number;
  endTime?: number;
  retryCount: number;
  tokenUsage?: TokenUsage;
}

export interface ProjectTokenStats {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCost: number;
  sessionCount: number;
  byAgent: Record<AgentRole, TokenUsage>;
  lastUpdated: number;
}

// Workflow Types
export type WorkflowPattern = 'sequential' | 'parallel' | 'fan-out';

export interface WorkflowStep {
  agentId: AgentRole;
  input?: string;
  dependsOn?: AgentRole[];
}

export interface Workflow {
  id: string;
  name: string;
  pattern: WorkflowPattern;
  steps: WorkflowStep[];
}

export interface WorkflowState {
  id: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  currentStep: number;
  agentStates: Map<AgentRole, AgentState>;
  startTime?: number;
  endTime?: number;
}

// Runner Types
export interface RunnerOptions {
  cliPath: string;
  maxRetries: number;
  model: string;
  workingDirectory: string;
}

export interface RunResult {
  success: boolean;
  output: string;
  error?: string;
  exitCode?: number;
  tokenUsage?: TokenUsage;
}

// Message Types (Extension <-> Webview communication)
export type MessageType =
  | 'runAgent'
  | 'stopAgent'
  | 'runWorkflow'
  | 'stopWorkflow'
  | 'agentUpdate'
  | 'workflowUpdate'
  | 'getAgents'
  | 'agentsList'
  | 'tokenUpdate'
  | 'getTokenStats'
  | 'resetTokenStats'
  | 'error';

export interface Message<T = unknown> {
  type: MessageType;
  payload: T;
}

export interface RunAgentPayload {
  agentId: AgentRole;
  prompt: string;
  context?: string;
}

export interface StopAgentPayload {
  agentId: AgentRole;
}

export interface RunWorkflowPayload {
  workflowId: string;
  initialPrompt: string;
}

export interface AgentUpdatePayload {
  agentId: AgentRole;
  state: AgentState;
}

export interface WorkflowUpdatePayload {
  workflowId: string;
  state: WorkflowState;
}
