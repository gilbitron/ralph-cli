/**
 * Ralph CLI - Event Handlers
 *
 * Handles specific stream event types from the opencode CLI output,
 * extracting relevant information and updating the application state.
 */

import type {
  StreamEvent,
  RunnerCallbacks,
  TokenUsage,
  OutputLine,
} from './types.js';
import {
  isStepStartEvent,
  isMessagePartUpdatedEvent,
  isToolExecuteBeforeEvent,
  isToolExecuteAfterEvent,
  isToolUseEvent,
  isStepFinishEvent,
  isSessionStatusEvent,
} from './types.js';

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
}

/**
 * Options for the event handler.
 */
export interface EventHandlerOptions {
  /** Callbacks to update the TUI state */
  callbacks: RunnerCallbacks;
  /** Enable debug output */
  debug?: boolean;
}

/**
 * Handles a step_start event.
 * Indicates the agent is starting work on a new step.
 *
 * @param event - The step_start event
 * @param callbacks - Runner callbacks for state updates
 * @returns Handler result with step information
 */
export function handleStepStart(
  event: StreamEvent,
  callbacks: RunnerCallbacks
): EventHandlerResult {
  if (!isStepStartEvent(event)) {
    return { handled: false, eventType: event.type };
  }

  const stepName = event.step?.name ?? 'unknown';
  const stepId = event.step?.id;

  // Output info about the new step
  callbacks.onOutput({
    content: `Starting step${stepId ? ` (${stepId})` : ''}: ${stepName}`,
    type: 'info',
  });

  return {
    handled: true,
    eventType: 'step_start',
    content: stepName,
  };
}

/**
 * Handles a message.part.updated event.
 * Contains streaming text output from the agent.
 *
 * @param event - The message.part.updated event
 * @param callbacks - Runner callbacks for state updates
 * @returns Handler result with message content
 */
export function handleMessagePartUpdated(
  event: StreamEvent,
  callbacks: RunnerCallbacks
): EventHandlerResult {
  if (!isMessagePartUpdatedEvent(event)) {
    return { handled: false, eventType: event.type };
  }

  // Extract the content - could be full content or delta (incremental)
  const content = event.part?.delta ?? event.part?.content ?? '';

  if (content.length > 0) {
    // For message content, we output as default type
    // The caller can accumulate these for display
    callbacks.onOutput({
      content,
      type: 'default',
    });
  }

  return {
    handled: true,
    eventType: 'message.part.updated',
    content,
  };
}

/**
 * Handles a tool.execute.before event.
 * Indicates a tool is about to execute.
 *
 * @param event - The tool.execute.before event
 * @param callbacks - Runner callbacks for state updates
 * @returns Handler result with tool information
 */
export function handleToolExecuteBefore(
  event: StreamEvent,
  callbacks: RunnerCallbacks
): EventHandlerResult {
  if (!isToolExecuteBeforeEvent(event)) {
    return { handled: false, eventType: event.type };
  }

  const toolName = event.tool?.name ?? 'unknown tool';

  // Output tool execution start with tool type styling
  callbacks.onOutput({
    content: `Executing: ${toolName}`,
    type: 'tool',
  });

  return {
    handled: true,
    eventType: 'tool.execute.before',
    toolName,
  };
}

/**
 * Handles a tool.execute.after event.
 * Contains the result of a tool execution.
 *
 * @param event - The tool.execute.after event
 * @param callbacks - Runner callbacks for state updates
 * @returns Handler result with tool result information
 */
export function handleToolExecuteAfter(
  event: StreamEvent,
  callbacks: RunnerCallbacks
): EventHandlerResult {
  if (!isToolExecuteAfterEvent(event)) {
    return { handled: false, eventType: event.type };
  }

  const toolName = event.tool?.name ?? 'unknown tool';
  const success = event.result?.success ?? true;
  const error = event.result?.error;

  if (success) {
    callbacks.onOutput({
      content: `Completed: ${toolName}`,
      type: 'success',
    });
  } else {
    callbacks.onOutput({
      content: `Failed: ${toolName}${error ? ` - ${error}` : ''}`,
      type: 'error',
    });
  }

  return {
    handled: true,
    eventType: 'tool.execute.after',
    toolName,
    toolSuccess: success,
    content: error,
  };
}

