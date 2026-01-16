/**
 * Ralph CLI - Git Status Check
 *
 * This module provides functions to check for uncommitted changes
 * in the current git repository before running the agent.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

/**
 * Result of the git status check.
 */
export interface GitStatusResult {
  /** Whether the check was successful (directory is a git repo) */
  isGitRepo: boolean;
  /** Whether there are uncommitted changes */
  hasUncommittedChanges: boolean;
  /** List of changed files (empty if no changes or not a git repo) */
  changedFiles: string[];
  /** Error message if check failed (not a git repo, etc.) */
  error: string | null;
}

/**
 * Checks for uncommitted changes in a git repository.
 *
 * This function runs `git status --porcelain` to detect any:
 * - Staged changes
 * - Unstaged modifications
 * - Untracked files
 *
 * @param cwd - The directory to check (should be within a git repo)
 * @returns GitStatusResult with the status information
 */
export async function checkGitStatus(cwd: string): Promise<GitStatusResult> {
  try {
    // Run git status --porcelain to get machine-readable output
    // --porcelain gives a stable format: XY filename
    // where XY are status codes (e.g., "M ", " M", "??", "A ", etc.)
    const { stdout } = await execAsync('git status --porcelain', {
      cwd,
      // Set a reasonable timeout
      timeout: 10000,
    });

    // Parse the output - each line represents a changed file
    const lines = stdout.trim().split('\n').filter((line) => line.length > 0);

    // Extract just the filenames (format is "XY filename" where XY is 2 chars + space)
    // Use regex to handle any whitespace variation between status and filename
    const changedFiles = lines.map((line) => line.replace(/^..\s/, ''));

    return {
      isGitRepo: true,
      hasUncommittedChanges: lines.length > 0,
      changedFiles,
      error: null,
    };
  } catch (error) {
    // Check if this is a "not a git repository" error
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes('not a git repository')) {
      return {
        isGitRepo: false,
        hasUncommittedChanges: false,
        changedFiles: [],
        error: 'Not a git repository',
      };
    }

    // Check if git command is not found
    if (errorMessage.includes('command not found') || errorMessage.includes('ENOENT')) {
      return {
        isGitRepo: false,
        hasUncommittedChanges: false,
        changedFiles: [],
        error: 'Git is not installed or not in PATH',
      };
    }

    // Other unexpected error
    return {
      isGitRepo: false,
      hasUncommittedChanges: false,
      changedFiles: [],
      error: `Git status check failed: ${errorMessage}`,
    };
  }
}

/**
 * Formats the git status result for console output.
 *
 * @param result - The git status result to format
 * @returns Formatted warning message, or empty string if no issues
 */
export function formatGitWarning(result: GitStatusResult): string {
  if (!result.isGitRepo) {
    return ''; // Not a git repo - no warning needed
  }

  if (!result.hasUncommittedChanges) {
    return ''; // No changes - no warning needed
  }

  const lines: string[] = [
    'Warning: You have uncommitted changes in your repository:',
    '',
  ];

  // Show up to 10 changed files
  const maxFiles = 10;
  const filesToShow = result.changedFiles.slice(0, maxFiles);

  for (const file of filesToShow) {
    lines.push(`  - ${file}`);
  }

  // Indicate if there are more files
  if (result.changedFiles.length > maxFiles) {
    const remaining = result.changedFiles.length - maxFiles;
    lines.push(`  ... and ${remaining} more file${remaining === 1 ? '' : 's'}`);
  }

  lines.push('');
  lines.push('Ralph may commit these changes as part of its work.');
  lines.push('Consider committing or stashing your changes first.');

  return lines.join('\n');
}
