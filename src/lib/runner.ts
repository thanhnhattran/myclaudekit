import { spawn, ChildProcess } from 'child_process';
import { AgentConfig, RunnerOptions, RunResult, TokenUsage } from '../types';
import { PromptManager } from './promptManager';

/**
 * Claude CLI JSON response structure
 */
interface ClaudeJsonResponse {
  type: string;
  subtype: string;
  is_error: boolean;
  duration_ms: number;
  duration_api_ms: number;
  num_turns: number;
  result: string;
  session_id: string;
  total_cost_usd: number;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
    server_tool_use?: {
      web_search_requests: number;
    };
    service_tier?: string;
  };
}

/**
 * Parse Claude CLI JSON response to extract token usage
 */
function parseClaudeJsonResponse(jsonOutput: string): { result: string; tokenUsage?: TokenUsage; cost?: number } | null {
  try {
    const response: ClaudeJsonResponse = JSON.parse(jsonOutput.trim());

    const inputTokens = (response.usage?.input_tokens || 0) +
                        (response.usage?.cache_creation_input_tokens || 0) +
                        (response.usage?.cache_read_input_tokens || 0);
    const outputTokens = response.usage?.output_tokens || 0;

    return {
      result: response.result || '',
      tokenUsage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        cost: response.total_cost_usd
      },
      cost: response.total_cost_usd
    };
  } catch {
    return null;
  }
}

/**
 * Fallback: Parse token usage from text output using regex patterns
 */
function parseTokenUsageFromText(output: string): TokenUsage | undefined {
  const patterns = {
    input: /(?:input[_\s]?tokens?|prompt[_\s]?tokens?)[\s:]+(\d+)/i,
    output: /(?:output[_\s]?tokens?|completion[_\s]?tokens?)[\s:]+(\d+)/i,
    total: /(?:total[_\s]?tokens?)[\s:]+(\d+)/i
  };

  const inputMatch = output.match(patterns.input);
  const outputMatch = output.match(patterns.output);

  if (inputMatch || outputMatch) {
    const input = inputMatch ? parseInt(inputMatch[1], 10) : 0;
    const outputTokens = outputMatch ? parseInt(outputMatch[1], 10) : 0;
    const totalMatch = output.match(patterns.total);
    const total = totalMatch ? parseInt(totalMatch[1], 10) : input + outputTokens;

    return { inputTokens: input, outputTokens, totalTokens: total };
  }

  return undefined;
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
          // For JSON output, we'll parse at the end - just show progress indicator
          if (onOutput) {
            onOutput('.');
          }
        });

        this.currentProcess.stderr?.on('data', (data: Buffer) => {
          const chunk = data.toString();
          errorOutput += chunk;
          if (onOutput) {
            onOutput(`[stderr] ${chunk}`);
          }
        });

        this.currentProcess.on('close', (code) => {
          this.currentProcess = null;

          // Try to parse JSON response first
          const jsonResponse = parseClaudeJsonResponse(output);

          if (jsonResponse) {
            // Successfully parsed JSON - show actual result
            if (onOutput) {
              onOutput('\n' + jsonResponse.result);
            }

            resolve({
              success: code === 0 && !jsonResponse.result.includes('error'),
              output: jsonResponse.result,
              exitCode: code ?? 0,
              tokenUsage: jsonResponse.tokenUsage
            });
          } else {
            // Fallback to text parsing
            const tokenUsage = parseTokenUsageFromText(output + errorOutput);

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

    // Add print mode for non-interactive output with JSON format for token tracking
    args.push('--print');
    args.push('--output-format', 'json');

    // Add the prompt as positional argument (not a flag)
    args.push(prompt);

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
