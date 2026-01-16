/**
 * Ralph CLI - Debug Logger
 *
 * This module provides debug logging functionality for the Ralph CLI.
 * When --debug is enabled, it writes complete opencode output to log files
 * in the .ralph/logs/ directory for debugging purposes.
 */

import { mkdir, writeFile, appendFile, access, constants } from 'node:fs/promises';
import { join } from 'node:path';
import type { StreamEvent } from './types.js';

// =============================================================================
// Constants
// =============================================================================

/** Base directory for Ralph data */
const RALPH_DIR = '.ralph';

/** Directory for log files */
const LOGS_DIR = 'logs';

/** Maximum number of raw data bytes to buffer before flushing */
const MAX_RAW_BUFFER_SIZE = 1024 * 1024; // 1MB

// =============================================================================
// Types
// =============================================================================

/**
 * Iteration log data structure written to JSON files.
 */
export interface IterationLog {
  /** Iteration number */
  iteration: number;
  /** Timestamp when iteration started */
  startedAt: string;
  /** Timestamp when iteration finished */
  finishedAt?: string;
  /** Duration in milliseconds */
  durationMs?: number;
  /** All parsed events from the stream */
  events: StreamEvent[];
  /** Raw output lines (before JSON parsing) */
  rawOutput: string[];
  /** Any errors that occurred */
  errors: string[];
}

/**
 * Configuration for the debug logger.
 */
export interface LoggerConfig {
  /** Whether debug logging is enabled */
  enabled: boolean;
  /** Working directory (base path for .ralph/logs/) */
  cwd: string;
}

// =============================================================================
// DebugLogger Class
// =============================================================================

/**
 * Debug logger that writes iteration data to log files.
 * Only writes when enabled (--debug flag is set).
 */
export class DebugLogger {
  private readonly enabled: boolean;
  private readonly logsDir: string;
  private initialized = false;

  private currentIteration = 0;
  private currentLog: IterationLog | null = null;
  private rawBuffer: string[] = [];
  private rawBufferSize = 0;

  constructor(config: LoggerConfig) {
    this.enabled = config.enabled;
    this.logsDir = join(config.cwd, RALPH_DIR, LOGS_DIR);
  }

  /**
   * Initializes the .ralph/logs/ directory structure.
   * Creates the directory if it doesn't exist.
   * No-op if logging is disabled.
   */
  async initialize(): Promise<void> {
    if (!this.enabled) {
      return;
    }

    try {
      // Check if directory already exists
      await access(this.logsDir, constants.F_OK);
      this.initialized = true;
    } catch {
      // Directory doesn't exist, create it recursively
      try {
        await mkdir(this.logsDir, { recursive: true });
        this.initialized = true;
      } catch (error) {
        // Log warning but don't fail - debug logging is optional
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`Warning: Could not create debug log directory: ${message}`);
        this.initialized = false;
      }
    }
  }

  /**
   * Starts logging for a new iteration.
   * @param iteration - The iteration number (1-indexed)
   */
  startIteration(iteration: number): void {
    if (!this.enabled || !this.initialized) {
      return;
    }

    this.currentIteration = iteration;
    this.currentLog = {
      iteration,
      startedAt: new Date().toISOString(),
      events: [],
      rawOutput: [],
      errors: [],
    };
    this.rawBuffer = [];
    this.rawBufferSize = 0;
  }

  /**
   * Logs a raw output line (before JSON parsing).
   * @param line - The raw output line from opencode
   */
  logRawOutput(line: string): void {
    if (!this.enabled || !this.initialized || !this.currentLog) {
      return;
    }

    this.rawBuffer.push(line);
    this.rawBufferSize += line.length;

    // Flush to current log if buffer gets too large
    if (this.rawBufferSize >= MAX_RAW_BUFFER_SIZE) {
      this.flushRawBuffer();
    }
  }

  /**
   * Logs a parsed stream event.
   * @param event - The parsed stream event
   */
  logEvent(event: StreamEvent): void {
    if (!this.enabled || !this.initialized || !this.currentLog) {
      return;
    }

    this.currentLog.events.push(event);
  }

  /**
   * Logs an error that occurred during the iteration.
   * @param error - The error message
   */
  logError(error: string): void {
    if (!this.enabled || !this.initialized || !this.currentLog) {
      return;
    }

    this.currentLog.errors.push(error);
  }

  /**
   * Finishes logging for the current iteration and writes to file.
   * @returns The path to the written log file, or null if logging is disabled
   */
  async finishIteration(): Promise<string | null> {
    if (!this.enabled || !this.initialized || !this.currentLog) {
      return null;
    }

    // Flush any remaining raw buffer
    this.flushRawBuffer();

    // Add finish metadata
    const finishedAt = new Date();
    this.currentLog.finishedAt = finishedAt.toISOString();
    this.currentLog.durationMs =
      finishedAt.getTime() - new Date(this.currentLog.startedAt).getTime();

    // Generate filename with zero-padded iteration number
    const filename = formatLogFilename(this.currentIteration);
    const filepath = join(this.logsDir, filename);

    try {
      // Write the log file
      const content = JSON.stringify(this.currentLog, null, 2);
      await writeFile(filepath, content, 'utf-8');

      // Reset for next iteration
      this.currentLog = null;
      this.rawBuffer = [];
      this.rawBufferSize = 0;

      return filepath;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Warning: Could not write debug log file: ${message}`);
      return null;
    }
  }

  /**
   * Appends raw output to a log file in real-time (for streaming).
   * Useful for capturing output even if the iteration crashes.
   * @param iteration - The iteration number
   * @param data - The raw data to append
   */
  async appendRawToFile(iteration: number, data: string): Promise<void> {
    if (!this.enabled || !this.initialized) {
      return;
    }

    const filename = `iteration-${formatIterationNumber(iteration)}-raw.log`;
    const filepath = join(this.logsDir, filename);

    try {
      await appendFile(filepath, data, 'utf-8');
    } catch {
      // Silently ignore append errors to not interfere with main process
    }
  }

  /**
   * Whether debug logging is enabled.
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Whether the logger has been successfully initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Gets the logs directory path.
   */
  getLogsDir(): string {
    return this.logsDir;
  }

  /**
   * Flushes the raw buffer to the current log.
   */
  private flushRawBuffer(): void {
    if (this.currentLog && this.rawBuffer.length > 0) {
      this.currentLog.rawOutput.push(...this.rawBuffer);
      this.rawBuffer = [];
      this.rawBufferSize = 0;
    }
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Formats an iteration number with zero-padding (e.g., 1 -> "001").
 * @param iteration - The iteration number
 * @returns Zero-padded string representation
 */
export function formatIterationNumber(iteration: number): string {
  return iteration.toString().padStart(3, '0');
}

/**
 * Generates a log filename for the given iteration.
 * @param iteration - The iteration number
 * @returns Filename in format "iteration-001.json"
 */
export function formatLogFilename(iteration: number): string {
  return `iteration-${formatIterationNumber(iteration)}.json`;
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Creates a new DebugLogger instance.
 * @param config - Logger configuration
 * @returns A new DebugLogger instance
 */
export function createDebugLogger(config: LoggerConfig): DebugLogger {
  return new DebugLogger(config);
}

/**
 * Creates and initializes a debug logger.
 * @param config - Logger configuration
 * @returns An initialized DebugLogger instance
 */
export async function createAndInitializeLogger(config: LoggerConfig): Promise<DebugLogger> {
  const logger = createDebugLogger(config);
  await logger.initialize();
  return logger;
}
