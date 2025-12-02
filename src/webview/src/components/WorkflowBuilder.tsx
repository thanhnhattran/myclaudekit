import React, { useState } from 'react';
import type { AgentConfig, WorkflowPattern } from '../types';

interface WorkflowBuilderProps {
  agents: AgentConfig[];
  onRunWorkflow: (pattern: WorkflowPattern, selectedAgents: string[]) => void;
}

export function WorkflowBuilder({ agents, onRunWorkflow }: WorkflowBuilderProps) {
  const [pattern, setPattern] = useState<WorkflowPattern>('sequential');
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);

  const toggleAgent = (agentId: string) => {
    setSelectedAgents(prev =>
      prev.includes(agentId)
        ? prev.filter(id => id !== agentId)
        : [...prev, agentId]
    );
  };

  const handleRun = () => {
    if (selectedAgents.length > 0) {
      onRunWorkflow(pattern, selectedAgents);
    }
  };

  return (
    <div className="workflow-builder">
      <div className="workflow-header">
        <h3>Workflow Builder</h3>
        <select
          value={pattern}
          onChange={(e) => setPattern(e.target.value as WorkflowPattern)}
          className="pattern-select"
        >
          <option value="sequential">Sequential</option>
          <option value="parallel">Parallel</option>
          <option value="fan-out">Fan-out</option>
        </select>
      </div>

      <div className="workflow-agents">
        {agents.map(agent => (
          <label key={agent.id} className="agent-checkbox">
            <input
              type="checkbox"
              checked={selectedAgents.includes(agent.id)}
              onChange={() => toggleAgent(agent.id)}
            />
            <span className="agent-label">
              {agent.icon} {agent.name}
            </span>
          </label>
        ))}
      </div>

      <div className="workflow-preview">
        <h4>Execution Order:</h4>
        <div className="preview-chain">
          {selectedAgents.length === 0 ? (
            <span className="empty">Select agents to build workflow</span>
          ) : (
            selectedAgents.map((id, index) => {
              const agent = agents.find(a => a.id === id);
              return (
                <React.Fragment key={id}>
                  {index > 0 && (
                    <span className="connector">
                      {pattern === 'parallel' ? '||' : '→'}
                    </span>
                  )}
                  <span className="preview-agent">
                    {agent?.icon} {agent?.name}
                  </span>
                </React.Fragment>
              );
            })
          )}
        </div>
      </div>

      <button
        className="run-workflow-btn"
        onClick={handleRun}
        disabled={selectedAgents.length === 0}
      >
        Run Workflow
      </button>
    </div>
  );
}
