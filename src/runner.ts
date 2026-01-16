/**
 * Ralph CLI - Iteration Runner
 *
 * This module implements the main iteration runner that executes the opencode CLI
 * in a loop, parsing output and updating the TUI via callbacks.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import type { RunnerConfig, RunnerCallbacks, StreamEvent } from './types.js';
import { StreamParser } from './stream-parser.js';
import { handleStreamEvent } from './event-handlers.js';
import { TaskDetector } from './task-detection.js';
import { CompletionDetector } from './completion-detection.js';
import { DebugLogger, createAndInitializeLogger } from './logger.js';
import { isMessagePartUpdatedEvent } from './types.js';
import { DEFAULT_PROMPT } from './prompt.js';

// =============================================================================
// Constants
// =============================================================================

/** Delay between iterations in milliseconds */
const ITERATION_DELAY_MS = 2000;

/** Maximum number of retry attempts per iteration */
const MAX_RETRIES = 3;

/** Delay between retry attempts in milliseconds */
const RETRY_DELAY_MS = 3000;

/** Exit code for user cancellation (SIGINT) */
export const EXIT_CODE_CANCELLED = 130;

/**
 * Patterns that indicate network-related errors.
 * These help provide more helpful error messages to users.
 */
const NETWORK_ERROR_PATTERNS = [
  { pattern: /ECONNREFUSED/i, message: 'Connection refused - is the API server running?' },
  { pattern: /ENOTFOUND/i, message: 'DNS lookup failed - check your internet connection' },
  { pattern: /ETIMEDOUT/i, message: 'Connection timed out - the server may be slow or unreachable' },
  { pattern: /ECONNRESET/i, message: 'Connection reset by server - try again' },
  { pattern: /EHOSTUNREACH/i, message: 'Host unreachable - check your network connection' },
  { pattern: /SSL|certificate|TLS/i, message: 'SSL/TLS error - check your certificates or network' },
  { pattern: /rate.?limit/i, message: 'Rate limited - wait before retrying' },
  { pattern: /401|unauthorized/i, message: 'Authentication failed - check your API key' },
  { pattern: /403|forbidden/i, message: 'Access forbidden - check your permissions' },
  { pattern: /429|too.?many.?requests/i, message: 'Too many requests - rate limited' },
  { pattern: /500|internal.?server.?error/i, message: 'Server error - try again later' },
  { pattern: /502|bad.?gateway/i, message: 'Bad gateway - API server may be down' },
  { pattern: /503|service.?unavailable/i, message: 'Service unavailable - try again later' },
  { pattern: /timeout/i, message: 'Request timed out' },
  { pattern: /network.?error/i, message: 'Network error - check your connection' },
];

/**
 * Detects network-related errors from stderr output.
 *
 * @param stderr - The stderr output to analyze
 * @returns A more helpful error message if a pattern matches, or null
 */
function detectNetworkError(stderr: string): string | null {
  for (const { pattern, message } of NETWORK_ERROR_PATTERNS) {
    if (pattern.test(stderr)) {
      return message;
    }
  }
  return null;
}

// =============================================================================
// Process Management State
// =============================================================================

/** Reference to the currently running child process (for cleanup on signal) */
let currentChildProcess: ChildProcess | null = null;

/** Whether the runner has been cancelled via signal */
let isCancelled = false;

/** Callbacks for notifying the TUI of cancellation */
let activeCallbacks: RunnerCallbacks | null = null;

/** Logger for cleanup logging */
let activeLogger: DebugLogger | null = null;

/** Whether signal handlers have been registered */
let signalHandlersRegistered = false;

// =============================================================================
// Signal Handling & Cleanup
// =============================================================================

/**
 * Cleans up resources and kills the child process if running.
 * Called when a termination signal is received.
 */
async function cleanup(): Promise<void> {
  // Kill the current child process if it exists
  if (currentChildProcess) {
    // Try SIGTERM first for graceful shutdown
    currentChildProcess.kill('SIGTERM');

    // Give it a moment to clean up, then force kill if still running
    await new Promise<void>((resolve) => {
      const forceKillTimeout = setTimeout(() => {
        if (currentChildProcess && !currentChildProcess.killed) {
          currentChildProcess.kill('SIGKILL');
        }
        resolve();
      }, 1000);

      // If the process exits cleanly, clear the timeout
      if (currentChildProcess) {
        currentChildProcess.once('exit', () => {
          clearTimeout(forceKillTimeout);
          resolve();
        });
      } else {
        clearTimeout(forceKillTimeout);
        resolve();
      }
    });

    currentChildProcess = null;
  }

  // Finish any active logger session
  if (activeLogger) {
    await activeLogger.finishIteration();
    activeLogger = null;
  }
}

