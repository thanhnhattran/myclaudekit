import * as vscode from 'vscode';
import { StateManager } from '../lib/stateManager';
import { Message, RunAgentPayload, StopAgentPayload, ProjectTokenStats } from '../types';
import { AGENTS } from '../agents/agents.config';

export class AgentViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _stateManager: StateManager
  ) {
    // Listen for token stats changes
    this._stateManager.on('tokenStatsChanged', (stats: ProjectTokenStats) => {
      this.sendMessage({
        type: 'tokenUpdate',
        payload: stats
      });
    });
  }

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

      case 'getTokenStats':
        this.sendMessage({
          type: 'tokenUpdate',
          payload: this._stateManager.getTokenStats()
        });
        break;

      case 'resetTokenStats':
        this._stateManager.resetTokenStats();
        vscode.window.showInformationMessage('Token statistics reset');
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
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline';">
  <title>ClaudeKit</title>
  <style>
    :root {
      --font: var(--vscode-font-family, 'Segoe UI', sans-serif);
      --bg: var(--vscode-sideBar-background);
      --fg: var(--vscode-foreground);
      --border: var(--vscode-widget-border);
      --card-bg: var(--vscode-editor-background);
      --hover: var(--vscode-list-hoverBackground);
      --focus: var(--vscode-focusBorder);
      --muted: var(--vscode-descriptionForeground);
      --success: var(--vscode-charts-green);
      --warning: var(--vscode-charts-yellow);
      --error: var(--vscode-errorForeground);
      --terminal: var(--vscode-terminal-background);
      --input-bg: var(--vscode-input-background);
      --btn-bg: var(--vscode-button-background);
      --btn-fg: var(--vscode-button-foreground);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: var(--font); font-size: 13px; color: var(--fg); background: var(--bg); }
    .app { display: flex; flex-direction: column; height: 100vh; padding: 12px; gap: 12px; }

    /* Header */
    .header { display: flex; align-items: center; gap: 8px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
    .header h1 { font-size: 14px; font-weight: 600; flex: 1; }
    .header-actions { display: flex; gap: 4px; }
    .icon-btn { background: transparent; border: none; color: var(--fg); cursor: pointer; padding: 4px; border-radius: 4px; font-size: 14px; }
    .icon-btn:hover { background: var(--hover); }

    /* Tabs */
    .tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); }
    .tab { padding: 8px 12px; border: none; background: transparent; color: var(--muted); cursor: pointer; font-size: 12px; border-bottom: 2px solid transparent; }
    .tab:hover { color: var(--fg); }
    .tab.active { color: var(--fg); border-bottom-color: var(--focus); }

    /* Tab content */
    .tab-content { display: none; flex: 1; overflow: hidden; }
    .tab-content.active { display: flex; flex-direction: column; }

    /* Agents Grid */
    .section-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted); margin: 8px 0; }
    .agents-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; overflow-y: auto; flex: 1; padding: 2px; }
    .agent-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 6px; padding: 8px; cursor: pointer; transition: all 0.15s; text-align: center; }
    .agent-card:hover { border-color: var(--focus); background: var(--hover); }
    .agent-card.running { border-color: var(--warning); animation: pulse 1.5s infinite; }
    .agent-card.completed { border-color: var(--success); }
    .agent-card.error { border-color: var(--error); }
    .agent-card.selected { border-color: var(--focus); box-shadow: 0 0 0 1px var(--focus); }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
    .agent-icon { font-size: 20px; }
    .agent-name { font-size: 10px; font-weight: 500; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .agent-status { font-size: 9px; color: var(--muted); text-transform: uppercase; margin-top: 2px; }

    /* Workflows */
    .workflows-list { display: flex; flex-direction: column; gap: 6px; overflow-y: auto; flex: 1; }
    .workflow-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 6px; padding: 10px; cursor: pointer; transition: all 0.15s; }
    .workflow-card:hover { border-color: var(--focus); background: var(--hover); }
    .workflow-name { font-size: 12px; font-weight: 500; margin-bottom: 4px; }
    .workflow-meta { font-size: 10px; color: var(--muted); margin-bottom: 6px; }
    .workflow-steps { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
    .workflow-step { font-size: 14px; }
    .workflow-arrow { font-size: 10px; color: var(--muted); }

    /* Output Panel */
    .output-section { flex: 1; display: flex; flex-direction: column; min-height: 100px; }
    .output-panel { background: var(--terminal); border: 1px solid var(--border); border-radius: 6px; padding: 8px; font-family: monospace; font-size: 11px; flex: 1; overflow-y: auto; white-space: pre-wrap; word-break: break-word; }

    /* Chat Input */
    .chat-input { display: flex; gap: 6px; margin-top: 8px; }
    .chat-input input { flex: 1; padding: 8px 10px; background: var(--input-bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); font-size: 12px; }
    .chat-input input:focus { outline: none; border-color: var(--focus); }
    .chat-input button { padding: 8px 14px; background: var(--btn-bg); color: var(--btn-fg); border: none; border-radius: 6px; cursor: pointer; font-size: 12px; }
    .chat-input button:hover { opacity: 0.9; }
    .chat-input button:disabled { opacity: 0.5; cursor: not-allowed; }

    /* Empty state */
    .empty-state { text-align: center; padding: 20px; color: var(--muted); }

    /* Token Stats Panel */
    .token-stats { background: var(--card-bg); border: 1px solid var(--border); border-radius: 6px; padding: 10px; margin-bottom: 8px; }
    .token-stats-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .token-stats-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted); }
    .token-stats-reset { font-size: 10px; color: var(--muted); cursor: pointer; text-decoration: underline; }
    .token-stats-reset:hover { color: var(--fg); }
    .token-stats-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
    .token-stat { text-align: center; }
    .token-stat-value { font-size: 16px; font-weight: 600; color: var(--fg); }
    .token-stat-label { font-size: 9px; color: var(--muted); text-transform: uppercase; }
    .token-stat-cost { color: var(--success); }
  </style>
