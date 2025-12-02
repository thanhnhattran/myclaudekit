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
  capabilities: string[];
}

export interface AgentState {
  id: AgentRole;
  status: AgentStatus;
  output: string;
  error?: string;
  startTime?: number;
  endTime?: number;
  retryCount: number;
}

// Workflow Types
export type WorkflowPattern = 'sequential' | 'parallel' | 'fan-out';

// Message Types
export type MessageType =
  | 'runAgent'
  | 'stopAgent'
  | 'runWorkflow'
  | 'stopWorkflow'
  | 'agentUpdate'
  | 'workflowUpdate'
  | 'getAgents'
  | 'agentsList'
  | 'error';

export interface Message<T = unknown> {
  type: MessageType;
  payload: T;
}