/**
 * Handles a tool_use event.
 * Contains details about tool usage.
 *
 * @param event - The tool_use event
 * @param callbacks - Runner callbacks for state updates
 * @returns Handler result with tool information
 */
export function handleToolUse(
  event: StreamEvent,
  callbacks: RunnerCallbacks
): EventHandlerResult {
  if (!isToolUseEvent(event)) {
    return { handled: false, eventType: event.type };
  }

  const toolName = event.tool?.name ?? 'unknown tool';

  // Output tool usage info
  callbacks.onOutput({
    content: `Using tool: ${toolName}`,
    type: 'tool',
  });

  return {
    handled: true,
    eventType: 'tool_use',
    toolName,
  };
}

/**
 * Handles a step_finish event.
 * Contains token usage information for the completed step.
 *
 * @param event - The step_finish event
 * @param callbacks - Runner callbacks for state updates
 * @returns Handler result with token usage
 */
export function handleStepFinish(
  event: StreamEvent,
  callbacks: RunnerCallbacks
): EventHandlerResult {
  if (!isStepFinishEvent(event)) {
    return { handled: false, eventType: event.type };
  }

  const tokens = event.part?.tokens;

  if (tokens && (tokens.input || tokens.output)) {
    // Update token counts
    callbacks.onTokensUpdate({
      input: tokens.input ?? 0,
      output: tokens.output ?? 0,
    });

    // Output token info
    const inputTokens = tokens.input ?? 0;
    const outputTokens = tokens.output ?? 0;
    callbacks.onOutput({
      content: `Step complete (tokens: ${inputTokens.toLocaleString()} in / ${outputTokens.toLocaleString()} out)`,
      type: 'info',
    });
  } else {
    callbacks.onOutput({
      content: 'Step complete',
      type: 'info',
    });
  }

  return {
    handled: true,
    eventType: 'step_finish',
    tokens,
  };
}

/**
 * Handles a session.status event.
 * Contains session state updates.
 *
 * @param event - The session.status event
 * @param callbacks - Runner callbacks for state updates
 * @returns Handler result with session status
 */
export function handleSessionStatus(
  event: StreamEvent,
  callbacks: RunnerCallbacks
): EventHandlerResult {
  if (!isSessionStatusEvent(event)) {
    return { handled: false, eventType: event.type };
  }

  const status = event.status ?? event.session?.state ?? 'unknown';

  // Map session status to appropriate output type
  let outputType: OutputLine['type'] = 'info';
  if (status === 'error' || status === 'failed') {
    outputType = 'error';
  } else if (status === 'complete' || status === 'completed' || status === 'success') {
    outputType = 'success';
  } else if (status === 'running' || status === 'working') {
    outputType = 'info';
  }

  callbacks.onOutput({
    content: `Session status: ${status}`,
    type: outputType,
  });

  return {
    handled: true,
    eventType: 'session.status',
    sessionStatus: status,
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
  const { callbacks, debug } = options;

  // Debug logging if enabled
  if (debug) {
    console.log(`[EventHandler] Received event: ${event.type}`);
  }

  // Dispatch to specific handler based on event type
  switch (event.type) {
    case 'step_start':
      return handleStepStart(event, callbacks);

    case 'message.part.updated':
      return handleMessagePartUpdated(event, callbacks);

    case 'tool.execute.before':
      return handleToolExecuteBefore(event, callbacks);

    case 'tool.execute.after':
      return handleToolExecuteAfter(event, callbacks);

    case 'tool_use':
      return handleToolUse(event, callbacks);

    case 'step_finish':
      return handleStepFinish(event, callbacks);

    case 'session.status':
      return handleSessionStatus(event, callbacks);

    default: {
      // Handle unknown event types that might be added in the future
      // Cast to unknown first, then to the expected shape to extract type safely
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
