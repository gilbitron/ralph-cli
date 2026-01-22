# Ralph CLI

Autonomous AI agent runner that orchestrates iterative coding workflows using [opencode](https://github.com/sst/opencode).

Ralph runs an AI agent in a loop, allowing it to work through a plan of tasks autonomously. It provides a real-time TUI dashboard showing progress, token usage, and live output.

<img width="1636" height="1112" alt="Image" src="https://github.com/user-attachments/assets/795fb834-1418-470a-a1e0-df26890e9626" />

## Features

- **Iterative Execution**: Runs the AI agent in a loop until all tasks are complete or max iterations reached
- **Real-time TUI**: Beautiful terminal dashboard showing iteration progress, elapsed time, and token usage
- **Task Detection**: Automatically detects and displays the current task being worked on
- **Completion Detection**: Detects when the agent signals completion via `<promise>COMPLETE</promise>`
- **Retry Logic**: Automatically retries failed iterations up to 3 times
- **Debug Logging**: Optional detailed logging of all opencode output to `.ralph/logs/`
- **Git Safety**: Warns about uncommitted changes before starting

## Requirements

- Node.js 18+
- [opencode](https://github.com/sst/opencode) installed and configured

## Installation

```bash
npx @dev7studios/ralph-cli
```

## Usage

```bash
ralph [options]
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-i, --iterations <number>` | Maximum number of iterations | 100 |
| `-m, --model <string>` | Model to use for opencode | opus-4.5-thinking |
| `-p, --prompt <path>` | Path to custom prompt file | (built-in) |
| `--debug` | Enable debug logging to `.ralph/logs/` | false |
| `-h, --help` | Display help information | |
| `-v, --version` | Display version number | |

## Required Files

Ralph requires two files in the current working directory:

### `plan.md`

A structured plan of tasks for the agent to work through. Use markdown checkboxes to track completion:

```markdown
# Project Plan

## Phase 1: Setup

### Task 1.1: Initialize Project
- [x] Create package.json
- [x] Install dependencies

### Task 1.2: Configure TypeScript
- [ ] Create tsconfig.json
- [ ] Set up strict mode

## Phase 2: Implementation

### Task 2.1: Create Core Module
- [ ] Define types
- [ ] Implement main function
```

### `progress.md`

A log where the agent records its progress after each task. This helps maintain context across iterations:

```markdown
## 2024-01-15 - Task 1.1: Initialize Project
- Created package.json with ES module support
- Installed dependencies: typescript, tsx
- Files changed: package.json, package-lock.json
- **Learnings:**
  - Project uses ES modules
  - Node 18+ required
---
```

## Custom Prompt

Ralph includes a built-in prompt that instructs the AI agent on how to work through tasks. You can override this with a custom prompt file using the `-p` or `--prompt` option:

```bash
ralph -p ./my-custom-prompt.md
```

A custom prompt file should include instructions for the agent, typically covering:
- How to read and update the plan (`plan.md`)
- How to log progress (`progress.md`)
- Quality requirements (testing, linting, etc.)
- How to signal completion with `<promise>COMPLETE</promise>`

See the built-in prompt in `src/prompt.ts` for an example.

## Debug Logging

When `--debug` is enabled, Ralph creates detailed logs in `.ralph/logs/`:

```
.ralph/
└── logs/
    ├── iteration-001.json
    ├── iteration-002.json
    └── iteration-003.json
```

## Development

```bash
git clone https://github.com/gilbitron/ralph-cli.git
cd ralph-cli

# Run directly with tsx
npm install
npm run dev

# Or build and install globally
npm run build
npm link
ralph
```

## License

MIT
