# ClaudeKit for VS Code - The Multi-Agent Orchestrator

> A VS Code Extension that acts as a GUI Wrapper for `claude-code` CLI and the MCP ecosystem.

## 🎯 Project Overview

**ClaudeKit** cho phép người dùng kích hoạt, quản lý và trực quan hóa các quy trình Agent (Sequential, Parallel, Fan-out) ngay trong IDE.

### Tech Stack

- **Core:** TypeScript, Node.js
- **UI:** React, VS Code Webview UI Toolkit
- **AI Engine:** `claude-code` CLI & Claude Opus 4.5 API (via MCP)
- **Communication:** `child_process` (spawn CLI), MCP (Model Context Protocol)

## 🏗️ Architecture

Extension hoạt động theo mô hình **Command Center**:

1. **Frontend (Webview):** Panel hiển thị danh sách 15 Agents, sơ đồ Workflow và Chat Interface
2. **Backend (Extension Process):**
   - **Agent Runner:** Module sử dụng Node.js `pty` hoặc `child_process` để gọi lệnh `claude` CLI
   - **Prompt Manager:** Quản lý thư viện System Prompts cho từng loại Agent
   - **State Manager:** Theo dõi trạng thái của các Agent

## 📁 Project Structure

```
claudekit-vscode/
├── src/
│   ├── extension/          # VS Code Extension main logic
│   │   ├── extension.ts    # Entry point
│   │   └── commands.ts     # Command handlers
│   ├── webview/            # React App for UI
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── AgentCard.tsx
│   │   │   ├── WorkflowBuilder.tsx
│   │   │   └── TerminalStream.tsx
│   │   └── index.tsx
│   ├── agents/             # Agent definitions
│   │   └── agents.config.ts
│   └── lib/                # Utilities
│       ├── runner.ts       # CloudRunner class
│       ├── promptManager.ts
│       └── stateManager.ts
├── package.json
├── tsconfig.json
└── README.md
```

## 🚀 Features

### Agent Profiles (15 Roles)

| Agent | Description |
|-------|-------------|
| 🧠 Planner | Creates detailed implementation plans |
| 🔍 Scout | Explores and maps codebase structure |
| 📚 Researcher | Gathers information and documentation |
| 💻 Implementer | Writes production code |
| 🔬 Code-Reviewer | Reviews code for quality and best practices |
| 🔒 Security-Auditor | Analyzes security vulnerabilities |
| 🎨 UI-UX-Designer | Designs user interfaces |
| 🗄️ Database-Admin | Manages database schemas and queries |
| 🧪 Tester | Creates and runs tests |
| 📝 Documenter | Writes documentation |
| 🐛 Debugger | Finds and fixes bugs |
| ⚡ Optimizer | Improves performance |
| 🔧 DevOps | Handles CI/CD and infrastructure |
| 💡 Brainstormer | Generates creative ideas |
| 🎯 Aggregator | Synthesizes outputs from multiple agents |

### Workflow Patterns

- **Sequential Chain:** A → Output → B → Output → C
- **Parallel Execution:** Run A, B, C simultaneously, then aggregate
- **Loop Control:** Auto-retry on errors (Max retries = 3)

## 🛠️ Development

### Prerequisites

- Node.js >= 18
- VS Code >= 1.85.0
- `claude-code` CLI installed

### Installation

```bash
# Clone repository
git clone https://github.com/thanhnhattran/myclaudekit.git
cd myclaudekit

# Install dependencies
npm install

# Build
npm run build

# Run in development mode
npm run watch
```

### Testing in VS Code

1. Press `F5` to open a new VS Code window with the extension loaded
2. Open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
3. Type `ClaudeKit` to see available commands

## 📋 Implementation Phases

- [x] Phase 1: Project Scaffolding
- [ ] Phase 2: Agent Runner (Core Logic)
- [ ] Phase 3: UI & Workflow Builder
- [ ] Phase 4: Agent Definitions

## 📄 License

MIT License

---

Built with ❤️ using Claude Code
