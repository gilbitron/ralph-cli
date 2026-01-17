/**
 * StatusBar Component
 *
 * Displays the current status information:
 * - Current iteration (X/max format)
 * - Elapsed time (HH:MM:SS format)
 * - Cumulative token count (formatted with commas)
 */

import { Box, Text } from 'ink';

/**
 * Props for the StatusBar component.
 */
export interface StatusBarProps {
  /** Current iteration number (1-indexed) */
  currentIteration: number;
  /** Maximum number of iterations */
  maxIterations: number;
  /** Elapsed time in seconds */
  elapsedSeconds: number;
  /** Total tokens consumed (input + output) */
  totalTokens: number;
  /** Optional width to constrain the component (defaults to terminal width) */
  width?: number;
}

/**
 * Formats seconds into HH:MM:SS format.
 */
export function formatElapsedTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const pad = (n: number): string => n.toString().padStart(2, '0');

  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
}

/**
 * Formats a number with commas for thousands separators.
 */
export function formatTokenCount(tokens: number): string {
  return tokens.toLocaleString('en-US');
}

/**
 * StatusBar component that displays iteration, time, and token information.
 * Includes a bottom separator border.
 */
export function StatusBar({
  currentIteration,
  maxIterations: _maxIterations,
  elapsedSeconds,
  totalTokens,
  width,
}: StatusBarProps): JSX.Element {
  // Create a border line that spans the width
  const borderWidth = width ?? 60;
  const borderLine = '─'.repeat(borderWidth);

  const iterationDisplay = `${currentIteration}`;
  const timeDisplay = formatElapsedTime(elapsedSeconds);
  const tokenDisplay = formatTokenCount(totalTokens);

  return (
    <Box flexDirection="column" width={width}>
      {/* Status information row */}
      <Box paddingX={1} justifyContent="space-between">
        {/* Iteration */}
        <Box>
          <Text color="gray">Iteration: </Text>
          <Text color="yellow" bold>
            {iterationDisplay}
          </Text>
        </Box>

        {/* Elapsed Time */}
        <Box>
          <Text color="gray">Time: </Text>
          <Text color="white">{timeDisplay}</Text>
        </Box>

        {/* Token Count */}
        <Box>
          <Text color="gray">Tokens: </Text>
          <Text color="magenta">{tokenDisplay}</Text>
        </Box>
      </Box>

      {/* Bottom border (separator) */}
      <Box>
        <Text color="cyan">{borderLine}</Text>
      </Box>
    </Box>
  );
}

export default StatusBar;
