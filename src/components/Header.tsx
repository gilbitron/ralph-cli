/**
 * Header Component
 *
 * Displays the Ralph CLI branding at the top of the TUI.
 * Shows "RALPH - Autonomous Agent Runner" with styling.
 */

import { Box, Text } from 'ink';

/**
 * Props for the Header component.
 */
export interface HeaderProps {
  /** Optional width to constrain the header (defaults to terminal width) */
  width?: number;
}

/**
 * Header component that displays the Ralph CLI branding.
 * Includes a top border and styled title.
 */
export function Header({ width }: HeaderProps): JSX.Element {
  // Create a border line that spans the width
  const borderWidth = width ?? 60;
  const borderLine = '─'.repeat(borderWidth);

  return (
    <Box flexDirection="column" width={width}>
      {/* Top border */}
      <Box>
        <Text color="cyan">{borderLine}</Text>
      </Box>

      {/* Branding */}
      <Box justifyContent="center" paddingX={1}>
        <Text bold color="cyan">
          RALPH
        </Text>
        <Text color="gray"> - </Text>
        <Text color="white">Autonomous Agent Runner</Text>
      </Box>

      {/* Bottom border (separator) */}
      <Box>
        <Text color="cyan">{borderLine}</Text>
      </Box>
    </Box>
  );
}

export default Header;
