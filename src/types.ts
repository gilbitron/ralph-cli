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
  properties?: {
    sessionID?: string;
    [key: string]: unknown;
  };
}

/**
 * Token usage information included in step_finish events.
 */
export interface TokenUsage {
  input?: number;
  output?: number;
}

/**
 * Tool part state for message.part.updated events.
 */
export interface ToolPartState {
  status?: 'pending' | 'running' | 'completed' | 'error';
  title?: string;
  input?: Record<string, unknown>;
  output?: string;
  error?: string;
}

/**
 * Text part with timing info.
 */
export interface TextPart {
  type: 'text';
  sessionID?: string;
  text?: string;
  time?: {
    start?: number;
    end?: number;
  };
}

/**
 * Tool part for tool usage.
 */
export interface ToolPart {
  type: 'tool';
  sessionID?: string;
  tool?: string;
  state?: ToolPartState;
}

/**
 * Step start part.
 */
export interface StepStartPart {
  type: 'step-start';
  sessionID?: string;
}

/**
 * Step finish part with tokens.
 */
export interface StepFinishPart {
  type: 'step-finish';
  sessionID?: string;
  tokens?: TokenUsage;
}

/**
 * Union type for message parts.
 */
export type MessagePart = TextPart | ToolPart | StepStartPart | StepFinishPart;

/**
 * Contains updated message content from the agent.
 * The part.type determines what kind of update this is:
 * - 'text': Text output from the agent
 * - 'tool': Tool usage information
 * - 'step-start': Step started (ignored)
 * - 'step-finish': Step finished with token info
 */
export interface MessagePartUpdatedEvent extends BaseEvent {
  type: 'message.part.updated';
  properties?: {
    sessionID?: string;
    part?: MessagePart;
  };
}

/**
 * Session error event.
 */
export interface SessionErrorEvent extends BaseEvent {
  type: 'session.error';
  properties?: {
    sessionID?: string;
    error?: {
      name?: string;
      message?: string;
      data?: {
        message?: string;
      };
    };
  };
}

/**
 * Session idle event - signals the session is complete.
 */
export interface SessionIdleEvent extends BaseEvent {
  type: 'session.idle';
  properties?: {
    sessionID?: string;
  };
}

/**
 * Permission asked event.
 */
export interface PermissionAskedEvent extends BaseEvent {
  type: 'permission.asked';
  properties?: {
    sessionID?: string;
    id?: string;
    permission?: string;
    patterns?: string[];
    always?: string[];
  };
}

/**
 * Union type for all known stream event types.
 * Use type guards to narrow to specific event types.
 */
export type StreamEvent =
  | MessagePartUpdatedEvent
  | SessionErrorEvent
  | SessionIdleEvent
  | PermissionAskedEvent;

/**
 * Type guard functions for stream events.
 */
export function isMessagePartUpdatedEvent(event: StreamEvent): event is MessagePartUpdatedEvent {
  return event.type === 'message.part.updated';
}

export function isSessionErrorEvent(event: StreamEvent): event is SessionErrorEvent {
  return event.type === 'session.error';
}

export function isSessionIdleEvent(event: StreamEvent): event is SessionIdleEvent {
  return event.type === 'session.idle';
}

export function isPermissionAskedEvent(event: StreamEvent): event is PermissionAskedEvent {
  return event.type === 'permission.asked';
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
