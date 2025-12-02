import { AgentRole, AgentState, WorkflowState, TokenUsage, ProjectTokenStats } from '../types';
import { EventEmitter } from 'events';
import * as vscode from 'vscode';

// Token pricing per 1M tokens (approximate)
const TOKEN_PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-5-20251101': { input: 15, output: 75 },
  'claude-sonnet-4-5-20250929': { input: 3, output: 15 },
  'claude-3-5-haiku-20241022': { input: 0.25, output: 1.25 },
};

export class StateManager extends EventEmitter {
  private agentStates: Map<AgentRole, AgentState> = new Map();
  private workflowStates: Map<string, WorkflowState> = new Map();
  private runnerAbortControllers: Map<AgentRole, AbortController> = new Map();
  private tokenStats: ProjectTokenStats;
  private context?: vscode.ExtensionContext;

  constructor(context?: vscode.ExtensionContext) {
    super();
    this.context = context;
    this.tokenStats = this.loadTokenStats();
  }

  // Token Stats Management

  private loadTokenStats(): ProjectTokenStats {
    const defaultStats: ProjectTokenStats = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      totalCost: 0,
      sessionCount: 0,
      byAgent: {} as Record<AgentRole, TokenUsage>,
      lastUpdated: Date.now()
    };

    if (this.context) {
      const saved = this.context.globalState.get<ProjectTokenStats>('claudekit.tokenStats');
      if (saved) {
        return saved;
      }
    }
    return defaultStats;
  }

  private saveTokenStats(): void {
    if (this.context) {
      this.context.globalState.update('claudekit.tokenStats', this.tokenStats);
    }
  }

  public getTokenStats(): ProjectTokenStats {
    return { ...this.tokenStats };
  }

  public addTokenUsage(agentId: AgentRole, usage: TokenUsage, model: string): void {
    // Calculate cost
    const pricing = TOKEN_PRICING[model] || TOKEN_PRICING['claude-sonnet-4-5-20250929'];
    const cost = (usage.inputTokens / 1_000_000 * pricing.input) +
                 (usage.outputTokens / 1_000_000 * pricing.output);
    usage.cost = cost;

    // Update totals
    this.tokenStats.totalInputTokens += usage.inputTokens;
    this.tokenStats.totalOutputTokens += usage.outputTokens;
    this.tokenStats.totalTokens += usage.totalTokens;
    this.tokenStats.totalCost += cost;
    this.tokenStats.sessionCount++;
    this.tokenStats.lastUpdated = Date.now();

    // Update per-agent stats
    if (!this.tokenStats.byAgent[agentId]) {
      this.tokenStats.byAgent[agentId] = {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        cost: 0
      };
    }
    this.tokenStats.byAgent[agentId].inputTokens += usage.inputTokens;
    this.tokenStats.byAgent[agentId].outputTokens += usage.outputTokens;
    this.tokenStats.byAgent[agentId].totalTokens += usage.totalTokens;
    this.tokenStats.byAgent[agentId].cost = (this.tokenStats.byAgent[agentId].cost || 0) + cost;

    this.saveTokenStats();
    this.emit('tokenStatsChanged', this.tokenStats);
  }

  public resetTokenStats(): void {
    this.tokenStats = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      totalCost: 0,
      sessionCount: 0,
      byAgent: {} as Record<AgentRole, TokenUsage>,
      lastUpdated: Date.now()
    };
    this.saveTokenStats();
    this.emit('tokenStatsChanged', this.tokenStats);
  }

  // Agent State Management

  public getAgentState(agentId: AgentRole): AgentState | undefined {
    return this.agentStates.get(agentId);
  }

  public getAllAgentStates(): AgentState[] {
    return Array.from(this.agentStates.values());
  }

  public updateAgentState(agentId: AgentRole, state: AgentState): void {
    this.agentStates.set(agentId, state);
    this.emit('agentStateChanged', agentId, state);
  }

  public getRunningAgents(): AgentState[] {
    return this.getAllAgentStates().filter(state => state.status === 'running');
  }

  public stopAgent(agentId: AgentRole): void {
    const state = this.agentStates.get(agentId);
    if (state && state.status === 'running') {
      // Trigger abort
      const controller = this.runnerAbortControllers.get(agentId);
      if (controller) {
        controller.abort();
        this.runnerAbortControllers.delete(agentId);
      }

      // Update state
      this.updateAgentState(agentId, {
        ...state,
        status: 'stopped',
        endTime: Date.now()
      });
    }
  }

  public stopAllAgents(): void {
    for (const state of this.agentStates.values()) {
      if (state.status === 'running') {
        this.stopAgent(state.id);
      }
    }
  }

  public registerAbortController(agentId: AgentRole, controller: AbortController): void {
    this.runnerAbortControllers.set(agentId, controller);
  }

  public clearAgentState(agentId: AgentRole): void {
    this.agentStates.delete(agentId);
    this.emit('agentStateCleared', agentId);
  }

  public resetAllAgentStates(): void {
    this.agentStates.clear();
    this.emit('allAgentStatesReset');
  }

  // Workflow State Management

  public getWorkflowState(workflowId: string): WorkflowState | undefined {
    return this.workflowStates.get(workflowId);
  }

  public getAllWorkflowStates(): WorkflowState[] {
    return Array.from(this.workflowStates.values());
  }

  public updateWorkflowState(workflowId: string, state: WorkflowState): void {
    this.workflowStates.set(workflowId, state);
    this.emit('workflowStateChanged', workflowId, state);
  }

  public clearWorkflowState(workflowId: string): void {
    this.workflowStates.delete(workflowId);
    this.emit('workflowStateCleared', workflowId);
  }

  // Serialization (for persistence if needed)

  public serialize(): string {
    return JSON.stringify({
      agents: Object.fromEntries(this.agentStates),
      workflows: Object.fromEntries(this.workflowStates)
    });
  }

  public deserialize(json: string): void {
    try {
      const data = JSON.parse(json);

      if (data.agents) {
        this.agentStates = new Map(
          Object.entries(data.agents) as [AgentRole, AgentState][]
        );
      }

      if (data.workflows) {
        this.workflowStates = new Map(
          Object.entries(data.workflows) as [string, WorkflowState][]
        );
      }
    } catch {
      console.error('Failed to deserialize state');
    }
  }
}
