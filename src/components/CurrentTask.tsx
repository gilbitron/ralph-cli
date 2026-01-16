/**
 * CurrentTask Component
 *
 * Displays the current task being worked on by the agent.
 * Shows the task label and description, with handling for empty state.
 */

import { Box, Text } from 'ink';

/**
 * Props for the CurrentTask component.
 */
export interface CurrentTaskProps {
  /** The current task name/description, or undefined if no task detected yet */
  task?: string;
  /** Optional width to constrain the component (defaults to terminal width) */
  width?: number;
}

/**
 * CurrentTask component that displays the current task being worked on.
 * Includes a bottom separator border.
 */
export function CurrentTask({ task, width }: CurrentTaskProps): JSX.Element {
  // Create a border line that spans the width
  const borderWidth = width ?? 60;
  const borderLine = '─'.repeat(borderWidth);

  // Display empty state message if no task detected
  const taskDisplay = task ?? 'Waiting for task detection...';
  const hasTask = task !== undefined && task.length > 0;

  return (
    <Box flexDirection="column" width={width}>
      {/* Task information row */}
      <Box paddingX={1}>
        <Text color="gray">Current Task: </Text>
        <Text color={hasTask ? 'green' : 'gray'} italic={!hasTask}>
          {taskDisplay}
        </Text>
      </Box>

      {/* Bottom border (separator) */}
      <Box>
        <Text color="cyan">{borderLine}</Text>
      </Box>
    </Box>
  );
}

export default CurrentTask;
