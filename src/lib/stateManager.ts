import { AgentRole, AgentState, WorkflowState } from '../types';
import { EventEmitter } from 'events';

export class StateManager extends EventEmitter {
  private agentStates: Map<AgentRole, AgentState> = new Map();
  private workflowStates: Map<string, WorkflowState> = new Map();
  private runnerAbortControllers: Map<AgentRole, AbortController> = new Map();

  constructor() {
    super();
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
