import { AgentRunner } from './runner';
import { PromptManager } from './promptManager';
import { StateManager } from './stateManager';
import {
  AgentRole,
  AgentState,
  Workflow,
  WorkflowState,
  RunnerOptions,
  RunResult
} from '../types';
import { getAgent } from '../agents/agents.config';

export interface WorkflowRunnerOptions extends RunnerOptions {
  onAgentStart?: (agentId: AgentRole) => void;
  onAgentOutput?: (agentId: AgentRole, chunk: string) => void;
  onAgentComplete?: (agentId: AgentRole, result: RunResult) => void;
  onWorkflowComplete?: (workflowId: string, outputs: Map<AgentRole, string>) => void;
}

export class WorkflowRunner {
  private options: WorkflowRunnerOptions;
  private stateManager: StateManager;
  private promptManager: PromptManager;
  private runners: Map<AgentRole, AgentRunner> = new Map();
  private outputs: Map<AgentRole, string> = new Map();
  private isRunning = false;

  constructor(options: WorkflowRunnerOptions, stateManager: StateManager) {
    this.options = options;
    this.stateManager = stateManager;
    this.promptManager = new PromptManager();
  }

  /**
   * Execute a workflow based on its pattern
   */
  public async execute(workflow: Workflow, initialPrompt: string): Promise<Map<AgentRole, string>> {
    this.isRunning = true;
    this.outputs.clear();

    // Initialize workflow state
    const workflowState: WorkflowState = {
      id: workflow.id,
      status: 'running',
      currentStep: 0,
      agentStates: new Map(),
      startTime: Date.now()
    };
    this.stateManager.updateWorkflowState(workflow.id, workflowState);

    try {
      switch (workflow.pattern) {
        case 'sequential':
          await this.executeSequential(workflow, initialPrompt);
          break;
        case 'parallel':
          await this.executeParallel(workflow, initialPrompt);
          break;
        case 'fan-out':
          await this.executeFanOut(workflow, initialPrompt);
          break;
      }

      // Update workflow state to completed
      this.stateManager.updateWorkflowState(workflow.id, {
        ...workflowState,
        status: 'completed',
        endTime: Date.now()
      });

      if (this.options.onWorkflowComplete) {
        this.options.onWorkflowComplete(workflow.id, this.outputs);
      }
    } catch (error) {
      // Update workflow state to error
      this.stateManager.updateWorkflowState(workflow.id, {
        ...workflowState,
        status: 'error',
        endTime: Date.now()
      });
      throw error;
    } finally {
      this.isRunning = false;
    }

    return this.outputs;
  }

  /**
   * Sequential execution: A → B → C
   * Each agent receives output from previous agent as context
   */
  private async executeSequential(workflow: Workflow, initialPrompt: string): Promise<void> {
    let currentPrompt = initialPrompt;
    const previousOutputs = new Map<string, string>();

    for (const step of workflow.steps) {
      if (!this.isRunning) break;

      const agent = getAgent(step.agentId);
      if (!agent) continue;

      // Build prompt with context from previous agents
      const contextPrompt = previousOutputs.size > 0
        ? `${currentPrompt}\n\n${this.promptManager.buildChainContext(previousOutputs)}`
        : currentPrompt;

      const result = await this.runAgentWithRetry(step.agentId, contextPrompt);

      if (result.success) {
        this.outputs.set(step.agentId, result.output);
        previousOutputs.set(agent.name, result.output);
        // Use this agent's output as context for next
        currentPrompt = step.input || initialPrompt;
      } else {
        throw new Error(`Agent ${step.agentId} failed: ${result.error}`);
      }
    }
  }

