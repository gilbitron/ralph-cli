/**
 * Ralph CLI - TypeScript Type Definitions
 *
 * This file contains all TypeScript interfaces and types for the Ralph CLI,
 * including stream event types, application state, and configuration.
 *
 * Event types match the opencode CLI JSON output format (--format=json).
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
  timestamp?: number;
  sessionID?: string;
}

/**
 * Token usage information included in step_finish events.
 */
export interface TokenUsage {
  input?: number;
  output?: number;
  reasoning?: number;
  cache?: {
    read?: number;
    write?: number;
  };
}

/**
 * Tool state for tool_use events.
 */
export interface ToolState {
  status?: 'pending' | 'running' | 'completed' | 'error';
  title?: string;
  input?: Record<string, unknown>;
  output?: string;
  error?: string;
}

/**
 * Part structure for step_start events.
 */
export interface StepStartPart {
  id?: string;
  sessionID?: string;
  messageID?: string;
  type: 'step-start';
  snapshot?: string;
}

/**
 * Part structure for text events.
 */
export interface TextPart {
  id?: string;
  sessionID?: string;
  messageID?: string;
  type: 'text';
  text?: string;
  time?: {
    start?: number;
    end?: number;
  };
}

/**
 * Part structure for tool_use events.
 */
export interface ToolUsePart {
  id?: string;
  sessionID?: string;
  messageID?: string;
  type: 'tool';
  callID?: string;
  tool?: string;
  state?: ToolState;
}

/**
 * Part structure for step_finish events.
 */
export interface StepFinishPart {
  id?: string;
  sessionID?: string;
  messageID?: string;
  type: 'step-finish';
  reason?: string;
  snapshot?: string;
  cost?: number;
  tokens?: TokenUsage;
}

/**
 * step_start event - indicates a new step is starting.
 */
export interface StepStartEvent extends BaseEvent {
  type: 'step_start';
  part?: StepStartPart;
}

/**
 * text event - contains text output from the agent.
 */
export interface TextEvent extends BaseEvent {
  type: 'text';
  part?: TextPart;
}

/**
 * tool_use event - contains tool execution information.
 */
export interface ToolUseEvent extends BaseEvent {
  type: 'tool_use';
  part?: ToolUsePart;
}

/**
 * step_finish event - indicates a step has completed.
 */
export interface StepFinishEvent extends BaseEvent {
  type: 'step_finish';
  part?: StepFinishPart;
}

/**
 * Session error event.
 */
export interface SessionErrorEvent extends BaseEvent {
  type: 'session.error';
  error?: {
    name?: string;
    message?: string;
    data?: {
      message?: string;
    };
  };
}

/**
 * Session idle event - signals the session is complete.
 */
export interface SessionIdleEvent extends BaseEvent {
  type: 'session.idle';
}

/**
 * Union type for all known stream event types.
 * Use type guards to narrow to specific event types.
 */
export type StreamEvent =
  | StepStartEvent
  | TextEvent
  | ToolUseEvent
  | StepFinishEvent
  | SessionErrorEvent
  | SessionIdleEvent;

/**
 * Type guard functions for stream events.
 */
export function isStepStartEvent(event: StreamEvent): event is StepStartEvent {
  return event.type === 'step_start';
}

export function isTextEvent(event: StreamEvent): event is TextEvent {
  return event.type === 'text';
}

export function isToolUseEvent(event: StreamEvent): event is ToolUseEvent {
  return event.type === 'tool_use';
}

export function isStepFinishEvent(event: StreamEvent): event is StepFinishEvent {
  return event.type === 'step_finish';
}

export function isSessionErrorEvent(event: StreamEvent): event is SessionErrorEvent {
  return event.type === 'session.error';
}

export function isSessionIdleEvent(event: StreamEvent): event is SessionIdleEvent {
  return event.type === 'session.idle';
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
  /** Enable dry run mode (single iteration using Plan agent, no changes) */
  dryRun: boolean;
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
  dryRun: false,
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