/**
 * Handles termination signals (SIGINT, SIGTERM).
 * Cancels the runner and cleans up resources.
 *
 * @param signal - The signal received
 */
async function handleSignal(signal: NodeJS.Signals): Promise<void> {
  // Prevent multiple signal handling
  if (isCancelled) {
    return;
  }

  isCancelled = true;

  // Notify the TUI of cancellation
  if (activeCallbacks) {
    activeCallbacks.onOutput({
      content: `Received ${signal}, cancelling...`,
      type: 'warning',
    });
    activeCallbacks.onStatusChange('cancelled', `Cancelled by ${signal}`);
  }

  // Clean up resources
  await cleanup();
}

/**
 * Registers signal handlers for graceful shutdown.
 * Should be called once when the runner starts.
 */
function registerSignalHandlers(): void {
  if (signalHandlersRegistered) {
    return;
  }

  signalHandlersRegistered = true;

  // Handle SIGINT (Ctrl+C)
  process.on('SIGINT', () => {
    void handleSignal('SIGINT');
  });

  // Handle SIGTERM
  process.on('SIGTERM', () => {
    void handleSignal('SIGTERM');
  });
}

/**
 * Resets the cancellation state.
 * Should be called when starting a new run.
 */
function resetCancellationState(): void {
  isCancelled = false;
  currentChildProcess = null;
}

// =============================================================================
// Types
// =============================================================================

/**
 * Result from running an iteration.
 */
export interface IterationResult {
  /** Whether the iteration completed successfully */
  success: boolean;
  /** Whether the completion marker was detected */
  isComplete: boolean;
  /** Error message if iteration failed */
  error?: string;
  /** Exit code from the opencode process */
  exitCode?: number;
  /** Number of events received during iteration */
  eventsReceived?: number;
  /** Whether the response was empty (no meaningful events) */
  isEmpty?: boolean;
}

/**
 * Result from the full runner execution.
 */
export interface RunnerResult {
  /** Whether the runner completed successfully */
  success: boolean;
  /** Whether the completion marker was detected (all tasks done) */
  isComplete: boolean;
  /** Total number of iterations run */
  iterationsRun: number;
  /** Error message if runner failed */
  error?: string;
}

/**
 * Options for the runner.
 */
