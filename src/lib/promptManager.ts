import { AgentConfig } from '../types';

export class PromptManager {
  /**
   * Builds the full prompt by combining system prompt with user prompt
   */
  public buildPrompt(agent: AgentConfig, userPrompt: string): string {
    const systemContext = this.buildSystemContext(agent);
    return `${systemContext}\n\n---\n\n**User Request:**\n${userPrompt}`;
  }

  /**
   * Builds the system context/instructions for an agent
   */
  private buildSystemContext(agent: AgentConfig): string {
    const parts: string[] = [];

    // Agent role header
    parts.push(`# You are: ${agent.name}`);
    parts.push(`**Role:** ${agent.description}`);

    // Capabilities
    if (agent.capabilities.length > 0) {
      parts.push('\n**Your Capabilities:**');
      agent.capabilities.forEach((cap) => {
        parts.push(`- ${cap}`);
      });
    }

    // System prompt (core instructions)
    parts.push('\n**Instructions:**');
    parts.push(agent.systemPrompt);

    // Output format guidelines
    parts.push('\n**Output Guidelines:**');
    parts.push('- Be concise and actionable');
    parts.push('- Use markdown formatting for clarity');
    parts.push('- If you encounter errors, explain them clearly');
    parts.push('- Always provide complete, working solutions');

    return parts.join('\n');
  }

  /**
   * Creates a context string from previous agent outputs (for workflow chains)
   */
  public buildChainContext(previousOutputs: Map<string, string>): string {
    if (previousOutputs.size === 0) {
      return '';
    }

    const parts: string[] = ['\n---\n**Context from Previous Agents:**'];

    for (const [agentId, output] of previousOutputs) {
      parts.push(`\n### Output from ${agentId}:`);
      parts.push('```');
      parts.push(output);
      parts.push('```');
    }

    return parts.join('\n');
  }

  /**
   * Formats the aggregation prompt for the Aggregator agent
   */
  public buildAggregationPrompt(
    allOutputs: Map<string, string>,
    originalTask: string
  ): string {
    const contextParts: string[] = [];

    contextParts.push('# Aggregation Task');
    contextParts.push(`\n**Original Request:** ${originalTask}`);
    contextParts.push('\n**Collected Outputs from Agents:**');

    for (const [agentId, output] of allOutputs) {
      contextParts.push(`\n## From ${agentId}:`);
      contextParts.push('```');
      contextParts.push(output);
      contextParts.push('```');
    }

    contextParts.push('\n---');
    contextParts.push('\n**Your Task:**');
    contextParts.push('Synthesize all the above outputs into a coherent, unified response.');
    contextParts.push('Identify key insights, resolve any conflicts, and provide actionable recommendations.');

    return contextParts.join('\n');
  }

  /**
   * Formats error context for retry attempts
   */
  public buildRetryPrompt(
    agent: AgentConfig,
    originalPrompt: string,
    error: string,
    attemptNumber: number
  ): string {
    const parts: string[] = [];

    parts.push(this.buildSystemContext(agent));
    parts.push('\n---');
    parts.push(`\n**RETRY ATTEMPT ${attemptNumber}**`);
    parts.push(`\nThe previous attempt failed with the following error:`);
    parts.push('```');
    parts.push(error);
    parts.push('```');
    parts.push('\n**Original Request:**');
    parts.push(originalPrompt);
    parts.push('\nPlease try again, addressing the error above.');

    return parts.join('\n');
  }
}
