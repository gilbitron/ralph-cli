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
  /** Whether dry run mode is enabled */
  dryRun?: boolean;
}

/**
 * Header component that displays the Ralph CLI branding.
 * Includes a top border and styled title.
 */
export function Header({ width, dryRun }: HeaderProps): JSX.Element {
  // Create a border line that spans the width
  const borderWidth = width ?? 60;
  const borderColor = dryRun ? 'yellow' : 'cyan';
  const borderLine = '─'.repeat(borderWidth);

  return (
    <Box flexDirection="column" width={width}>
      {/* Top border */}
      <Box>
        <Text color={borderColor}>{borderLine}</Text>
      </Box>

      {/* Branding */}
      <Box justifyContent="center" paddingX={1}>
        <Text bold color={borderColor}>
          RALPH
        </Text>
        <Text color="gray"> - </Text>
        <Text color="white">Autonomous Agent Runner</Text>
        {dryRun && (
          <>
            <Text color="gray"> </Text>
            <Text bold color="yellow">[DRY RUN]</Text>
          </>
        )}
      </Box>

      {/* Bottom border (separator) */}
      <Box>
        <Text color={borderColor}>{borderLine}</Text>
      </Box>
    </Box>
  );
}

export default Header;