export interface RunnerOptions {
  /** Runner configuration (CLI options) */
  config: RunnerConfig;
  /** Callbacks for TUI updates */
  callbacks: RunnerCallbacks;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Gets the prompt content, either from a custom file or using the built-in default.
 *
 * @param promptFile - Optional path to a custom prompt file
 * @returns The prompt content
 * @throws If a custom file is specified but cannot be read
 */
async function getPrompt(promptFile?: string): Promise<string> {
  // If a custom prompt file is specified, read it
  if (promptFile) {
    const content = await readFile(promptFile, 'utf-8');
    return content.trim();
  }

  // Otherwise, use the built-in default prompt
  return DEFAULT_PROMPT.trim();
}

/**
 * Creates a delay promise for pausing between iterations.
 *
 * @param ms - Milliseconds to delay
 * @returns Promise that resolves after the delay
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// Iteration Runner
// =============================================================================

/**
 * Runs a single iteration of the opencode CLI.
 *
 * @param options - Runner options (config and callbacks)
 * @param iteration - The current iteration number (1-indexed)
 * @param prompt - The prompt to send to opencode
 * @param logger - Debug logger instance
 * @param taskDetector - Task detector instance
 * @param completionDetector - Completion detector instance
 * @returns Result of the iteration
 */
async function runIteration(
  options: RunnerOptions,
  iteration: number,
  prompt: string,
  logger: DebugLogger,
  taskDetector: TaskDetector,
  completionDetector: CompletionDetector
): Promise<IterationResult> {
  const { config, callbacks } = options;

  // Start logging for this iteration
  logger.startIteration(iteration);

  // Reset detectors for new iteration
  taskDetector.reset();
  // Note: Don't reset completion detector - if complete, stay complete

  return new Promise<IterationResult>((resolve) => {
    // Build the opencode command arguments
    const args = [
      'run',
      '--model', config.model,
      '--format=json',
      prompt,
    ];

    // Check if already cancelled before spawning
    if (isCancelled) {
      resolve({
        success: false,
        isComplete: false,
        error: 'Cancelled by user',
      });
      return;
    }

    // Spawn the opencode process
    const child: ChildProcess = spawn('opencode', args, {
      cwd: config.cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Track the child process for cleanup on signal
    currentChildProcess = child;

    let hasResolved = false;
    let eventsReceived = 0;
    let meaningfulEventsReceived = 0; // Events with actual content

    // Create stream parser for processing output
    const parser = new StreamParser({
      onEvent: (event: StreamEvent) => {
        eventsReceived++;

        // Log event for debugging
        logger.logEvent(event);

        // Handle the event and update TUI
        handleStreamEvent(event, {
          callbacks,
          debug: config.debug,
        });

        // Process message content for task and completion detection
        if (isMessagePartUpdatedEvent(event)) {
          const part = event.properties?.part;
          if (part) {
            // For text parts, extract content for detection
            if (part.type === 'text' && 'text' in part && part.text) {
              meaningfulEventsReceived++;
              taskDetector.processContent(part.text);
              completionDetector.processContent(part.text);
            }
            // Tool parts are meaningful events
            if (part.type === 'tool') {
              meaningfulEventsReceived++;
            }
          }
        }
      },
      onWarning: (warning: string, _rawLine: string) => {
        logger.logError(`Parse warning: ${warning}`);
        if (config.debug) {
          console.warn(`[Runner] Parse warning: ${warning}`);
        }
      },
      debug: config.debug,
    });

    // Handle stdout
    child.stdout?.on('data', (chunk: Buffer) => {
      const data = chunk.toString('utf-8');

      // Log raw output
      logger.logRawOutput(data);

      // Stream real-time backup to file
      void logger.appendRawToFile(iteration, data);

      // Feed to parser
      parser.write(data);
    });

    // Handle stderr (log as errors)
    child.stderr?.on('data', (chunk: Buffer) => {
      const data = chunk.toString('utf-8').trim();
      if (data) {
        logger.logError(data);

        // Check for network-related errors and provide helpful messages
        const networkError = detectNetworkError(data);
        if (networkError) {
          callbacks.onOutput({
            content: `Network error: ${networkError}`,
            type: 'error',
          });
        }

        callbacks.onOutput({
          content: data,
          type: 'warning',
        });
      }
    });

    // Handle process exit
    child.on('close', async (code, signal) => {
      if (hasResolved) return;
      hasResolved = true;

      // Clear the child process reference
      if (currentChildProcess === child) {
        currentChildProcess = null;
      }

      // Flush any remaining parser buffer
      parser.flush();

      // Finish logging for this iteration
      await logger.finishIteration();

      // Check if this was a cancellation
      if (isCancelled || signal === 'SIGTERM' || signal === 'SIGKILL') {
        resolve({
          success: false,
          isComplete: false,
          error: 'Cancelled by user',
          eventsReceived,
        });
        return;
      }

      const isComplete = completionDetector.getIsComplete();
      const isEmpty = meaningfulEventsReceived === 0;

      // Warn about empty response
      if (isEmpty && code === 0) {
        callbacks.onOutput({
          content: 'Warning: Received empty response from opencode (no meaningful events)',
          type: 'warning',
        });
      }

      if (code === 0 || code === null) {
        resolve({
          success: true,
          isComplete,
          exitCode: code ?? 0,
          eventsReceived,
          isEmpty,
        });
      } else {
        resolve({
          success: false,
          isComplete,
          error: `opencode exited with code ${code}`,
          exitCode: code,
          eventsReceived,
          isEmpty,
        });
      }
    });

    // Handle process errors
    child.on('error', async (error: NodeJS.ErrnoException) => {
      if (hasResolved) return;
      hasResolved = true;

      // Detect specific error types for better error messages
      let errorMessage: string;
      if (error.code === 'ENOENT') {
        errorMessage = 'opencode command not found. Please ensure opencode is installed and in your PATH.';
      } else if (error.code === 'EACCES') {
        errorMessage = 'Permission denied when trying to run opencode. Check file permissions.';
      } else if (error.code === 'EMFILE') {
        errorMessage = 'Too many open files. Try closing some applications or increasing file descriptor limit.';
      } else {
        errorMessage = error.message || 'Unknown error spawning opencode';
      }

      logger.logError(errorMessage);
      await logger.finishIteration();

      callbacks.onOutput({
        content: `Error: ${errorMessage}`,
        type: 'error',
      });

      resolve({
        success: false,
        isComplete: false,
        error: errorMessage,
      });
    });
  });
}

// =============================================================================
// Retry Logic
// =============================================================================

/**
 * Result from running an iteration with retry support.
 */
interface IterationWithRetryResult extends IterationResult {
  /** Number of retry attempts made (0 if succeeded on first try) */
  retriesUsed: number;
  /** Whether all retries were exhausted */
  retriesExhausted: boolean;
}

/**
 * Runs a single iteration with retry support.
 * Retries up to MAX_RETRIES times on failure.
 *
 * @param options - Runner options (config and callbacks)
 * @param iteration - The current iteration number (1-indexed)
 * @param prompt - The prompt to send to opencode
 * @param logger - Debug logger instance
 * @param taskDetector - Task detector instance
 * @param completionDetector - Completion detector instance
 * @returns Result of the iteration including retry information
 */
async function runIterationWithRetry(
  options: RunnerOptions,
  iteration: number,
  prompt: string,
  logger: DebugLogger,
  taskDetector: TaskDetector,
  completionDetector: CompletionDetector
): Promise<IterationWithRetryResult> {
  const { callbacks, config } = options;

  let lastResult: IterationResult | null = null;
  let retryCount = 0;

  // Try up to MAX_RETRIES + 1 times (initial attempt + retries)
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // If this is a retry (not the first attempt), notify and delay
    if (attempt > 0) {
      retryCount = attempt;

      // Notify TUI of retry
      callbacks.onRetry(retryCount);

      // Log the retry attempt
      callbacks.onOutput({
        content: `Retry ${retryCount}/${MAX_RETRIES}: Attempting to re-run iteration ${iteration}...`,
        type: 'warning',
      });

      if (config.debug) {
        logger.logError(`Retry attempt ${retryCount}/${MAX_RETRIES} for iteration ${iteration}`);
      }

      // Wait before retrying
      await delay(RETRY_DELAY_MS);
    }

    // Run the iteration
    const result = await runIteration(
      options,
      iteration,
      prompt,
      logger,
      taskDetector,
      completionDetector
    );

    lastResult = result;

    // If successful or complete, return immediately
    if (result.success || result.isComplete) {
      return {
        ...result,
        retriesUsed: retryCount,
        retriesExhausted: false,
      };
    }

    // If this was the last attempt, don't retry
    if (attempt === MAX_RETRIES) {
      break;
    }

    // Log the failure before retrying
    callbacks.onOutput({
      content: `Iteration ${iteration} failed: ${result.error ?? 'Unknown error'}`,
      type: 'error',
    });
  }

  // All retries exhausted
  return {
    ...(lastResult ?? {
      success: false,
      isComplete: false,
      error: 'Unknown error during retry',
    }),
    retriesUsed: MAX_RETRIES,
    retriesExhausted: true,
  };
}

// =============================================================================
// Main Runner
// =============================================================================

/**
 * Main runner function that executes iterations until completion or max iterations.
 *
 * @param options - Runner options (config and callbacks)
 * @returns Result of the runner execution
 */
export async function run(options: RunnerOptions): Promise<RunnerResult> {
  const { config, callbacks } = options;

  // Reset cancellation state for new run
  resetCancellationState();

  // Register signal handlers for graceful shutdown
  registerSignalHandlers();

  // Store callbacks and logger for signal handler access
  activeCallbacks = callbacks;

  // Initialize debug logger
  const logger = await createAndInitializeLogger({
    enabled: config.debug,
    cwd: config.cwd,
  });

  // Store logger for cleanup
  activeLogger = logger;

  // Get the prompt (from custom file or built-in default)
  let prompt: string;
  try {
    prompt = await getPrompt(config.promptFile);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorContext = config.promptFile
      ? `Failed to read prompt file (${config.promptFile}): ${errorMessage}`
      : `Failed to get prompt: ${errorMessage}`;
    callbacks.onStatusChange('error', errorContext);
    return {
      success: false,
      isComplete: false,
      iterationsRun: 0,
      error: errorContext,
    };
  }

  // Create detectors with callbacks
  const taskDetector = new TaskDetector({
    callbacks,
    debug: config.debug,
  });

  const completionDetector = new CompletionDetector({
    callbacks,
    debug: config.debug,
  });

  // Update status to running
  callbacks.onStatusChange('running');

  let iterationsRun = 0;

  // Main iteration loop
  for (let iteration = 1; iteration <= config.iterations; iteration++) {
    // Check for cancellation at start of each iteration
    if (isCancelled) {
      return {
        success: false,
        isComplete: false,
        iterationsRun,
        error: 'Cancelled by user',
      };
    }

    // Update iteration in TUI
    callbacks.onIterationChange(iteration);

    // Notify start of iteration
    callbacks.onOutput({
      content: `Starting iteration ${iteration}/${config.iterations}`,
      type: 'info',
    });

    // Run the iteration with retry support
    const result = await runIterationWithRetry(
      options,
      iteration,
      prompt,
      logger,
      taskDetector,
      completionDetector
    );

    iterationsRun = iteration;

    // Check for cancellation after iteration
    if (isCancelled) {
      return {
        success: false,
        isComplete: false,
        iterationsRun,
        error: 'Cancelled by user',
      };
    }

    // Check for completion
    if (result.isComplete) {
      callbacks.onOutput({
        content: 'All tasks complete! <promise>COMPLETE</promise> detected.',
        type: 'success',
      });
      callbacks.onStatusChange('complete');
      activeCallbacks = null;
      activeLogger = null;
      return {
        success: true,
        isComplete: true,
        iterationsRun,
      };
    }

    // Check if all retries were exhausted
    if (result.retriesExhausted) {
      const errorMessage = `All ${MAX_RETRIES} retries exhausted for iteration ${iteration}: ${result.error ?? 'Unknown error'}`;
      callbacks.onOutput({
        content: errorMessage,
        type: 'error',
      });
      callbacks.onStatusChange('error', errorMessage);
      activeCallbacks = null;
      activeLogger = null;
      return {
        success: false,
        isComplete: false,
        iterationsRun,
        error: errorMessage,
      };
    }

    // Check for iteration failure (shouldn't reach here normally due to retry logic)
    if (!result.success) {
      callbacks.onOutput({
        content: `Iteration ${iteration} failed: ${result.error}`,
        type: 'error',
      });
    }

    // If not the last iteration, add delay before next
    if (iteration < config.iterations) {
      callbacks.onOutput({
        content: `Waiting ${ITERATION_DELAY_MS / 1000} seconds before next iteration...`,
        type: 'info',
      });
      await delay(ITERATION_DELAY_MS);

      // Check for cancellation after delay
      if (isCancelled) {
        return {
          success: false,
          isComplete: false,
          iterationsRun,
          error: 'Cancelled by user',
        };
      }
    }
  }

  // Max iterations reached without completion
  callbacks.onOutput({
    content: `Max iterations (${config.iterations}) reached without completion.`,
    type: 'warning',
  });
  callbacks.onStatusChange('error', 'Max iterations reached');

  // Clear active references
  activeCallbacks = null;
  activeLogger = null;

  return {
    success: false,
    isComplete: false,
    iterationsRun,
    error: 'Max iterations reached without completion',
  };
}

/**
 * Creates a runner function pre-configured with options.
 * Useful for passing to the App component.
 *
 * @param options - Runner options
 * @returns A function that runs the iteration loop
 */
export function createRunner(
  options: RunnerOptions
): () => Promise<RunnerResult> {
  return () => run(options);
}

/**
 * Checks if the runner has been cancelled.
 *
 * @returns True if cancelled, false otherwise
 */
export function getIsCancelled(): boolean {
  return isCancelled;
}

/**
 * Manually trigger cleanup and cancellation.
 * Useful for programmatic cancellation from the TUI.
 *
 * @returns Promise that resolves when cleanup is complete
 */
export async function cancel(): Promise<void> {
  isCancelled = true;
  await cleanup();
}
