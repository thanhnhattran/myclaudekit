/**
 * AgentLoader - Loads agent configurations from .claude/agents/*.md files
 *
 * Supports the following markdown format:
 *
 * # Agent Name
 *
 * ## Meta
 * - id: agent-id
 * - icon: emoji
 * - model: claude-model-id (optional)
 *
 * ## Role
 * Short role description
 *
 * ## Description
 * Longer description of what the agent does
 *
 * ## System Prompt
 * The actual system prompt text
 *
 * ## Capabilities
 * - Capability 1
 * - Capability 2
 *
 * ## Example
 * **Input:** "example input"
 * **Output:** example output
 */

import * as fs from 'fs';
import * as path from 'path';
import { AgentConfig, AgentRole, AgentExample } from '../types';

interface ParsedAgentMarkdown {
  name: string;
  meta: {
    id: string;
    icon: string;
    model?: string;
  };
  role?: string;
  description: string;
  systemPrompt: string;
  capabilities: string[];
  example?: AgentExample;
}

export class AgentLoader {
  private agentsDir: string;
  private cache: Map<string, AgentConfig> = new Map();
  private lastScanTime: number = 0;
  private readonly CACHE_TTL = 5000; // 5 seconds

  constructor(workspaceRoot: string) {
    this.agentsDir = path.join(workspaceRoot, '.claude', 'agents');
  }

  /**
   * Check if .claude/agents directory exists
   */
  hasAgentsFolder(): boolean {
    return fs.existsSync(this.agentsDir);
  }

  /**
   * Load all agents from .claude/agents/*.md files
   */
  async loadAgents(): Promise<AgentConfig[]> {
    // Check cache validity
    const now = Date.now();
    if (this.cache.size > 0 && (now - this.lastScanTime) < this.CACHE_TTL) {
      return Array.from(this.cache.values());
    }

    // Clear cache and rescan
    this.cache.clear();

    if (!this.hasAgentsFolder()) {
      return [];
    }

    const files = fs.readdirSync(this.agentsDir).filter(f => f.endsWith('.md'));
    const agents: AgentConfig[] = [];

    for (const file of files) {
      try {
        const filePath = path.join(this.agentsDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const agent = this.parseMarkdown(content);

        if (agent) {
          const config: AgentConfig = {
            id: agent.meta.id as AgentRole,
            name: agent.name,
            icon: agent.meta.icon,
            description: agent.description,
            systemPrompt: agent.systemPrompt,
            capabilities: agent.capabilities,
            model: agent.meta.model,
            role: agent.role,
            example: agent.example,
            source: 'file'
          };

          agents.push(config);
          this.cache.set(agent.meta.id, config);
        }
      } catch (error) {
        console.error(`Error loading agent from ${file}:`, error);
      }
    }

    this.lastScanTime = now;
    return agents;
  }

  /**
   * Get a specific agent by ID
   */
  async getAgent(id: string): Promise<AgentConfig | undefined> {
    await this.loadAgents(); // Ensure cache is populated
    return this.cache.get(id);
  }

  /**
   * Parse markdown content into agent configuration
   */
  private parseMarkdown(content: string): ParsedAgentMarkdown | null {
    const sections = this.splitSections(content);

    // Extract agent name from H1
    const nameMatch = content.match(/^#\s+(.+?)(?:\s+Agent)?$/m);
    const name = nameMatch ? nameMatch[1].replace(/\s+Agent$/i, '').trim() : 'Unknown';

    // Parse Meta section
    const metaSection = sections.get('Meta') || '';
    const meta = this.parseMeta(metaSection);

    if (!meta.id) {
      console.error('Agent markdown missing required id in Meta section');
      return null;
    }

    // Parse other sections
    const role = sections.get('Role')?.trim();
    const description = sections.get('Description')?.trim() || '';
    const systemPrompt = sections.get('System Prompt')?.trim() || '';
    const capabilities = this.parseCapabilities(sections.get('Capabilities') || '');
    const example = this.parseExample(sections.get('Example') || '');

    return {
      name,
      meta,
      role,
      description,
      systemPrompt,
      capabilities,
      example
    };
  }

  /**
   * Split markdown into sections by H2 headers
   */
  private splitSections(content: string): Map<string, string> {
    const sections = new Map<string, string>();
    const regex = /^##\s+(.+)$/gm;
    const matches = [...content.matchAll(regex)];

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const sectionName = match[1].trim();
      const startIndex = match.index! + match[0].length;
      const endIndex = matches[i + 1]?.index ?? content.length;
      const sectionContent = content.slice(startIndex, endIndex).trim();
      sections.set(sectionName, sectionContent);
    }

    return sections;
  }

  /**
   * Parse Meta section (key-value pairs)
   */
  private parseMeta(content: string): { id: string; icon: string; model?: string } {
    const result: { id: string; icon: string; model?: string } = { id: '', icon: '' };

    const lines = content.split('\n');
    for (const line of lines) {
      const match = line.match(/^[-*]\s*(\w+):\s*(.+)$/);
      if (match) {
        const [, key, value] = match;
        const lowerKey = key.toLowerCase();
        if (lowerKey === 'id') result.id = value.trim();
        else if (lowerKey === 'icon') result.icon = value.trim();
        else if (lowerKey === 'model') result.model = value.trim();
      }
    }

    return result;
  }

  /**
   * Parse Capabilities section (bullet list)
   */
  private parseCapabilities(content: string): string[] {
    const capabilities: string[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      const match = line.match(/^[-*]\s+(.+)$/);
      if (match) {
        capabilities.push(match[1].trim());
      }
    }

    return capabilities;
  }

  /**
   * Parse Example section
   */
  private parseExample(content: string): AgentExample | undefined {
    if (!content.trim()) return undefined;

    // Match **Input:** and **Output:** patterns
    const inputMatch = content.match(/\*\*Input:\*\*\s*(?:"([^"]+)"|(.+?)(?=\n\*\*Output|\n\n|$))/s);
    const outputMatch = content.match(/\*\*Output:\*\*\s*([\s\S]+?)(?=\n##|$)/);

    if (!inputMatch && !outputMatch) return undefined;

    return {
      input: (inputMatch?.[1] || inputMatch?.[2] || '').trim(),
      output: (outputMatch?.[1] || '').trim()
    };
  }

  /**
   * Clear the cache (useful when files change)
   */
  clearCache(): void {
    this.cache.clear();
    this.lastScanTime = 0;
  }

  /**
   * Watch for changes in the agents directory
   */
  watchForChanges(callback: () => void): fs.FSWatcher | null {
    if (!this.hasAgentsFolder()) return null;

    try {
      return fs.watch(this.agentsDir, (_eventType, filename) => {
        if (filename?.endsWith('.md')) {
          this.clearCache();
          callback();
        }
      });
    } catch (error) {
      console.error('Error setting up file watcher:', error);
      return null;
    }
  }
}

/**
 * Create a combined agent list from file-based and builtin agents
 */
export function mergeAgents(
  fileAgents: AgentConfig[],
  builtinAgents: AgentConfig[]
): AgentConfig[] {
  const merged = new Map<string, AgentConfig>();

  // Add builtin agents first (lower priority)
  for (const agent of builtinAgents) {
    merged.set(agent.id, { ...agent, source: 'builtin' });
  }

  // Override with file-based agents (higher priority)
  for (const agent of fileAgents) {
    merged.set(agent.id, agent);
  }

  return Array.from(merged.values());
}