  /**
   * Parallel execution: Run all agents simultaneously
   */
  private async executeParallel(workflow: Workflow, initialPrompt: string): Promise<void> {
    const promises = workflow.steps.map(step => {
      const prompt = step.input || initialPrompt;
      return this.runAgentWithRetry(step.agentId, prompt)
        .then(result => ({ agentId: step.agentId, result }));
    });

    const results = await Promise.allSettled(promises);

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.result.success) {
        this.outputs.set(result.value.agentId, result.value.result.output);
      }
    }
  }

  /**
   * Fan-out pattern: Run agents in parallel, then aggregate
   * All agents run simultaneously, then Aggregator combines outputs
   */
  private async executeFanOut(workflow: Workflow, initialPrompt: string): Promise<void> {
    // Run all non-aggregator agents in parallel
    const nonAggregatorSteps = workflow.steps.filter(s => s.agentId !== 'aggregator');

    const promises = nonAggregatorSteps.map(step => {
      const prompt = step.input || initialPrompt;
      return this.runAgentWithRetry(step.agentId, prompt)
        .then(result => ({ agentId: step.agentId, result }));
    });

    const results = await Promise.allSettled(promises);

    // Collect successful outputs
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.result.success) {
        this.outputs.set(result.value.agentId, result.value.result.output);
      }
    }

    // Run aggregator if we have outputs
    if (this.outputs.size > 0) {
      const aggregationPrompt = this.promptManager.buildAggregationPrompt(
        this.outputs as Map<string, string>,
        initialPrompt
      );

      const aggregatorResult = await this.runAgentWithRetry('aggregator', aggregationPrompt);
      if (aggregatorResult.success) {
        this.outputs.set('aggregator', aggregatorResult.output);
      }
    }
  }

  /**
   * Run a single agent with retry logic
   */
  private async runAgentWithRetry(
    agentId: AgentRole,
    prompt: string,
    retryCount = 0
  ): Promise<RunResult> {
    const agent = getAgent(agentId);
    if (!agent) {
      return { success: false, output: '', error: `Agent ${agentId} not found` };
    }

    // Notify agent start
    if (this.options.onAgentStart) {
      this.options.onAgentStart(agentId);
    }

    // Update agent state
    this.stateManager.updateAgentState(agentId, {
      id: agentId,
      status: 'running',
      output: '',
      retryCount,
      startTime: Date.now()
    });

    // Create runner for this agent
    const runner = new AgentRunner(this.options);
    this.runners.set(agentId, runner);

    let output = '';
    const result = await runner.run(agent, prompt, (chunk) => {
      output += chunk;
      if (this.options.onAgentOutput) {
        this.options.onAgentOutput(agentId, chunk);
      }
    });

    // Update agent state
    const finalState: AgentState = {
      id: agentId,
      status: result.success ? 'completed' : 'error',
      output: result.output,
      error: result.error,
      retryCount,
      endTime: Date.now()
    };
    this.stateManager.updateAgentState(agentId, finalState);

    // Notify agent complete
    if (this.options.onAgentComplete) {
      this.options.onAgentComplete(agentId, result);
    }

    // Retry on failure
    if (!result.success && retryCount < this.options.maxRetries) {
      const retryPrompt = this.promptManager.buildRetryPrompt(
        agent,
        prompt,
        result.error || 'Unknown error',
        retryCount + 1
      );
      return this.runAgentWithRetry(agentId, retryPrompt, retryCount + 1);
    }

    return result;
  }

  /**
   * Stop all running agents
   */
  public stop(): void {
    this.isRunning = false;
    for (const runner of this.runners.values()) {
      runner.stop();
    }
    this.runners.clear();
  }

  /**
   * Get current outputs
   */
  public getOutputs(): Map<AgentRole, string> {
    return new Map(this.outputs);
  }
}

/**
 * Pre-defined workflow templates
 */
export const WORKFLOW_TEMPLATES: Workflow[] = [
  {
    id: 'code-review-workflow',
    name: 'Code Review Pipeline',
    pattern: 'sequential',
    steps: [
      { agentId: 'scout' },
      { agentId: 'code-reviewer' },
      { agentId: 'security-auditor' }
    ]
  },
  {
    id: 'feature-implementation',
    name: 'Feature Implementation',
    pattern: 'sequential',
    steps: [
      { agentId: 'planner' },
      { agentId: 'implementer' },
      { agentId: 'tester' },
      { agentId: 'documenter' }
    ]
  },
  {
    id: 'comprehensive-analysis',
    name: 'Comprehensive Analysis',
    pattern: 'fan-out',
    steps: [
      { agentId: 'scout' },
      { agentId: 'security-auditor' },
      { agentId: 'optimizer' },
      { agentId: 'code-reviewer' },
      { agentId: 'aggregator' }
    ]
  },
  {
    id: 'brainstorm-and-plan',
    name: 'Brainstorm & Plan',
    pattern: 'sequential',
    steps: [
      { agentId: 'brainstormer' },
      { agentId: 'researcher' },
      { agentId: 'planner' }
    ]
  },
  {
    id: 'debug-and-fix',
    name: 'Debug & Fix',
    pattern: 'sequential',
    steps: [
      { agentId: 'debugger' },
      { agentId: 'implementer' },
      { agentId: 'tester' }
    ]
  }
];
