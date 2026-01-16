/**
 * LiveOutput Component
 *
 * Displays a scrolling output region with real-time opencode output lines.
 * Lines are color-coded based on their type:
 * - Green for success (✓)
 * - Yellow for in-progress/warning
 * - Red for errors
 * - Blue for tool execution
 * - Default for info/general output
 */

import { Box, Text } from 'ink';
import type { OutputLine } from '../types.js';

/**
 * Props for the LiveOutput component.
 */
export interface LiveOutputProps {
  /** Array of output lines to display */
  lines: OutputLine[];
  /** Maximum number of lines to show (scroll buffer size) */
  maxLines?: number;
  /** Optional width to constrain the component (defaults to terminal width) */
  width?: number;
  /** Optional height for the output region (number of visible lines) */
  height?: number;
}

/**
 * Maps output line type to the appropriate color.
 */
function getColorForType(type: OutputLine['type']): string {
  switch (type) {
    case 'success':
      return 'green';
    case 'warning':
      return 'yellow';
    case 'error':
      return 'red';
    case 'tool':
      return 'blue';
    case 'info':
      return 'white';
    case 'default':
    default:
      return 'gray';
  }
}

/**
 * Gets the prefix symbol for the line type.
 */
function getPrefixForType(type: OutputLine['type']): string {
  switch (type) {
    case 'success':
      return '✓ ';
    case 'warning':
      return '⚠ ';
    case 'error':
      return '✗ ';
    case 'tool':
      return '⚙ ';
    case 'info':
      return '→ ';
    case 'default':
    default:
      return '  ';
  }
}

/**
 * Truncates a string to fit within the given width.
 */
function truncateLine(content: string, maxWidth: number): string {
  // Account for prefix (2 chars) and padding
  const availableWidth = maxWidth - 4;
  if (content.length <= availableWidth) {
    return content;
  }
  return content.substring(0, availableWidth - 3) + '...';
}

/**
 * LiveOutput component that displays scrolling output lines.
 * Includes a bottom separator border.
 */
export function LiveOutput({
  lines,
  maxLines = 15,
  width,
  height,
}: LiveOutputProps): JSX.Element {
  // Create a border line that spans the width
  const borderWidth = width ?? 60;
  const borderLine = '─'.repeat(borderWidth);

  // Limit visible lines to maxLines (scroll buffer)
  const visibleLines = lines.slice(-maxLines);

  // Calculate actual height (use provided height or number of visible lines)
  const displayHeight = height ?? Math.min(maxLines, 10);

  // If we have fewer lines than height, pad with empty lines for consistent layout
  const emptyLinesCount = Math.max(0, displayHeight - visibleLines.length);

  return (
    <Box flexDirection="column" width={width}>
      {/* Header label */}
      <Box paddingX={1}>
        <Text color="gray">Output:</Text>
        {lines.length > maxLines && (
          <Text color="gray" dimColor>
            {' '}
            (showing last {maxLines} of {lines.length} lines)
          </Text>
        )}
      </Box>

      {/* Output lines container */}
      <Box flexDirection="column" paddingX={1} minHeight={displayHeight}>
        {/* Empty state */}
        {visibleLines.length === 0 && (
          <Box>
            <Text color="gray" italic>
              Waiting for output...
            </Text>
          </Box>
        )}

        {/* Output lines */}
        {visibleLines.map((line) => (
          <Box key={line.id}>
            <Text color={getColorForType(line.type)}>
              {getPrefixForType(line.type)}
              {truncateLine(line.content, borderWidth)}
            </Text>
          </Box>
        ))}

        {/* Padding for consistent height */}
        {emptyLinesCount > 0 &&
          visibleLines.length > 0 &&
          Array.from({ length: emptyLinesCount }).map((_, index) => (
            <Box key={`empty-${index}`}>
              <Text> </Text>
            </Box>
          ))}
      </Box>

      {/* Bottom border (separator) */}
      <Box>
        <Text color="cyan">{borderLine}</Text>
      </Box>
    </Box>
  );
}

export default LiveOutput;
