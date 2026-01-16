#!/usr/bin/env node
/**
 * Ralph CLI - Main Entry Point
 *
 * This is the main entry point for the Ralph autonomous agent runner.
 * It handles initialization, validation, and renders the TUI.
 */

import { render } from 'ink';
import { createInterface } from 'node:readline';
import chalk from 'chalk';
import { parseCliArgs } from './cli.js';
import { validateRequiredFiles, formatValidationErrors } from './validation.js';
import { checkGitStatus, formatGitWarning } from './git.js';
import { App } from './components/App.js';
import { run, EXIT_CODE_CANCELLED } from './runner.js';
import type { RunnerCallbacks } from './types.js';

// =============================================================================
// Exit Codes
// =============================================================================

/** Exit code for success (COMPLETE found) */
const EXIT_CODE_SUCCESS = 0;

/** Exit code for error (max iterations, retries exhausted, validation failed) */
const EXIT_CODE_ERROR = 1;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Prompts the user with a yes/no question.
 *
 * @param question - The question to ask
 * @returns Promise resolving to true if user answers yes, false otherwise
 */
async function promptYesNo(question: string): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${question} (y/N): `, (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      resolve(normalized === 'y' || normalized === 'yes');
    });
  });
}

/**
 * Displays the startup banner with configuration information.
 *
 * @param iterations - Maximum number of iterations
 * @param model - Model being used
 * @param cwd - Current working directory
 * @param promptFile - Optional path to custom prompt file
 */
function displayStartupBanner(iterations: number, model: string, cwd: string, promptFile?: string): void {
  console.log('');
  console.log(chalk.cyan.bold('Starting Ralph'));
  console.log(chalk.gray('─'.repeat(40)));
  console.log(chalk.gray('Max iterations:'), chalk.white(iterations.toString()));
  console.log(chalk.gray('Model:         '), chalk.white(model));
  console.log(chalk.gray('Workspace:     '), chalk.white(cwd));
  console.log(chalk.gray('Prompt:        '), chalk.white(promptFile ?? '(built-in)'));
  console.log(chalk.gray('─'.repeat(40)));
  console.log('');
}

// =============================================================================
// Main Entry Point
// =============================================================================

/**
 * Main function that orchestrates the CLI flow.
 */
async function main(): Promise<void> {
  let exitCode = EXIT_CODE_SUCCESS;

  try {
    // Parse CLI arguments
    const config = parseCliArgs();

    // Perform file validation
    const validationResult = await validateRequiredFiles(config.cwd);
    if (!validationResult.valid) {
      console.error(chalk.red('Error: Missing required files\n'));
      console.error(formatValidationErrors(validationResult));
      process.exit(EXIT_CODE_ERROR);
    }

    // Check for uncommitted git changes
    const gitStatus = await checkGitStatus(config.cwd);
    if (gitStatus.isGitRepo && gitStatus.hasUncommittedChanges) {
      console.log('');
      console.log(chalk.yellow(formatGitWarning(gitStatus)));
      console.log('');

      const shouldContinue = await promptYesNo('Do you want to continue anyway?');
      if (!shouldContinue) {
        console.log(chalk.gray('Aborted. Please commit or stash your changes first.'));
        process.exit(EXIT_CODE_SUCCESS);
      }
      console.log('');
    }

    // Display startup banner
    displayStartupBanner(config.iterations, config.model, config.cwd, config.promptFile);

    // Track the exit code from the App component
    let appExitCode = EXIT_CODE_SUCCESS;

    // Create a promise that resolves when the App is ready
    const callbacksReady = new Promise<RunnerCallbacks>((resolve) => {
      const onReady = (callbacks: RunnerCallbacks) => {
        resolve(callbacks);
      };

      const onExit = (code: number) => {
        appExitCode = code;
      };

      // Render the ink App component
      const { unmount, waitUntilExit } = render(
        <App
          maxIterations={config.iterations}
          onReady={onReady}
          onExit={onExit}
        />
      );

      // Handle the App exit
      waitUntilExit()
        .then(() => {
          exitCode = appExitCode;
        })
        .catch((error: Error) => {
          console.error(chalk.red('TUI error:'), error.message);
          exitCode = EXIT_CODE_ERROR;
        });

      // Store unmount for cleanup (not currently used, but available)
      void unmount;
    });

    // Wait for the App to be ready and get callbacks
    const callbacks = await callbacksReady;

    // Run the iteration loop
    const result = await run({
      config,
      callbacks,
    });

    // Handle exit based on result
    if (result.isComplete) {
      exitCode = EXIT_CODE_SUCCESS;
    } else if (result.error?.includes('Cancelled')) {
      exitCode = EXIT_CODE_CANCELLED;
    } else {
      exitCode = EXIT_CODE_ERROR;
    }

    // Wait a moment for the TUI to finish rendering
    await new Promise((resolve) => setTimeout(resolve, 100));

  } catch (error) {
    // Handle unexpected errors
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(chalk.red('Fatal error:'), errorMessage);
    exitCode = EXIT_CODE_ERROR;
  }

  process.exit(exitCode);
}

// Run the main function
void main();
