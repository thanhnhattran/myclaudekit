import React, { useEffect, useState } from 'react';
import { AgentCard } from './components/AgentCard';
import { TerminalStream } from './components/TerminalStream';
import { useVSCodeAPI } from './hooks/useVSCodeAPI';
import type { AgentConfig, AgentState, Message } from './types';

interface AgentWithState extends AgentConfig {
  state?: AgentState;
}

function App() {
  const vscode = useVSCodeAPI();
  const [agents, setAgents] = useState<AgentWithState[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [output, setOutput] = useState<string>('Select an agent to run...');

  useEffect(() => {
    // Request agents list on mount
    vscode.postMessage({ type: 'getAgents', payload: {} });

    // Listen for messages from extension
    const handleMessage = (event: MessageEvent<Message>) => {
      const message = event.data;

      switch (message.type) {
        case 'agentsList':
          setAgents(message.payload as AgentWithState[]);
          break;

        case 'agentUpdate':
          const update = message.payload as { agentId: string; state: AgentState };
          setAgents(prev =>
            prev.map(a =>
              a.id === update.agentId ? { ...a, state: update.state } : a
            )
          );
          if (selectedAgent === update.agentId) {
            setOutput(update.state.output || update.state.error || 'Running...');
          }
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [vscode, selectedAgent]);

  const handleAgentClick = (agentId: string) => {
    setSelectedAgent(agentId);
    const agent = agents.find(a => a.id === agentId);

    if (agent?.state?.status === 'running' || agent?.state?.status === 'completed') {
      setOutput(agent.state.output || 'Running...');
    } else {
      vscode.postMessage({ type: 'runAgent', payload: { agentId } });
      setOutput('Starting agent...');
    }
  };

  const handleStopAgent = (agentId: string) => {
    vscode.postMessage({ type: 'stopAgent', payload: { agentId } });
  };

  return (
    <div className="app">
      <header className="header">
        <span className="header-icon">&#129302;</span>
        <h1>ClaudeKit Agents</h1>
      </header>

      <section className="section">
        <h2 className="section-title">Available Agents</h2>
        <div className="agents-grid">
          {agents.length === 0 ? (
            <div className="empty-state">Loading agents...</div>
          ) : (
            agents.map(agent => (
              <AgentCard
                key={agent.id}
                agent={agent}
                isSelected={selectedAgent === agent.id}
                onClick={() => handleAgentClick(agent.id)}
                onStop={() => handleStopAgent(agent.id)}
              />
            ))
          )}
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Output</h2>
        <TerminalStream content={output} />
      </section>
    </div>
  );
}

export default App;
