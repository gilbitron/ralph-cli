/**
 * Main App Component
 *
 * The root TUI component that composes all child components and manages
 * the application state. This component is rendered by ink and handles
 * all state updates from the runner.
 */

import { Box, Text, useApp, useStdout } from 'ink';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { AppState, OutputLine, RunnerCallbacks, TokenUsage, AppStatus } from '../types.js';
import { Header } from './Header.js';
import { StatusBar } from './StatusBar.js';
import { CurrentTask } from './CurrentTask.js';
import { LiveOutput } from './LiveOutput.js';

/**
 * Props for the App component.
 */
export interface AppProps {
  /** Maximum number of iterations */
  maxIterations: number;
  /** Callback to receive the runner callbacks for state updates */
  onReady?: (callbacks: RunnerCallbacks) => void;
  /** Callback when the app should exit */
  onExit?: (code: number) => void;
}

/**
 * Generates a unique ID for output lines.
 */
function generateLineId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Creates the initial application state.
 */
function createInitialState(maxIterations: number): AppState {
  return {
    currentIteration: 0,
    maxIterations,
    startTime: Date.now(),
    totalTokens: { input: 0, output: 0 },
    currentTask: null,
    outputLines: [],
    status: 'idle',
    retryCount: 0,
    errorMessage: null,
  };
}

/**
 * Maximum number of output lines to retain in memory.
 * Older lines are discarded to prevent memory issues.
 */
const MAX_OUTPUT_LINES = 1000;

/**
 * Throttle interval for batching rapid output updates (milliseconds).
 * Output lines are batched and flushed at this interval to prevent
 * excessive re-renders during rapid output bursts.
 */
const OUTPUT_THROTTLE_MS = 100;

/**
 * Main App component that composes all TUI elements.
 */
export function App({ maxIterations, onReady, onExit }: AppProps): JSX.Element {
  const { exit } = useApp();
  const { stdout } = useStdout();

  // Application state
  const [state, setState] = useState<AppState>(() => createInitialState(maxIterations));

  // Elapsed time in seconds (updated every second)
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Output batching refs for throttling rapid updates
  const pendingLinesRef = useRef<OutputLine[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Get terminal width for responsive layout
  const terminalWidth = stdout?.columns ?? 80;
  const width = Math.min(terminalWidth - 2, 100); // Cap width at 100 for readability

  // Time tracking effect - updates elapsed time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - state.startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [state.startTime]);

  // Handle exit when status changes to complete or error
  useEffect(() => {
    if (state.status === 'complete') {
      onExit?.(0);
      exit();
    } else if (state.status === 'error') {
      onExit?.(1);
      exit();
    } else if (state.status === 'cancelled') {
      onExit?.(130);
      exit();
    }
  }, [state.status, exit, onExit]);

  // Callback: Update iteration number
  const onIterationChange = useCallback((iteration: number) => {
    setState((prev) => ({
      ...prev,
      currentIteration: iteration,
      status: 'running',
      retryCount: 0, // Reset retry count on new iteration
    }));
  }, []);

  // Callback: Update token counts
  const onTokensUpdate = useCallback((tokens: TokenUsage) => {
    setState((prev) => ({
      ...prev,
      totalTokens: {
        input: prev.totalTokens.input + (tokens.input ?? 0),
        output: prev.totalTokens.output + (tokens.output ?? 0),
      },
    }));
  }, []);

  // Callback: Update current task
  const onTaskChange = useCallback((task: string) => {
    setState((prev) => ({
      ...prev,
      currentTask: task,
    }));
  }, []);

  // Flush pending output lines to state (batched update)
  const flushPendingLines = useCallback(() => {
    if (pendingLinesRef.current.length === 0) {
      return;
    }

    const linesToAdd = [...pendingLinesRef.current];
    pendingLinesRef.current = [];

    setState((prev) => {
      const newLines = [...prev.outputLines, ...linesToAdd];
      if (newLines.length > MAX_OUTPUT_LINES) {
        return {
          ...prev,
          outputLines: newLines.slice(-MAX_OUTPUT_LINES),
        };
      }
      return {
        ...prev,
        outputLines: newLines,
      };
    });
  }, []);

  // Callback: Add new output line (batched for rapid updates)
  const onOutput = useCallback((line: Omit<OutputLine, 'id' | 'timestamp'>) => {
    const newLine: OutputLine = {
      ...line,
      id: generateLineId(),
      timestamp: Date.now(),
    };

    // Add to pending batch
    pendingLinesRef.current.push(newLine);

    // Schedule flush if not already scheduled
    if (!flushTimerRef.current) {
      flushTimerRef.current = setTimeout(() => {
        flushTimerRef.current = null;
        flushPendingLines();
      }, OUTPUT_THROTTLE_MS);
    }
  }, [flushPendingLines]);

  // Clean up flush timer on unmount
  useEffect(() => {
    return () => {
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        // Flush any remaining pending lines
        flushPendingLines();
      }
    };
  }, [flushPendingLines]);

  // Callback: Update status
  const onStatusChange = useCallback((status: AppStatus, errorMessage?: string) => {
    setState((prev) => ({
      ...prev,
      status,
      errorMessage: errorMessage ?? null,
    }));
  }, []);

  // Callback: Update retry count
  const onRetry = useCallback((retryCount: number) => {
    setState((prev) => ({
      ...prev,
      retryCount,
    }));
  }, []);

  // Create runner callbacks object
  const runnerCallbacks: RunnerCallbacks = useMemo(
    () => ({
      onIterationChange,
      onTokensUpdate,
      onTaskChange,
      onOutput,
      onStatusChange,
      onRetry,
    }),
    [onIterationChange, onTokensUpdate, onTaskChange, onOutput, onStatusChange, onRetry]
  );

  // Notify parent that callbacks are ready
  useEffect(() => {
    onReady?.(runnerCallbacks);
  }, [onReady, runnerCallbacks]);

  // Calculate total tokens (input + output)
  const totalTokenCount = state.totalTokens.input + state.totalTokens.output;

  return (
    <Box flexDirection="column" width={width}>
      {/* Header with branding */}
      <Header width={width} />

      {/* Status bar with iteration, time, and tokens */}
      <StatusBar
        currentIteration={state.currentIteration}
        maxIterations={state.maxIterations}
        elapsedSeconds={elapsedSeconds}
        totalTokens={totalTokenCount}
        width={width}
      />

      {/* Current task display */}
      <CurrentTask
        task={state.currentTask ?? undefined}
        width={width}
      />

      {/* Live output region */}
      <LiveOutput
        lines={state.outputLines}
        maxLines={15}
        width={width}
        height={10}
      />

      {/* Status message for retry/error states */}
      {state.retryCount > 0 && (
        <Box paddingX={1}>
          <StatusMessage type="warning">
            Retry {state.retryCount}/3...
          </StatusMessage>
        </Box>
      )}

      {state.errorMessage && (
        <Box paddingX={1}>
          <StatusMessage type="error">
            Error: {state.errorMessage}
          </StatusMessage>
        </Box>
      )}
    </Box>
  );
}

/**
 * Props for the StatusMessage component.
 */
interface StatusMessageProps {
  type: 'info' | 'warning' | 'error' | 'success';
  children: React.ReactNode;
}

/**
 * Small helper component for status messages.
 */
function StatusMessage({ type, children }: StatusMessageProps): JSX.Element {
  const colors: Record<string, string> = {
    info: 'white',
    warning: 'yellow',
    error: 'red',
    success: 'green',
  };

  return <Text color={colors[type]}>{children}</Text>;
}

export default App;
