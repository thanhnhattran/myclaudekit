import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { AgentViewProvider } from './agentViewProvider';
import { StateManager } from '../lib/stateManager';

let stateManager: StateManager;

export function activate(context: vscode.ExtensionContext) {
  console.log('ClaudeKit is activating...');

  // Initialize State Manager
  stateManager = new StateManager();

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

  // Register Commands
  registerCommands(context, stateManager, agentViewProvider);

  // Show welcome message
  vscode.window.showInformationMessage('ClaudeKit is ready! Open the sidebar to start.');

  console.log('ClaudeKit activated successfully.');
}

export function deactivate() {
  console.log('ClaudeKit is deactivating...');

  // Cleanup: Stop all running agents
  if (stateManager) {
    stateManager.stopAllAgents();
  }
}
