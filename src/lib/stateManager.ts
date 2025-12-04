import { AgentRole, AgentState, WorkflowState, TokenUsage, ProjectTokenStats, ConversationHistory } from '../types';
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
  private conversationHistories: Map<AgentRole, ConversationHistory> = new Map();
  private context?: vscode.ExtensionContext;

  constructor(context?: vscode.ExtensionContext) {
    super();
    this.context = context;
    this.tokenStats = this.loadTokenStats();
  }

  // Token Stats Management

  private loadTokenStats(): ProjectTokenStats {
    const now = Date.now();
    const defaultStats: ProjectTokenStats = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      totalCost: 0,
      sessionCount: 0,
      byAgent: {} as Record<AgentRole, TokenUsage>,
      lastUpdated: now,
      sessionStartTime: now,
      lastResetTime: now
    };

    if (this.context) {
      const saved = this.context.globalState.get<ProjectTokenStats>('claudekit.tokenStats');
      if (saved) {
        // Ensure session tracking fields exist
        return {
          ...saved,
          sessionStartTime: saved.sessionStartTime || now,
          lastResetTime: saved.lastResetTime || now
        };
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
    // Use cost from response if available, otherwise calculate
    let cost = usage.cost;
    if (cost === undefined) {
      const pricing = TOKEN_PRICING[model] || TOKEN_PRICING['claude-sonnet-4-5-20250929'];
      cost = (usage.inputTokens / 1_000_000 * pricing.input) +
             (usage.outputTokens / 1_000_000 * pricing.output);
      usage.cost = cost;
    }

    // Check if we need to reset daily counter (new day)
    this.checkDailyReset();

    // Update totals
    this.tokenStats.totalInputTokens += usage.inputTokens;
    this.tokenStats.totalOutputTokens += usage.outputTokens;
    this.tokenStats.totalTokens += usage.totalTokens;
    this.tokenStats.totalCost += cost;
    this.tokenStats.sessionCount++;
    this.tokenStats.lastUpdated = Date.now();

    // Update daily tokens
    this.tokenStats.dailyTokens = (this.tokenStats.dailyTokens || 0) + usage.totalTokens;

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

    // Check budget and emit warning if needed
    this.checkBudgetWarning();
  }

  /**
   * Check if daily counter needs to be reset (new day)
   */
  private checkDailyReset(): void {
    const now = Date.now();
    const lastReset = this.tokenStats.dailyResetTime || 0;
    const oneDayMs = 24 * 60 * 60 * 1000;

    // Reset if more than 24 hours since last reset
    if (now - lastReset > oneDayMs) {
      this.tokenStats.dailyTokens = 0;
      this.tokenStats.dailyResetTime = now;
    }
  }

  /**
   * Check budget and emit warning event if threshold exceeded
   */
  private checkBudgetWarning(): void {
    const budget = this.tokenStats.budget;
    if (!budget || !budget.enabled) return;

    const dailyTokens = this.tokenStats.dailyTokens || 0;
    const percentage = dailyTokens / budget.daily;

    if (percentage >= 1) {
      this.emit('budgetExceeded', { dailyTokens, budget: budget.daily, percentage });
    } else if (percentage >= budget.warning) {
      this.emit('budgetWarning', { dailyTokens, budget: budget.daily, percentage });
    }
  }

  /**
   * Set token budget
   */
  public setBudget(daily: number, warning: number = 0.8): void {
    this.tokenStats.budget = { daily, warning, enabled: true };
    this.saveTokenStats();
    this.emit('tokenStatsChanged', this.tokenStats);
  }

  /**
   * Disable budget tracking
   */
  public disableBudget(): void {
    if (this.tokenStats.budget) {
      this.tokenStats.budget.enabled = false;
      this.saveTokenStats();
      this.emit('tokenStatsChanged', this.tokenStats);
    }
  }

  /**
   * Get budget status
   */
  public getBudgetStatus(): { enabled: boolean; percentage: number; remaining: number } | null {
    const budget = this.tokenStats.budget;
    if (!budget || !budget.enabled) return null;

    const dailyTokens = this.tokenStats.dailyTokens || 0;
    const percentage = dailyTokens / budget.daily;
    const remaining = Math.max(0, budget.daily - dailyTokens);

    return { enabled: true, percentage, remaining };
  }

  public resetTokenStats(): void {
    const now = Date.now();
    this.tokenStats = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      totalCost: 0,
      sessionCount: 0,
      byAgent: {} as Record<AgentRole, TokenUsage>,
      lastUpdated: now,
      sessionStartTime: now,
      lastResetTime: now
    };
    this.saveTokenStats();
    this.emit('tokenStatsChanged', this.tokenStats);
  }

  // Conversation History Management (for --resume token savings)

  /**
   * Get conversation history for an agent
   */
  public getConversationHistory(agentId: AgentRole): ConversationHistory | undefined {
    return this.conversationHistories.get(agentId);
  }

  /**
   * Get all conversation histories
   */
  public getAllConversationHistories(): ConversationHistory[] {
    return Array.from(this.conversationHistories.values());
  }

  /**
   * Start or continue a conversation for an agent
   * Returns sessionId if conversation exists (for --resume)
   */
  public getSessionIdForAgent(agentId: AgentRole): string | undefined {
    const history = this.conversationHistories.get(agentId);
    return history?.sessionId;
  }

  /**
   * Add a message to conversation history
   * Creates new history if agent doesn't have one
   */
  public addConversationMessage(
    agentId: AgentRole,
    sessionId: string,
    userPrompt: string,
    assistantResponse: string,
    tokenUsage?: TokenUsage
  ): void {
    const now = Date.now();
    let history = this.conversationHistories.get(agentId);

    if (!history) {
      // Create new conversation history
      history = {
        agentId,
        sessionId,
        messages: [],
        createdAt: now,
        lastUpdatedAt: now,
        totalTokens: 0,
        totalCost: 0
      };
    }

    // Update sessionId if changed (shouldn't happen normally)
    history.sessionId = sessionId;
    history.lastUpdatedAt = now;

    // Add user message
    history.messages.push({
      role: 'user',
      content: userPrompt,
      timestamp: now
    });

    // Add assistant response
    history.messages.push({
      role: 'assistant',
      content: assistantResponse,
      timestamp: now,
      tokenUsage
    });

    // Update totals
    if (tokenUsage) {
      history.totalTokens += tokenUsage.totalTokens;
      history.totalCost += tokenUsage.cost || 0;
    }

    this.conversationHistories.set(agentId, history);
    this.emit('conversationUpdated', agentId, history);
  }

  /**
   * Clear conversation history for an agent (start fresh)
   */
  public clearConversationHistory(agentId: AgentRole): void {
    this.conversationHistories.delete(agentId);
    this.emit('conversationCleared', agentId);
  }

  /**
   * Clear all conversation histories
   */
  public clearAllConversationHistories(): void {
    this.conversationHistories.clear();
    this.emit('allConversationsCleared');
  }

  /**
   * Check if agent has active conversation (can use --resume)
   */
  public hasActiveConversation(agentId: AgentRole): boolean {
    const history = this.conversationHistories.get(agentId);
    return !!(history && history.sessionId && history.messages.length > 0);
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
