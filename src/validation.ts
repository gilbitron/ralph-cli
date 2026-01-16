/**
 * Ralph CLI - File Validation
 *
 * This module provides functions to validate that required files exist
 * in the working directory before running the agent.
 */

import { access, constants } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Required files that must exist in the working directory.
 * Note: prompt.md is no longer required as the prompt is built-in
 * and can be overridden via the --prompt CLI option.
 */
export const REQUIRED_FILES = ['plan.md', 'progress.md'] as const;

/**
 * Result of file validation.
 */
export interface ValidationResult {
  /** Whether all required files exist */
  valid: boolean;
  /** List of missing files (empty if valid) */
  missingFiles: string[];
  /** Error messages for missing files */
  errors: string[];
}

/**
 * Checks if a file exists at the given path.
 *
 * @param filePath - Absolute path to the file
 * @returns True if the file exists and is readable
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates that all required files exist in the given directory.
 *
 * @param cwd - The working directory to check for files
 * @returns ValidationResult with status and any error messages
 */
export async function validateRequiredFiles(cwd: string): Promise<ValidationResult> {
  const missingFiles: string[] = [];
  const errors: string[] = [];

  // Check each required file
  for (const file of REQUIRED_FILES) {
    const filePath = join(cwd, file);
    const exists = await fileExists(filePath);

    if (!exists) {
      missingFiles.push(file);
      errors.push(`Missing required file: ${file}`);
    }
  }

  // Add helpful context if files are missing
  if (missingFiles.length > 0) {
    errors.push('');
    errors.push('Ralph requires the following files in your project:');
    errors.push('  - plan.md      Task list with checkboxes for tracking progress');
    errors.push('  - progress.md  Log of completed work and learnings');
    errors.push('');
    errors.push('Optional: Use --prompt <path> to specify a custom prompt file.');
  }

  return {
    valid: missingFiles.length === 0,
    missingFiles,
    errors,
  };
}

/**
 * Formats validation errors for console output.
 *
 * @param result - The validation result containing errors
 * @returns Formatted error message string
 */
export function formatValidationErrors(result: ValidationResult): string {
  if (result.valid) {
    return '';
  }

  return result.errors.join('\n');
}
