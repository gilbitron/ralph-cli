/**
 * Ralph CLI - TypeScript Type Definitions
 *
 * This file contains all TypeScript interfaces and types for the Ralph CLI,
 * including stream event types, application state, and configuration.
 */

// =============================================================================
// Stream Event Types
// =============================================================================

/**
 * Base interface for all stream events.
 * All events have a 'type' discriminator field.
 */
interface BaseEvent {
  type: string;
}

/**
 * Indicates the agent is starting work on a step.
 */
export interface StepStartEvent extends BaseEvent {
  type: 'step_start';
  step?: {
    id?: string;
    name?: string;
  };
}

/**
 * Contains updated message content from the agent.
 * Used to display streaming text output.
 */
export interface MessagePartUpdatedEvent extends BaseEvent {
  type: 'message.part.updated';
  part?: {
    type?: string;
    content?: string;
    delta?: string;
  };
}

/**
 * Emitted before a tool is executed.
 * Used to show a spinner/indicator while tool runs.
 */
export interface ToolExecuteBeforeEvent extends BaseEvent {
  type: 'tool.execute.before';
  tool?: {
    name?: string;
    id?: string;
  };
  input?: unknown;
}

/**
 * Emitted after a tool has finished executing.
 * Contains the result status (success/failure).
 */
export interface ToolExecuteAfterEvent extends BaseEvent {
  type: 'tool.execute.after';
  tool?: {
    name?: string;
    id?: string;
  };
  result?: {
    success?: boolean;
    error?: string;
    output?: unknown;
  };
}

/**
 * Contains details about tool usage.
 */
export interface ToolUseEvent extends BaseEvent {
  type: 'tool_use';
  tool?: {
    name?: string;
    id?: string;
  };
  input?: unknown;
}

/**
 * Token usage information included in step_finish events.
 */
export interface TokenUsage {
  input?: number;
  output?: number;
}

/**
 * Emitted when a step finishes.
 * Contains token usage information in part.tokens.
 */
export interface StepFinishEvent extends BaseEvent {
  type: 'step_finish';
  part?: {
    tokens?: TokenUsage;
    content?: string;
  };
}

/**
 * Contains session status updates.
 */
export interface SessionStatusEvent extends BaseEvent {
  type: 'session.status';
  status?: string;
  session?: {
    id?: string;
    state?: string;
  };
}

/**
 * Union type for all known stream event types.
 * Use type guards to narrow to specific event types.
 */
export type StreamEvent =
  | StepStartEvent
  | MessagePartUpdatedEvent
  | ToolExecuteBeforeEvent
  | ToolExecuteAfterEvent
  | ToolUseEvent
  | StepFinishEvent
  | SessionStatusEvent;

/**
 * Type guard functions for stream events.
 */
export function isStepStartEvent(event: StreamEvent): event is StepStartEvent {
  return event.type === 'step_start';
}

export function isMessagePartUpdatedEvent(event: StreamEvent): event is MessagePartUpdatedEvent {
  return event.type === 'message.part.updated';
}

export function isToolExecuteBeforeEvent(event: StreamEvent): event is ToolExecuteBeforeEvent {
  return event.type === 'tool.execute.before';
}

export function isToolExecuteAfterEvent(event: StreamEvent): event is ToolExecuteAfterEvent {
  return event.type === 'tool.execute.after';
}

export function isToolUseEvent(event: StreamEvent): event is ToolUseEvent {
  return event.type === 'tool_use';
}

export function isStepFinishEvent(event: StreamEvent): event is StepFinishEvent {
  return event.type === 'step_finish';
}

export function isSessionStatusEvent(event: StreamEvent): event is SessionStatusEvent {
  return event.type === 'session.status';
}

// =============================================================================
// Application State Types
// =============================================================================

/**
 * Status of the application/runner.
 */
export type AppStatus = 'idle' | 'running' | 'complete' | 'error' | 'cancelled';

/**
 * A single line of output to display in the TUI.
 */
export interface OutputLine {
  id: string;
  content: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'tool' | 'default';
  timestamp: number;
}

/**
 * State of the TUI application.
 * Used by the main App component to render the dashboard.
 */
export interface AppState {
  /** Current iteration number (1-indexed) */
  currentIteration: number;
  /** Maximum number of iterations */
  maxIterations: number;
  /** Timestamp when the run started */
  startTime: number;
  /** Cumulative token count across all iterations */
  totalTokens: {
    input: number;
    output: number;
  };
  /** Current task being worked on (parsed from output) */
  currentTask: string | null;
  /** Lines of output to display in the live output region */
  outputLines: OutputLine[];
  /** Current status of the application */
  status: AppStatus;
  /** Current retry count for the current iteration (0 if not retrying) */
  retryCount: number;
  /** Error message if status is 'error' */
  errorMessage: string | null;
}

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Configuration parsed from CLI arguments.
 */
export interface RunnerConfig {
  /** Maximum number of iterations (default: 100) */
  iterations: number;
  /** Model to use for opencode (default: "opus-4.5-thinking") */
  model: string;
  /** Enable debug logging to .ralph/logs/ */
  debug: boolean;
  /** Current working directory */
  cwd: string;
  /** Path to custom prompt file (optional, uses built-in prompt if not specified) */
  promptFile?: string;
}

/**
 * Default configuration values.
 */
export const DEFAULT_CONFIG: Omit<RunnerConfig, 'cwd' | 'promptFile'> = {
  iterations: 100,
  model: 'opencode/claude-opus-4-5',
  debug: false,
};

// =============================================================================
// Callback Types for Runner
// =============================================================================

/**
 * Callbacks that the runner uses to update the TUI.
 */
export interface RunnerCallbacks {
  /** Called when iteration changes */
  onIterationChange: (iteration: number) => void;
  /** Called when tokens are consumed */
  onTokensUpdate: (tokens: TokenUsage) => void;
  /** Called when current task is detected */
  onTaskChange: (task: string) => void;
  /** Called when there's new output to display */
  onOutput: (line: Omit<OutputLine, 'id' | 'timestamp'>) => void;
  /** Called when status changes */
  onStatusChange: (status: AppStatus, errorMessage?: string) => void;
  /** Called when retrying */
  onRetry: (retryCount: number) => void;
}
