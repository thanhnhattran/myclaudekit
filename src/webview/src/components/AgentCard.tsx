import React from 'react';
import type { AgentConfig, AgentState } from '../types';

interface AgentWithState extends AgentConfig {
  state?: AgentState;
}

interface AgentCardProps {
  agent: AgentWithState;
  isSelected: boolean;
  onClick: () => void;
  onStop: () => void;
}

export function AgentCard({ agent, isSelected, onClick, onStop }: AgentCardProps) {
  const status = agent.state?.status || 'idle';
  const isRunning = status === 'running';

  const handleClick = (e: React.MouseEvent) => {
    if (isRunning) {
      e.stopPropagation();
      onStop();
    } else {
      onClick();
    }
  };

  return (
    <div
      className={`agent-card ${status} ${isSelected ? 'selected' : ''}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && handleClick(e as unknown as React.MouseEvent)}
    >
      <div className="agent-icon">{agent.icon}</div>
      <div className="agent-name">{agent.name}</div>
      <div className="agent-status">
        {isRunning && <span className="status-dot" />}
        {status}
      </div>
      {isRunning && (
        <button className="stop-button" onClick={onStop} title="Stop agent">
          &#9632;
        </button>
      )}
    </div>
  );
}
