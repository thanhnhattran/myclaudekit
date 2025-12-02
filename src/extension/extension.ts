import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { AgentViewProvider } from './agentViewProvider';
import { StateManager } from '../lib/stateManager';

let stateManager: StateManager;
let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('ClaudeKit');
  outputChannel.appendLine('ClaudeKit is activating...');

  try {
    // Initialize State Manager with context for persistence
    stateManager = new StateManager(context);
    outputChannel.appendLine('StateManager initialized');
    outputChannel.appendLine(`Token stats loaded: ${stateManager.getTokenStats().totalTokens} total tokens`);

    // Register the Webview Provider
    const agentViewProvider = new AgentViewProvider(context.extensionUri, stateManager);
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        'claudekit.agentsView',
        agentViewProvider,
        {
          webviewOptions: {
            retainContextWhenHidden: true
          }
        }
      )
    );
    outputChannel.appendLine('WebviewViewProvider registered');

    // Register Commands
    try {
      registerCommands(context, stateManager, agentViewProvider);
      outputChannel.appendLine('Commands registered successfully');

      // Verify commands are registered
      vscode.commands.getCommands(true).then(cmds => {
        const claudekitCmds = cmds.filter(c => c.startsWith('claudekit.'));
        outputChannel.appendLine(`Registered ClaudeKit commands: ${claudekitCmds.join(', ')}`);
      });
    } catch (cmdError) {
      outputChannel.appendLine(`ERROR registering commands: ${cmdError}`);
      console.error('ClaudeKit: Error registering commands:', cmdError);
    }

    // Show welcome message
    vscode.window.showInformationMessage('ClaudeKit is ready! Open the sidebar to start.');
    outputChannel.appendLine('ClaudeKit activated successfully.');

  } catch (error) {
    outputChannel.appendLine(`ERROR during activation: ${error}`);
    console.error('ClaudeKit activation error:', error);
    throw error;
  }
}

export function deactivate() {
  console.log('ClaudeKit is deactivating...');

  // Cleanup: Stop all running agents
  if (stateManager) {
    stateManager.stopAllAgents();
  }
}
