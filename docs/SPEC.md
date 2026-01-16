# Ralph CLI

Create a Node.js CLI tool called `ralph` that orchestrates an iterative AI agent workflow using the `opencode` command. The CLI should be built using modern Node.js practices with TypeScript.

## Overview

Ralph is an autonomous coding agent runner that:
1. Uses a built-in prompt for the AI agent (can be overridden with a custom prompt file)
2. Checks for uncommitted git changes and warns/prompts the user
3. Runs `opencode` in a loop for up to N iterations (default: 100)
4. Displays a rich TUI dashboard with real-time progress by parsing the JSON stream output
5. Stops early when the agent signals completion via `<promise>COMPLETE</promise>` in its response
6. Requires `plan.md` and `progress.md` to exist before running

## CLI Interface

```bash
ralph [options]

Options:
  -i, --iterations <number>  Maximum iterations (default: 100)
  -m, --model <string>       Model to use (default: "opus-4.5-thinking")
  -p, --prompt <path>        Path to custom prompt file (uses built-in prompt if not specified)
  --debug                    Save detailed opencode output to .ralph/logs/
  -h, --help                 Show help
  -v, --version              Show version
```

## Requirements

### 1. File Validation

Before running, verify that `plan.md` and `progress.md` exist in the current working directory. Exit with a clear error message if any are missing. The prompt is built-in but can be overridden via the `--prompt` option.

### 2. Uncommitted Changes Check

Before starting, check for uncommitted git changes:
- If uncommitted changes exist, display a warning
- Prompt the user to continue or abort
- Allow the user to proceed at their own risk

### 3. Startup Banner

Display:
- "Starting Ralph"
- Max iterations count
- Model name
- Workspace path
- Prompt source (built-in or custom file path)

### 4. TUI Dashboard

Build an interactive terminal UI using [ink](https://github.com/vadimdemedes/ink) with the following layout:

```
┌─────────────────────────────────────────────────────────────────┐
│  RALPH - Autonomous Agent Runner                                │
│  Iteration: 3/100  │  Elapsed: 00:05:23  │  Tokens: 12,450      │
├─────────────────────────────────────────────────────────────────┤
│  Current Task: Implementing user authentication                 │
├─────────────────────────────────────────────────────────────────┤
│  Live Output:                                                   │
│  > Reading plan.md...                                           │
│  > Found next task: Implement user authentication               │
│  > Creating src/auth/login.ts...                                │
│  > Running tests...                                             │
│  > ✓ All tests passed                                           │
│  > Committing changes...                                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

Dashboard elements:
- **Header**: Ralph branding
- **Status Bar**: Current iteration (X/max), elapsed time, cumulative token usage
- **Current Task**: Parsed from `opencode` output (detect task-related messages)
- **Live Output**: Scrolling region showing real-time `opencode` output with color-coding

### 5. Iteration Loop

For each iteration (1 to max):
1. Update the TUI with current iteration number
2. Spawn `opencode` with these arguments:
   ```
   opencode run --model <MODEL> --format=json "<PROMPT>"
   ```
3. Parse the newline-delimited JSON stream in real-time
4. Update TUI with parsed events
5. Handle completion or continue to next iteration

### 6. Stream Parsing

Parse the JSON stream from `opencode --format=json` and handle these event types:

| Event Type | Action |
|------------|--------|
| `step_start` | Indicate agent is starting work |
| `message.part.updated` | Display message content in live output |
| `tool.execute.before` | Show tool being executed (with spinner) |
| `tool.execute.after` | Show tool result (success/failure) |
| `tool_use` | Display tool usage details |
| `step_finish` | Extract token usage from `part.tokens` object, update cumulative count |
| `session.status` | Update session state if relevant |

Token usage is available in the `step_finish` event under `part.tokens`:
```json
{
  "type": "step_finish",
  "part": {
    "tokens": {
      "input": 1234,
      "output": 567
    }
  }
}
```

Current task detection:
- Parse `opencode` output for task-related content
- Look for patterns like "Found next task:", "Working on:", task titles from plan.md, etc.

### 7. Completion Detection

After each iteration:
- Extract the final result from the stream (the JSON object containing the agent's response)
- If the result contains `<promise>COMPLETE</promise>`, exit successfully with a completion message
- Otherwise, log "Iteration N complete. Continuing..." and wait 2 seconds before the next iteration

### 8. Error Handling

When `opencode` fails during an iteration:
- Retry immediately up to 3 times (per iteration)
- Display the error output in the TUI
- Track retry count: "Retry 1/3", "Retry 2/3", etc.
- If all 3 retries fail, exit with error

### 9. Debug Logging

When `--debug` flag is provided:
- Create `.ralph/logs/` directory if it doesn't exist
- Save complete `opencode` output for each iteration to:
  - `.ralph/logs/iteration-001.json`
  - `.ralph/logs/iteration-002.json`
  - etc.
- Useful for debugging agent behavior and stream parsing issues

### 10. Exit Conditions

- **Exit 0**: `<promise>COMPLETE</promise>` found in agent response
- **Exit 1**: Max iterations reached without completion (display message to check `progress.md`)
- **Exit 1**: All retries exhausted on error
- **Exit 130**: User cancelled (Ctrl+C)

## Technical Stack

- **TypeScript**: Modern Node.js with ES modules
- **ink**: React-based terminal UI framework (https://github.com/vadimdemedes/ink)
- **commander** or **yargs**: CLI argument parsing (or ink's built-in)
- **Graceful JSON parsing**: Handle malformed lines without crashing
- **Process cleanup**: Ensure proper cleanup of child processes on SIGINT/SIGTERM

## Project Structure

```
ralph-cli/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.tsx           # CLI entry point with ink App
│   ├── cli.ts              # CLI argument parsing
│   ├── runner.ts           # Main iteration loop logic
│   ├── stream-parser.ts    # JSON stream parsing
│   ├── git.ts              # Git status checking
│   ├── logger.ts           # Debug logging utilities
│   ├── types.ts            # TypeScript interfaces for stream events
│   ├── prompt.ts           # Built-in default prompt content
│   └── components/
│       ├── App.tsx         # Main ink application
│       ├── Header.tsx      # Ralph branding header
│       ├── StatusBar.tsx   # Iteration, time, tokens display
│       ├── CurrentTask.tsx # Current task display
│       └── LiveOutput.tsx  # Scrolling output region
├── bin/
│   └── ralph               # Executable entry point
└── .ralph/
    └── logs/               # Debug output (when --debug used)
```

## Implementation Notes

1. **ink rendering**: Use React hooks (`useState`, `useEffect`) to manage TUI state updates
2. **Stream buffering**: Buffer partial JSON lines when parsing the stream
3. **Token accumulation**: Keep a running total of tokens across all iterations
4. **Time tracking**: Use `Date.now()` to track elapsed time from start
5. **Graceful shutdown**: Clean up child process on SIGINT before exiting
6. **Color coding**: Use ink's `<Color>` component (or `chalk` via ink) for output formatting
