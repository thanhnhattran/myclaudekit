import { spawn, ChildProcess } from 'child_process';
import { AgentConfig, RunnerOptions, RunResult, TokenUsage } from '../types';
import { PromptManager } from './promptManager';

// Regex patterns to extract token usage from claude CLI output
const TOKEN_PATTERNS = {
  // Pattern: "Input tokens: 1234" or "input_tokens: 1234"
  input: /(?:input[_\s]?tokens?|prompt[_\s]?tokens?)[\s:]+(\d+)/i,
  // Pattern: "Output tokens: 1234" or "output_tokens: 1234"
  output: /(?:output[_\s]?tokens?|completion[_\s]?tokens?)[\s:]+(\d+)/i,
  // Pattern: "Total tokens: 1234" or "total_tokens: 1234"
  total: /(?:total[_\s]?tokens?)[\s:]+(\d+)/i,
  // JSON pattern: {"input_tokens": 1234, "output_tokens": 5678}
  json: /"(?:input_tokens?|prompt_tokens?)"\s*:\s*(\d+).*?"(?:output_tokens?|completion_tokens?)"\s*:\s*(\d+)/i
};

function parseTokenUsage(output: string): TokenUsage | undefined {
  try {
    // Try JSON pattern first
    const jsonMatch = output.match(TOKEN_PATTERNS.json);
    if (jsonMatch) {
      const input = parseInt(jsonMatch[1], 10);
      const outputTokens = parseInt(jsonMatch[2], 10);
      return {
        inputTokens: input,
        outputTokens: outputTokens,
        totalTokens: input + outputTokens
      };
    }

    // Try individual patterns
    const inputMatch = output.match(TOKEN_PATTERNS.input);
    const outputMatch = output.match(TOKEN_PATTERNS.output);

    if (inputMatch || outputMatch) {
      const input = inputMatch ? parseInt(inputMatch[1], 10) : 0;
      const outputTokens = outputMatch ? parseInt(outputMatch[1], 10) : 0;

      const totalMatch = output.match(TOKEN_PATTERNS.total);
      const total = totalMatch ? parseInt(totalMatch[1], 10) : input + outputTokens;

      return {
        inputTokens: input,
        outputTokens: outputTokens,
        totalTokens: total
      };
    }

    // Estimate tokens if no explicit count found (rough: 4 chars per token)
    const estimatedTokens = Math.ceil(output.length / 4);
    if (estimatedTokens > 0) {
      return {
        inputTokens: 0, // Can't estimate input without knowing prompt
        outputTokens: estimatedTokens,
        totalTokens: estimatedTokens
      };
    }

    return undefined;
  } catch {
    return undefined;
  }
}

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

          // Parse token usage from output
          const tokenUsage = parseTokenUsage(output + errorOutput);

          if (code === 0) {
            resolve({
              success: true,
              output: output.trim(),
              exitCode: code,
              tokenUsage
            });
          } else {
            resolve({
              success: false,
              output: output.trim(),
              error: errorOutput.trim() || `Process exited with code ${code}`,
              exitCode: code ?? undefined,
              tokenUsage
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
