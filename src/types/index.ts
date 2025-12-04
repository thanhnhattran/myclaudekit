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

// Model tiers for smart selection
export type ModelTier = 'fast' | 'balanced' | 'powerful';

export interface ModelConfig {
  id: string;
  tier: ModelTier;
  inputCost: number;   // per 1M tokens
  outputCost: number;  // per 1M tokens
}

// Response modes for token optimization
export type ResponseMode = 'concise' | 'balanced' | 'detailed';

export interface AgentConfig {
  id: AgentRole;
  name: string;
  icon: string;
  description: string;
  systemPrompt: string;
  capabilities: string[];
  model?: string;
  recommendedModel?: ModelTier;  // Suggested model tier based on task complexity
  responseMode?: ResponseMode;   // Control output verbosity
  maxOutputTokens?: number;      // Limit output tokens
  role?: string;                 // Short role description (e.g., "Planning & Research")
  example?: AgentExample;        // Input/Output example
  source?: 'file' | 'builtin';   // Where the agent config comes from
}

export interface AgentExample {
  input: string;
  output: string;
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

export interface TokenBudget {
  daily: number;          // Max tokens per day
  warning: number;        // Warning threshold (0-1, e.g., 0.8 = 80%)
  enabled: boolean;       // Whether budget is active
}

export interface ProjectTokenStats {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCost: number;
  sessionCount: number;
  byAgent: Record<AgentRole, TokenUsage>;
  lastUpdated: number;
  // Session tracking
  sessionStartTime?: number;      // When this tracking session started
  lastResetTime?: number;         // When stats were last reset
  // Budget tracking
  budget?: TokenBudget;
  dailyTokens?: number;           // Tokens used today
  dailyResetTime?: number;        // When daily counter was last reset
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
  sessionId?: string;  // Claude session ID for conversation continuation
}

// Conversation History Types (for session continuation)
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  tokenUsage?: TokenUsage;
}

export interface ConversationHistory {
  agentId: AgentRole;
  sessionId: string;          // Claude CLI session ID for --resume
  messages: ConversationMessage[];
  createdAt: number;
  lastUpdatedAt: number;
  totalTokens: number;
  totalCost: number;
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
  | 'getConversationHistory'
  | 'conversationHistory'
  | 'clearConversation'
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
