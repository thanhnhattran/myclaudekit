import * as vscode from 'vscode';
import { StateManager } from '../lib/stateManager';
import { AgentViewProvider } from './agentViewProvider';
import { AgentRunner } from '../lib/runner';
import { WorkflowRunner, WORKFLOW_TEMPLATES } from '../lib/workflowRunner';
import { AgentRole, Workflow } from '../types';
import { AGENTS } from '../agents/agents.config';

export function registerCommands(
  context: vscode.ExtensionContext,
  stateManager: StateManager,
  viewProvider: AgentViewProvider
): void {
  // Command: Open Agent Panel
  const openPanelCmd = vscode.commands.registerCommand('claudekit.openPanel', () => {
    vscode.commands.executeCommand('claudekit.agentsView.focus');
  });

  // Command: Run Agent
  const runAgentCmd = vscode.commands.registerCommand(
    'claudekit.runAgent',
    async (agentId?: AgentRole) => {
      // If no agentId provided, show quick pick
      if (!agentId) {
        const items = AGENTS.map(agent => ({
          label: `${agent.icon} ${agent.name}`,
          description: agent.description,
          agentId: agent.id
        }));

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select an agent to run'
        });

        if (!selected) {
          return;
        }
        agentId = selected.agentId;
      }

      // Get user prompt
      const prompt = await vscode.window.showInputBox({
        prompt: `Enter your prompt for ${agentId} agent`,
        placeHolder: 'Describe what you want the agent to do...'
      });

      if (!prompt) {
        return;
      }

      // Get configuration
      const config = vscode.workspace.getConfiguration('claudekit');
      const cliPath = config.get<string>('claudeCliPath', 'claude');
      const maxRetries = config.get<number>('maxRetries', 3);
      const model = config.get<string>('defaultModel', 'claude-opus-4-5-20251101');

      // Get working directory
      const workingDirectory = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();

      // Create runner and execute
      const runner = new AgentRunner({
        cliPath,
        maxRetries,
        model,
        workingDirectory
      });

      const agent = AGENTS.find(a => a.id === agentId);
      if (!agent) {
        vscode.window.showErrorMessage(`Agent ${agentId} not found`);
        return;
      }

      // Update state to running
      stateManager.updateAgentState(agentId, {
        id: agentId,
        status: 'running',
        output: '',
        retryCount: 0,
        startTime: Date.now()
      });

      // Notify webview
      viewProvider.sendMessage({
        type: 'agentUpdate',
        payload: {
          agentId,
          state: stateManager.getAgentState(agentId)!
        }
      });

      try {
        const result = await runner.run(agent, prompt, (chunk) => {
          // Stream output to state
          const currentState = stateManager.getAgentState(agentId!);
          if (currentState) {
            stateManager.updateAgentState(agentId!, {
              ...currentState,
              output: currentState.output + chunk
            });

            // Notify webview of update
            viewProvider.sendMessage({
              type: 'agentUpdate',
              payload: {
                agentId: agentId!,
                state: stateManager.getAgentState(agentId!)!
              }
            });
          }
        });

        // Update final state
        stateManager.updateAgentState(agentId, {
          id: agentId,
          status: result.success ? 'completed' : 'error',
          output: result.output,
          error: result.error,
          retryCount: 0,
          endTime: Date.now()
        });

        if (result.success) {
          vscode.window.showInformationMessage(`Agent ${agent.name} completed successfully`);
        } else {
          vscode.window.showErrorMessage(`Agent ${agent.name} failed: ${result.error}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        stateManager.updateAgentState(agentId, {
          id: agentId,
          status: 'error',
          output: '',
          error: errorMessage,
          retryCount: 0,
          endTime: Date.now()
        });
        vscode.window.showErrorMessage(`Agent ${agent.name} error: ${errorMessage}`);
      }

      // Notify webview of final state
      viewProvider.sendMessage({
        type: 'agentUpdate',
        payload: {
          agentId,
          state: stateManager.getAgentState(agentId)!
        }
      });
    }
  );

  // Command: Stop Agent
  const stopAgentCmd = vscode.commands.registerCommand(
    'claudekit.stopAgent',
    async (agentId?: AgentRole) => {
      if (!agentId) {
        // Show running agents
        const runningAgents = stateManager.getRunningAgents();
        if (runningAgents.length === 0) {
          vscode.window.showInformationMessage('No agents are currently running');
          return;
        }

        const items = runningAgents.map(state => {
          const agent = AGENTS.find(a => a.id === state.id);
          return {
            label: `${agent?.icon || ''} ${agent?.name || state.id}`,
            description: 'Running',
            agentId: state.id
          };
        });

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select an agent to stop'
        });

        if (!selected) {
          return;
        }
        agentId = selected.agentId;
      }

      stateManager.stopAgent(agentId);
      vscode.window.showInformationMessage(`Stopped agent ${agentId}`);

      // Notify webview
      viewProvider.sendMessage({
        type: 'agentUpdate',
        payload: {
          agentId,
          state: stateManager.getAgentState(agentId)!
        }
      });
    }
  );

  // Command: Run Workflow
  const runWorkflowCmd = vscode.commands.registerCommand(
    'claudekit.runWorkflow',
    async (workflowId?: string) => {
      // If no workflowId provided, show quick pick
      let workflow: Workflow | undefined;

      if (!workflowId) {
        const items = WORKFLOW_TEMPLATES.map(w => ({
          label: w.name,
          description: `${w.pattern} - ${w.steps.length} agents`,
          detail: w.steps.map(s => {
            const agent = AGENTS.find(a => a.id === s.agentId);
            return agent?.icon || s.agentId;
          }).join(' → '),
          workflow: w
        }));

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select a workflow to run'
        });

        if (!selected) {
          return;
        }
        workflow = selected.workflow;
      } else {
        workflow = WORKFLOW_TEMPLATES.find(w => w.id === workflowId);
      }

      if (!workflow) {
        vscode.window.showErrorMessage('Workflow not found');
        return;
      }

      // Get user prompt
      const prompt = await vscode.window.showInputBox({
        prompt: `Enter your prompt for "${workflow.name}" workflow`,
        placeHolder: 'Describe what you want to accomplish...'
      });

      if (!prompt) {
        return;
      }

      // Get configuration
      const config = vscode.workspace.getConfiguration('claudekit');
      const cliPath = config.get<string>('claudeCliPath', 'claude');
      const maxRetries = config.get<number>('maxRetries', 3);
      const model = config.get<string>('defaultModel', 'claude-opus-4-5-20251101');
      const workingDirectory = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();

      // Create output channel for workflow
      const outputChannel = vscode.window.createOutputChannel(`ClaudeKit: ${workflow.name}`);
      outputChannel.show();
      outputChannel.appendLine(`Starting workflow: ${workflow.name}`);
      outputChannel.appendLine(`Pattern: ${workflow.pattern}`);
      outputChannel.appendLine(`Agents: ${workflow.steps.map(s => s.agentId).join(' → ')}`);
      outputChannel.appendLine('─'.repeat(50));

      // Create workflow runner
      const workflowRunner = new WorkflowRunner(
        {
          cliPath,
          maxRetries,
          model,
          workingDirectory,
          onAgentStart: (agentId) => {
            const agent = AGENTS.find(a => a.id === agentId);
            outputChannel.appendLine(`\n${agent?.icon || '🤖'} Starting ${agent?.name || agentId}...`);

            // Update webview
            viewProvider.sendMessage({
              type: 'agentUpdate',
              payload: {
                agentId,
                state: stateManager.getAgentState(agentId)!
              }
            });
          },
          onAgentOutput: (agentId, chunk) => {
            outputChannel.append(chunk);

            // Update webview with streaming output
            const state = stateManager.getAgentState(agentId);
            if (state) {
              viewProvider.sendMessage({
                type: 'agentUpdate',
                payload: { agentId, state }
              });
            }
          },
          onAgentComplete: (agentId, _result) => {
            const agent = AGENTS.find(a => a.id === agentId);
            outputChannel.appendLine(`\n✅ ${agent?.name || agentId} completed`);

            viewProvider.sendMessage({
              type: 'agentUpdate',
              payload: {
                agentId,
                state: stateManager.getAgentState(agentId)!
              }
            });
          },
          onWorkflowComplete: (_wfId, outputs) => {
            outputChannel.appendLine('\n' + '─'.repeat(50));
            outputChannel.appendLine(`✅ Workflow "${workflow!.name}" completed!`);
            outputChannel.appendLine(`Completed agents: ${outputs.size}`);
          }
        },
        stateManager
      );

      try {
        vscode.window.showInformationMessage(`Starting workflow: ${workflow.name}`);
        await workflowRunner.execute(workflow, prompt);
        vscode.window.showInformationMessage(`Workflow "${workflow.name}" completed!`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        outputChannel.appendLine(`\n❌ Workflow error: ${errorMessage}`);
        vscode.window.showErrorMessage(`Workflow error: ${errorMessage}`);
      }
    }
  );

  // Command: Stop Workflow
  const stopWorkflowCmd = vscode.commands.registerCommand(
    'claudekit.stopWorkflow',
    async () => {
      stateManager.stopAllAgents();
      vscode.window.showInformationMessage('All agents stopped');
    }
  );

  context.subscriptions.push(openPanelCmd, runAgentCmd, stopAgentCmd, runWorkflowCmd, stopWorkflowCmd);
}
