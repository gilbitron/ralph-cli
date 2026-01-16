/**
 * Ralph CLI - Event Handlers
 *
 * Handles specific stream event types from the opencode CLI output,
 * extracting relevant information and updating the application state.
 *
 * Based on the opencode event processor pattern:
 * - message.part.updated: Contains text, tool, step-start, step-finish parts
 * - session.error: Session error occurred
 * - session.idle: Session is complete
 * - permission.asked: Permission request (auto-handled)
 */

import type {
  StreamEvent,
  RunnerCallbacks,
  TokenUsage,
  OutputLine,
  MessagePart,
  ToolPart,
  TextPart,
  StepFinishPart,
} from './types.js';
import {
  isMessagePartUpdatedEvent,
  isSessionErrorEvent,
  isSessionIdleEvent,
} from './types.js';

/**
 * Tool display configuration.
 * Maps tool names to display names and output types.
 */
const TOOL_CONFIG: Record<string, { displayName: string; type: OutputLine['type'] }> = {
  todowrite: { displayName: 'Todo', type: 'warning' },
  todoread: { displayName: 'Todo', type: 'warning' },
  bash: { displayName: 'Bash', type: 'error' },
  edit: { displayName: 'Edit', type: 'success' },
  glob: { displayName: 'Glob', type: 'info' },
  grep: { displayName: 'Grep', type: 'info' },
  list: { displayName: 'List', type: 'info' },
  read: { displayName: 'Read', type: 'info' },
  write: { displayName: 'Write', type: 'success' },
  websearch: { displayName: 'Search', type: 'info' },
};

/**
 * Result from handling an event.
 * Contains extracted information that may be useful for the caller.
 */
export interface EventHandlerResult {
  /** Whether the event was handled */
  handled: boolean;
  /** The type of event that was handled */
  eventType: string;
  /** Any extracted content from the event */
  content?: string;
  /** Token usage if applicable */
  tokens?: TokenUsage;
  /** Tool name if applicable */
  toolName?: string;
  /** Tool result success status if applicable */
  toolSuccess?: boolean;
  /** Session status if applicable */
  sessionStatus?: string;
  /** Whether the session is complete */
  sessionComplete?: boolean;
}

/**
 * Options for the event handler.
 */
export interface EventHandlerOptions {
  /** Callbacks to update the TUI state */
  callbacks: RunnerCallbacks;
  /** Session ID to filter events for (optional) */
  sessionID?: string;
  /** Enable debug output */
  debug?: boolean;
}

/**
 * Format tool input for display.
 * Creates a concise representation of the tool's arguments.
 */
function formatToolInput(input?: Record<string, unknown>): string {
  if (!input || Object.keys(input).length === 0) {
    return '';
  }

  // For simple inputs, show key=value pairs
  const parts: string[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string') {
      // Truncate long strings
      const truncated = value.length > 50 ? value.slice(0, 47) + '...' : value;
      parts.push(`${key}="${truncated}"`);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      parts.push(`${key}=${value}`);
    } else if (value !== null && value !== undefined) {
      parts.push(`${key}=<${typeof value}>`);
    }
  }

  return parts.join(', ');
}

/**
 * Get tool display configuration.
 */
function getToolConfig(toolName: string): { displayName: string; type: OutputLine['type'] } {
  const lowerName = toolName.toLowerCase();
  return TOOL_CONFIG[lowerName] ?? { displayName: toolName, type: 'tool' };
}

/**
 * Type guard to check if a part is a tool part.
 */
function isToolPart(part: MessagePart): part is ToolPart {
  return part.type === 'tool';
}

/**
 * Type guard to check if a part is a text part.
 */
function isTextPart(part: MessagePart): part is TextPart {
  return part.type === 'text';
}

/**
 * Type guard to check if a part is a step-finish part.
 */
function isStepFinishPart(part: MessagePart): part is StepFinishPart {
  return part.type === 'step-finish';
}

/**
 * Handles a tool part from message.part.updated.
 * Shows tool execution with arguments when completed.
 */
function handleToolPart(
  part: ToolPart,
  callbacks: RunnerCallbacks
): EventHandlerResult {
  // Only show completed tools
  if (part.state?.status !== 'completed') {
    return { handled: true, eventType: 'message.part.updated' };
  }

  const toolName = part.tool ?? 'unknown';
  const config = getToolConfig(toolName);

  // Build the tool output message
  let title = part.state?.title;
  if (!title && part.state?.input) {
    title = formatToolInput(part.state.input);
  }
  if (!title) {
    title = '';
  }

  const message = title ? `${config.displayName}: ${title}` : config.displayName;

  callbacks.onOutput({
    content: message,
    type: config.type,
  });

  // For bash tool, also show the output if available
  if (toolName.toLowerCase() === 'bash' && part.state?.output?.trim()) {
    callbacks.onOutput({
      content: part.state.output.trim(),
      type: 'default',
    });
  }

  return {
    handled: true,
    eventType: 'message.part.updated',
    toolName,
    toolSuccess: part.state?.status === 'completed',
  };
}

/**
 * Handles a text part from message.part.updated.
 * Shows text output when completed (has end time).
 */
function handleTextPart(
  part: TextPart,
  callbacks: RunnerCallbacks
): EventHandlerResult {
  // Only show completed text (has end time)
  if (!part.time?.end) {
    return { handled: true, eventType: 'message.part.updated' };
  }

  const text = part.text ?? '';
  if (text.length > 0) {
    callbacks.onOutput({
      content: text,
      type: 'default',
    });
  }

  return {
    handled: true,
    eventType: 'message.part.updated',
    content: text,
  };
}

