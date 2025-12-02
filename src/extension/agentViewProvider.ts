import * as vscode from 'vscode';
import { StateManager } from '../lib/stateManager';
import { Message, RunAgentPayload, StopAgentPayload } from '../types';
import { AGENTS } from '../agents/agents.config';

export class AgentViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _stateManager: StateManager
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(
      (message: Message) => {
        this._handleMessage(message);
      },
      undefined
    );
  }

  public sendMessage(message: Message): void {
    if (this._view) {
      this._view.webview.postMessage(message);
    }
  }

  private _handleMessage(message: Message): void {
    switch (message.type) {
      case 'getAgents':
        this._sendAgentsList();
        break;

      case 'runAgent':
        const runPayload = message.payload as RunAgentPayload;
        vscode.commands.executeCommand('claudekit.runAgent', runPayload.agentId);
        break;

      case 'stopAgent':
        const stopPayload = message.payload as StopAgentPayload;
        vscode.commands.executeCommand('claudekit.stopAgent', stopPayload.agentId);
        break;

      case 'runWorkflow':
        vscode.commands.executeCommand('claudekit.runWorkflow');
        break;

      default:
        console.warn('Unknown message type:', message.type);
    }
  }

  private _sendAgentsList(): void {
    const agentsWithState = AGENTS.map(agent => ({
      ...agent,
      state: this._stateManager.getAgentState(agent.id) || {
        id: agent.id,
        status: 'idle',
        output: '',
        retryCount: 0
      }
    }));

    this.sendMessage({
      type: 'agentsList',
      payload: agentsWithState
    });
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    // For now, return a simple HTML. Later this will be replaced with React build
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline';">
  <title>ClaudeKit</title>
  <style>
    :root {
      --vscode-font-family: var(--vscode-editor-font-family, 'Segoe UI', sans-serif);
    }
    body {
      font-family: var(--vscode-font-family);
      padding: 12px;
      color: var(--vscode-foreground);
      background-color: var(--vscode-sideBar-background);
    }
    .header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--vscode-widget-border);
    }
    .header h1 {
      font-size: 16px;
      font-weight: 600;
      margin: 0;
    }
    .agents-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 8px;
    }
    .agent-card {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-widget-border);
      border-radius: 6px;
      padding: 12px;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .agent-card:hover {
      border-color: var(--vscode-focusBorder);
      background: var(--vscode-list-hoverBackground);
    }
    .agent-card.running {
      border-color: var(--vscode-charts-yellow);
      animation: pulse 1.5s infinite;
    }
    .agent-card.completed {
      border-color: var(--vscode-charts-green);
    }
    .agent-card.error {
      border-color: var(--vscode-errorForeground);
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }
    .agent-icon {
      font-size: 24px;
      margin-bottom: 6px;
    }
    .agent-name {
      font-size: 12px;
      font-weight: 500;
      margin-bottom: 4px;
    }
    .agent-status {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      text-transform: uppercase;
    }
    .section-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--vscode-descriptionForeground);
      margin: 16px 0 8px 0;
    }
    .output-panel {
      background: var(--vscode-terminal-background);
      border: 1px solid var(--vscode-widget-border);
      border-radius: 6px;
      padding: 12px;
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
      max-height: 200px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .empty-state {
      text-align: center;
      padding: 24px;
      color: var(--vscode-descriptionForeground);
    }
  </style>
</head>
<body>
  <div class="header">
    <span style="font-size: 20px;">🤖</span>
    <h1>ClaudeKit Agents</h1>
  </div>

  <div class="section-title">Available Agents</div>
  <div id="agents-grid" class="agents-grid">
    <div class="empty-state">Loading agents...</div>
  </div>

  <div class="section-title">Output</div>
  <div id="output-panel" class="output-panel">
    <span style="color: var(--vscode-descriptionForeground);">Select an agent to run...</span>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let agents = [];
    let selectedAgentId = null;

    // Request agents list on load
    vscode.postMessage({ type: 'getAgents', payload: {} });

    // Handle messages from extension
    window.addEventListener('message', event => {
      const message = event.data;

      switch (message.type) {
        case 'agentsList':
          agents = message.payload;
          renderAgents();
          break;
        case 'agentUpdate':
          updateAgentState(message.payload.agentId, message.payload.state);
          break;
      }
    });

    function renderAgents() {
      const grid = document.getElementById('agents-grid');
      if (!agents.length) {
        grid.innerHTML = '<div class="empty-state">No agents available</div>';
        return;
      }

      grid.innerHTML = agents.map(agent => \`
        <div class="agent-card \${agent.state?.status || 'idle'}"
             data-agent-id="\${agent.id}"
             onclick="handleAgentClick('\${agent.id}')">
          <div class="agent-icon">\${agent.icon}</div>
          <div class="agent-name">\${agent.name}</div>
          <div class="agent-status">\${agent.state?.status || 'idle'}</div>
        </div>
      \`).join('');
    }

    function handleAgentClick(agentId) {
      const agent = agents.find(a => a.id === agentId);
      if (!agent) return;

      selectedAgentId = agentId;

      // If running, show output
      if (agent.state?.status === 'running' || agent.state?.status === 'completed') {
        updateOutputPanel(agent.state.output || 'Running...');
      } else {
        // Trigger run
        vscode.postMessage({
          type: 'runAgent',
          payload: { agentId }
        });
        updateOutputPanel('Starting agent...');
      }
    }

    function updateAgentState(agentId, state) {
      const agent = agents.find(a => a.id === agentId);
      if (agent) {
        agent.state = state;
        renderAgents();

        // Update output if this is selected agent
        if (selectedAgentId === agentId) {
          updateOutputPanel(state.output || state.error || 'No output');
        }
      }
    }

    function updateOutputPanel(content) {
      const panel = document.getElementById('output-panel');
      panel.textContent = content;
      panel.scrollTop = panel.scrollHeight;
    }
  </script>
</body>
</html>`;
  }
}