</head>
<body>
  <div class="app">
    <div class="header">
      <span style="font-size: 18px;">🤖</span>
      <h1>ClaudeKit</h1>
      <div class="header-actions">
        <button class="icon-btn" onclick="stopAll()" title="Stop All">⏹</button>
      </div>
    </div>

    <div class="token-stats" id="token-stats">
      <div class="token-stats-header">
        <span class="token-stats-title">📊 Token Usage</span>
        <span class="token-stats-reset" onclick="resetTokenStats()">Reset</span>
      </div>
      <div class="token-stats-grid">
        <div class="token-stat">
          <div class="token-stat-value" id="total-tokens">0</div>
          <div class="token-stat-label">Total Tokens</div>
        </div>
        <div class="token-stat">
          <div class="token-stat-value token-stat-cost" id="total-cost">$0.00</div>
          <div class="token-stat-label">Est. Cost</div>
        </div>
        <div class="token-stat">
          <div class="token-stat-value" id="input-tokens">0</div>
          <div class="token-stat-label">Input</div>
        </div>
        <div class="token-stat">
          <div class="token-stat-value" id="output-tokens">0</div>
          <div class="token-stat-label">Output</div>
        </div>
      </div>
    </div>

    <div class="tabs">
      <button class="tab active" data-tab="agents">Agents</button>
      <button class="tab" data-tab="workflows">Workflows</button>
    </div>

    <div id="agents-tab" class="tab-content active">
      <div class="section-title">Select an Agent</div>
      <div id="agents-grid" class="agents-grid">
        <div class="empty-state">Loading...</div>
      </div>
    </div>

    <div id="workflows-tab" class="tab-content">
      <div class="section-title">Pre-built Workflows</div>
      <div id="workflows-list" class="workflows-list"></div>
    </div>

    <div class="output-section">
      <div class="section-title">Output</div>
      <div id="output-panel" class="output-panel">
        <span style="color: var(--muted);">Select an agent or workflow to run...</span>
      </div>
    </div>

    <div class="chat-input">
      <input type="text" id="prompt-input" placeholder="Enter your prompt..." />
      <button id="run-btn" onclick="runSelected()">Run</button>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let agents = [];
    let selectedAgentId = null;
    let selectedWorkflowId = null;

    const workflows = [
      { id: 'code-review-workflow', name: 'Code Review Pipeline', pattern: 'sequential', steps: ['🔍', '🔬', '🔒'] },
      { id: 'feature-implementation', name: 'Feature Implementation', pattern: 'sequential', steps: ['🧠', '💻', '🧪', '📝'] },
      { id: 'comprehensive-analysis', name: 'Comprehensive Analysis', pattern: 'fan-out', steps: ['🔍', '🔒', '⚡', '🔬', '🎯'] },
      { id: 'brainstorm-and-plan', name: 'Brainstorm & Plan', pattern: 'sequential', steps: ['💡', '📚', '🧠'] },
      { id: 'debug-and-fix', name: 'Debug & Fix', pattern: 'sequential', steps: ['🐛', '💻', '🧪'] }
    ];

    // Initialize
    vscode.postMessage({ type: 'getAgents', payload: {} });
    vscode.postMessage({ type: 'getTokenStats', payload: {} });
    renderWorkflows();
    setupTabs();

    // Tab switching
    function setupTabs() {
      document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
          document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
          document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
          tab.classList.add('active');
          document.getElementById(tab.dataset.tab + '-tab').classList.add('active');
        });
      });
    }

    // Handle messages
    window.addEventListener('message', event => {
      const { type, payload } = event.data;
      if (type === 'agentsList') { agents = payload; renderAgents(); }
      if (type === 'agentUpdate') { updateAgentState(payload.agentId, payload.state); }
      if (type === 'tokenUpdate') { updateTokenStats(payload); }
    });

    // Token stats functions
    function updateTokenStats(stats) {
      if (!stats) return;
      document.getElementById('total-tokens').textContent = formatNumber(stats.totalTokens);
      document.getElementById('input-tokens').textContent = formatNumber(stats.totalInputTokens);
      document.getElementById('output-tokens').textContent = formatNumber(stats.totalOutputTokens);
      document.getElementById('total-cost').textContent = '$' + stats.totalCost.toFixed(4);
    }

    function resetTokenStats() {
      if (confirm('Reset all token statistics?')) {
        vscode.postMessage({ type: 'resetTokenStats', payload: {} });
      }
    }

    function formatNumber(num) {
      if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
      if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
      return num.toString();
    }

    function renderAgents() {
      const grid = document.getElementById('agents-grid');
      if (!agents.length) { grid.innerHTML = '<div class="empty-state">No agents</div>'; return; }
      grid.innerHTML = agents.map(a => \`
        <div class="agent-card \${a.state?.status || 'idle'} \${selectedAgentId === a.id ? 'selected' : ''}"
             onclick="selectAgent('\${a.id}')">
          <div class="agent-icon">\${a.icon}</div>
          <div class="agent-name">\${a.name}</div>
          <div class="agent-status">\${a.state?.status || 'idle'}</div>
        </div>\`).join('');
    }

    function renderWorkflows() {
      const list = document.getElementById('workflows-list');
      list.innerHTML = workflows.map(w => \`
        <div class="workflow-card \${selectedWorkflowId === w.id ? 'selected' : ''}" onclick="selectWorkflow('\${w.id}')">
          <div class="workflow-name">\${w.name}</div>
          <div class="workflow-meta">\${w.pattern} • \${w.steps.length} agents</div>
          <div class="workflow-steps">
            \${w.steps.map((s, i) => \`<span class="workflow-step">\${s}</span>\${i < w.steps.length - 1 ? '<span class="workflow-arrow">→</span>' : ''}\`).join('')}
          </div>
        </div>\`).join('');
    }

    function selectAgent(id) {
      selectedAgentId = id;
      selectedWorkflowId = null;
      renderAgents();
      renderWorkflows();
      const agent = agents.find(a => a.id === id);
      if (agent?.state?.output) updateOutput(agent.state.output);
      document.getElementById('prompt-input').focus();
    }

    function selectWorkflow(id) {
      selectedWorkflowId = id;
      selectedAgentId = null;
      renderAgents();
      renderWorkflows();
      updateOutput('Workflow selected. Enter a prompt and click Run.');
      document.getElementById('prompt-input').focus();
    }

    function runSelected() {
      const prompt = document.getElementById('prompt-input').value.trim();
      if (!prompt) return;

      if (selectedAgentId) {
        vscode.postMessage({ type: 'runAgent', payload: { agentId: selectedAgentId, prompt } });
        updateOutput('Starting agent...');
      } else if (selectedWorkflowId) {
        vscode.postMessage({ type: 'runWorkflow', payload: { workflowId: selectedWorkflowId, prompt } });
        updateOutput('Starting workflow...');
      } else {
        updateOutput('Please select an agent or workflow first.');
      }
    }

    function stopAll() {
      vscode.postMessage({ type: 'stopWorkflow', payload: {} });
      updateOutput('Stopping all agents...');
    }

    function updateAgentState(agentId, state) {
      const agent = agents.find(a => a.id === agentId);
      if (agent) {
        agent.state = state;
        renderAgents();
        if (selectedAgentId === agentId) updateOutput(state.output || state.error || 'No output');
      }
    }

    function updateOutput(content) {
      const panel = document.getElementById('output-panel');
      panel.textContent = content;
      panel.scrollTop = panel.scrollHeight;
    }

    // Enter to run
    document.getElementById('prompt-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') runSelected();
    });
  </script>
</body>
</html>`;
  }
}