/**
 * Handles a step-finish part from message.part.updated.
 * Updates token counts but doesn't show output (per user request).
 */
function handleStepFinishPart(
  part: StepFinishPart,
  callbacks: RunnerCallbacks
): EventHandlerResult {
  const tokens = part.tokens;

  if (tokens && (tokens.input || tokens.output)) {
    callbacks.onTokensUpdate({
      input: tokens.input ?? 0,
      output: tokens.output ?? 0,
    });
  }

  // Don't output anything for step_finish per user request

  return {
    handled: true,
    eventType: 'message.part.updated',
    tokens,
  };
}

/**
 * Handles a message.part.updated event.
 * Dispatches to specific handlers based on part type.
 */
export function handleMessagePartUpdated(
  event: StreamEvent,
  callbacks: RunnerCallbacks,
  sessionID?: string
): EventHandlerResult {
  if (!isMessagePartUpdatedEvent(event)) {
    return { handled: false, eventType: event.type };
  }

  const part = event.properties?.part;
  if (!part) {
    return { handled: true, eventType: 'message.part.updated' };
  }

  // Filter by session ID if provided
  if (sessionID && part.sessionID && part.sessionID !== sessionID) {
    return { handled: true, eventType: 'message.part.updated' };
  }

  // Dispatch based on part type
  if (isToolPart(part)) {
    return handleToolPart(part, callbacks);
  }

  if (isTextPart(part)) {
    return handleTextPart(part, callbacks);
  }

  if (isStepFinishPart(part)) {
    return handleStepFinishPart(part, callbacks);
  }

  // step-start is ignored per user request
  if (part.type === 'step-start') {
    return { handled: true, eventType: 'message.part.updated' };
  }

  return { handled: true, eventType: 'message.part.updated' };
}

/**
 * Handles a session.error event.
 * Shows error message to the user.
 */
export function handleSessionError(
  event: StreamEvent,
  callbacks: RunnerCallbacks,
  sessionID?: string
): EventHandlerResult {
  if (!isSessionErrorEvent(event)) {
    return { handled: false, eventType: event.type };
  }

  // Filter by session ID if provided
  if (sessionID && event.properties?.sessionID && event.properties.sessionID !== sessionID) {
    return { handled: true, eventType: 'session.error' };
  }

  const error = event.properties?.error;
  let errorMessage = error?.name ?? 'Unknown error';

  // Check for more detailed error message
  if (error?.data?.message) {
    errorMessage = error.data.message;
  } else if (error?.message) {
    errorMessage = error.message;
  }

  callbacks.onOutput({
    content: `Error: ${errorMessage}`,
    type: 'error',
  });

  callbacks.onStatusChange('error', errorMessage);

  return {
    handled: true,
    eventType: 'session.error',
    content: errorMessage,
  };
}

/**
 * Handles a session.idle event.
 * Signals that the session is complete.
 */
export function handleSessionIdle(
  event: StreamEvent,
  _callbacks: RunnerCallbacks,
  sessionID?: string
): EventHandlerResult {
  if (!isSessionIdleEvent(event)) {
    return { handled: false, eventType: event.type };
  }

  // Filter by session ID if provided
  if (sessionID && event.properties?.sessionID && event.properties.sessionID !== sessionID) {
    return { handled: true, eventType: 'session.idle' };
  }

  // Session is complete - the runner should handle this
  return {
    handled: true,
    eventType: 'session.idle',
    sessionComplete: true,
  };
}

/**
 * Main event handler that dispatches to specific handlers based on event type.
 * This is the primary entry point for processing stream events.
 *
 * @param event - The stream event to handle
 * @param options - Handler options including callbacks
 * @returns Handler result with extracted information
 */
export function handleStreamEvent(
  event: StreamEvent,
  options: EventHandlerOptions
): EventHandlerResult {
  const { callbacks, sessionID, debug } = options;

  // Debug logging if enabled
  if (debug) {
    console.log(`[EventHandler] Received event: ${event.type}`);
  }

  // Dispatch to specific handler based on event type
  switch (event.type) {
    case 'message.part.updated':
      return handleMessagePartUpdated(event, callbacks, sessionID);

    case 'session.error':
      return handleSessionError(event, callbacks, sessionID);

    case 'session.idle':
      return handleSessionIdle(event, callbacks, sessionID);

    case 'permission.asked':
      // Permission handling would go here - for now just acknowledge
      if (debug) {
        console.log('[EventHandler] Permission asked - auto-handling not implemented');
      }
      return { handled: true, eventType: 'permission.asked' };

    default: {
      // Handle unknown event types that might be added in the future
      const unknownEvent = event as unknown as { type: string };
      if (debug) {
        console.log(`[EventHandler] Unhandled event type: ${unknownEvent.type}`);
      }
      return {
        handled: false,
        eventType: unknownEvent.type,
      };
    }
  }
}

/**
 * Creates an event handler function pre-configured with options.
 * Useful for passing to the stream parser.
 *
 * @param options - Handler options
 * @returns A function that handles stream events
 */
export function createEventHandler(
  options: EventHandlerOptions
): (event: StreamEvent) => EventHandlerResult {
  return (event: StreamEvent) => handleStreamEvent(event, options);
}
