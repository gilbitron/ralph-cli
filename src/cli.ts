/**
 * Ralph CLI - Command Line Argument Parser
 *
 * This module handles parsing and validation of CLI arguments using Commander.
 * It exports the parsed configuration for use by the main application.
 */

import { Command, InvalidArgumentError } from 'commander';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_CONFIG, type RunnerConfig } from './types.js';

/**
 * Package information for CLI metadata.
 * In production, this could be read from package.json.
 */
const PACKAGE_NAME = 'ralph';
const PACKAGE_VERSION = '1.0.0';
const PACKAGE_DESCRIPTION =
  'Autonomous AI agent runner that orchestrates iterative coding workflows using opencode';

/**
 * Parses a string value to a positive integer.
 * Throws an error if the value is not a valid positive integer.
 */
function parsePositiveInteger(value: string): number {
  const parsed = parseInt(value, 10);

  if (isNaN(parsed)) {
    throw new InvalidArgumentError('Must be a valid number.');
  }

  if (parsed <= 0) {
    throw new InvalidArgumentError('Must be a positive number.');
  }

  return parsed;
}

/**
 * Validates that a model string is non-empty.
 */
function parseModel(value: string): string {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    throw new InvalidArgumentError('Model name cannot be empty.');
  }

  return trimmed;
}

/**
 * Validates that a prompt file path exists and is readable.
 */
function parsePromptPath(value: string): string {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    throw new InvalidArgumentError('Prompt file path cannot be empty.');
  }

  // Resolve to absolute path
  const absolutePath = resolve(process.cwd(), trimmed);

  if (!existsSync(absolutePath)) {
    throw new InvalidArgumentError(`Prompt file not found: ${absolutePath}`);
  }

  return absolutePath;
}

/**
 * Creates and configures the Commander program.
 */
function createProgram(): Command {
  const program = new Command();

  program
    .name(PACKAGE_NAME)
    .version(PACKAGE_VERSION, '-v, --version', 'Display version number')
    .description(PACKAGE_DESCRIPTION)
    .option(
      '-i, --iterations <number>',
      'Maximum number of iterations',
      parsePositiveInteger,
      DEFAULT_CONFIG.iterations
    )
    .option(
      '-m, --model <string>',
      'Model to use for opencode',
      parseModel,
      DEFAULT_CONFIG.model
    )
    .option(
      '-p, --prompt <path>',
      'Path to custom prompt file (uses built-in prompt if not specified)',
      parsePromptPath
    )
    .option('--debug', 'Enable debug logging to .ralph/logs/', DEFAULT_CONFIG.debug)
    .helpOption('-h, --help', 'Display help information');

  return program;
}

/**
 * Interface for parsed CLI options from Commander.
 */
interface ParsedOptions {
  iterations: number;
  model: string;
  prompt?: string;
  debug: boolean;
}

/**
 * Parses CLI arguments and returns the runner configuration.
 * This function should be called from the main entry point.
 *
 * @param argv - Command line arguments (defaults to process.argv)
 * @returns The parsed runner configuration
 */
export function parseCliArgs(argv: string[] = process.argv): RunnerConfig {
  const program = createProgram();

  // Parse the arguments
  program.parse(argv);

  // Get the parsed options
  const options = program.opts<ParsedOptions>();

  // Build and return the configuration
  const config: RunnerConfig = {
    iterations: options.iterations,
    model: options.model,
    debug: options.debug,
    cwd: process.cwd(),
    promptFile: options.prompt,
  };

  return config;
}

/**
 * Displays the help message and exits.
 * Useful for showing help when validation fails.
 */
export function showHelp(): void {
  const program = createProgram();
  program.outputHelp();
}

/**
 * Gets the program version string.
 */
export function getVersion(): string {
  return PACKAGE_VERSION;
}
