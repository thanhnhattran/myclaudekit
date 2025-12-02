import { spawn, ChildProcess } from 'child_process';
import { AgentConfig, RunnerOptions, RunResult } from '../types';
import { PromptManager } from './promptManager';

export class AgentRunner {
  private options: RunnerOptions;
  private currentProcess: ChildProcess | null = null;
  private promptManager: PromptManager;

  constructor(options: RunnerOptions) {
    this.options = options;
    this.promptManager = new PromptManager();
  }

  public async run(
    agent: AgentConfig,
    userPrompt: string,
    onOutput?: (chunk: string) => void
  ): Promise<RunResult> {
    return new Promise((resolve) => {
      const fullPrompt = this.promptManager.buildPrompt(agent, userPrompt);
      const args = this.buildCliArgs(agent, fullPrompt);

      let output = '';
      let errorOutput = '';

      try {
        this.currentProcess = spawn(this.options.cliPath, args, {
          cwd: this.options.workingDirectory,
          shell: true,
          env: {
            ...process.env,
            FORCE_COLOR: '0' // Disable color codes for clean output
          }
        });

        this.currentProcess.stdout?.on('data', (data: Buffer) => {
          const chunk = data.toString();
          output += chunk;
          if (onOutput) {
            onOutput(chunk);
          }
        });

        this.currentProcess.stderr?.on('data', (data: Buffer) => {
          const chunk = data.toString();
          errorOutput += chunk;
          // Also stream stderr to output for visibility
          if (onOutput) {
            onOutput(`[stderr] ${chunk}`);
          }
        });

        this.currentProcess.on('close', (code) => {
          this.currentProcess = null;

          if (code === 0) {
            resolve({
              success: true,
              output: output.trim(),
              exitCode: code
            });
          } else {
            resolve({
              success: false,
              output: output.trim(),
              error: errorOutput.trim() || `Process exited with code ${code}`,
              exitCode: code ?? undefined
            });
          }
        });

        this.currentProcess.on('error', (err) => {
          this.currentProcess = null;
          resolve({
            success: false,
            output: output.trim(),
            error: err.message,
            exitCode: -1
          });
        });
      } catch (err) {
        resolve({
          success: false,
          output: '',
          error: err instanceof Error ? err.message : String(err),
          exitCode: -1
        });
      }
    });
  }

  public stop(): void {
    if (this.currentProcess) {
      this.currentProcess.kill('SIGTERM');
      this.currentProcess = null;
    }
  }

  public isRunning(): boolean {
    return this.currentProcess !== null;
  }

  private buildCliArgs(agent: AgentConfig, prompt: string): string[] {
    const args: string[] = [];

    // Add model if specified
    const model = agent.model || this.options.model;
    if (model) {
      args.push('--model', model);
    }

    // Add print mode for non-interactive output
    args.push('--print');

    // Add the prompt
    args.push('--prompt', prompt);

    return args;
  }
}

/**
 * Manages multiple agent runners for parallel execution
 */
export class AgentRunnerPool {
  private runners: Map<string, AgentRunner> = new Map();
  private options: RunnerOptions;

  constructor(options: RunnerOptions) {
    this.options = options;
  }

  public getRunner(agentId: string): AgentRunner {
    if (!this.runners.has(agentId)) {
      this.runners.set(agentId, new AgentRunner(this.options));
    }
    return this.runners.get(agentId)!;
  }

  public stopRunner(agentId: string): void {
    const runner = this.runners.get(agentId);
    if (runner) {
      runner.stop();
      this.runners.delete(agentId);
    }
  }

  public stopAll(): void {
    for (const [agentId, runner] of this.runners) {
      runner.stop();
      this.runners.delete(agentId);
    }
  }

  public getRunningAgents(): string[] {
    return Array.from(this.runners.entries())
      .filter(([_, runner]) => runner.isRunning())
      .map(([id]) => id);
  }
}
