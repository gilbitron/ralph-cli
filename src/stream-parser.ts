/**
 * Ralph CLI - JSON Stream Parser
 *
 * Handles parsing of newline-delimited JSON (NDJSON) streams
 * from the opencode CLI output.
 */

import type { StreamEvent } from './types.js';

/**
 * Callback type for parsed stream events.
 */
export type StreamEventCallback = (event: StreamEvent) => void;

/**
 * Callback type for parse warnings (malformed JSON, etc.).
 */
export type StreamWarningCallback = (warning: string, rawLine: string) => void;

/**
 * Configuration options for the stream parser.
 */
export interface StreamParserOptions {
  /** Callback for successfully parsed events */
  onEvent: StreamEventCallback;
  /** Optional callback for parse warnings */
  onWarning?: StreamWarningCallback;
  /** Enable debug mode for additional logging */
  debug?: boolean;
}

/**
 * StreamParser class for parsing NDJSON streams.
 *
 * Handles:
 * - Newline-delimited JSON (NDJSON) format
 * - Buffering of partial lines for incomplete JSON
 * - Graceful handling of malformed JSON lines
 * - Event emission via callbacks
 *
 * @example
 * ```typescript
 * const parser = new StreamParser({
 *   onEvent: (event) => console.log('Received event:', event.type),
 *   onWarning: (warning) => console.warn('Parse warning:', warning),
 * });
 *
 * // Feed data chunks as they arrive
 * parser.write(chunk1);
 * parser.write(chunk2);
 *
 * // Flush any remaining buffered data when stream ends
 * parser.flush();
 * ```
 */
export class StreamParser {
  private buffer: string = '';
  private readonly onEvent: StreamEventCallback;
  private readonly onWarning: StreamWarningCallback | undefined;
  private readonly debug: boolean;

  constructor(options: StreamParserOptions) {
    this.onEvent = options.onEvent;
    this.onWarning = options.onWarning;
    this.debug = options.debug ?? false;
  }

  /**
   * Write a chunk of data to the parser.
   * The data may contain complete lines, partial lines, or multiple lines.
   *
   * @param chunk - The string data chunk to parse
   */
  write(chunk: string): void {
    // Append chunk to buffer
    this.buffer += chunk;

    // Process all complete lines (lines ending with \n)
    this.processBuffer();
  }

  /**
   * Flush any remaining data in the buffer.
   * Call this when the stream ends to process any final incomplete line.
   */
  flush(): void {
    if (this.buffer.trim().length > 0) {
      this.parseLine(this.buffer.trim());
    }
    this.buffer = '';
  }

  /**
   * Reset the parser state, clearing the buffer.
   */
  reset(): void {
    this.buffer = '';
  }

  /**
   * Get the current buffer contents (useful for debugging).
   */
  getBuffer(): string {
    return this.buffer;
  }

  /**
   * Process the buffer, extracting and parsing complete lines.
   */
  private processBuffer(): void {
    // Split buffer by newlines
    const lines = this.buffer.split('\n');

    // If there's only one element, we don't have a complete line yet
    if (lines.length === 1) {
      return;
    }

    // Process all complete lines (all but the last element)
    // The last element is either empty (if buffer ended with \n) or incomplete
    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i]?.trim();
      if (line && line.length > 0) {
        this.parseLine(line);
      }
    }

    // Keep the last element in the buffer (may be empty or incomplete line)
    this.buffer = lines[lines.length - 1] ?? '';
  }

  /**
   * Parse a single line as JSON and emit the event.
   *
   * @param line - A complete line to parse as JSON
   */
  private parseLine(line: string): void {
    // Skip empty lines
    if (!line || line.length === 0) {
      return;
    }

    try {
      const parsed: unknown = JSON.parse(line);

      // Validate that parsed result is an object with a 'type' field
      if (!this.isValidEvent(parsed)) {
        this.handleWarning('Parsed JSON is not a valid stream event (missing or invalid "type" field)', line);
        return;
      }

      // Emit the parsed event
      this.onEvent(parsed as StreamEvent);
    } catch (error) {
      // Handle JSON parse errors gracefully
      const errorMessage = error instanceof Error ? error.message : 'Unknown parse error';
      this.handleWarning(`JSON parse error: ${errorMessage}`, line);
    }
  }

  /**
   * Validate that a parsed value is a valid stream event.
   *
   * @param value - The parsed JSON value
   * @returns True if the value is a valid stream event
   */
  private isValidEvent(value: unknown): boolean {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const obj = value as Record<string, unknown>;
    return typeof obj['type'] === 'string' && obj['type'].length > 0;
  }

  /**
   * Handle a parse warning.
   *
   * @param warning - The warning message
   * @param rawLine - The raw line that caused the warning
   */
  private handleWarning(warning: string, rawLine: string): void {
    if (this.debug) {
      console.warn(`[StreamParser] ${warning}`);
      console.warn(`[StreamParser] Raw line: ${rawLine.substring(0, 100)}${rawLine.length > 100 ? '...' : ''}`);
    }

    if (this.onWarning) {
      this.onWarning(warning, rawLine);
    }
  }
}

/**
 * Create a stream parser with the given options.
 * This is a convenience function for creating a StreamParser instance.
 *
 * @param options - Parser configuration options
 * @returns A new StreamParser instance
 */
export function createStreamParser(options: StreamParserOptions): StreamParser {
  return new StreamParser(options);
}

/**
 * Parse a complete NDJSON string and return all events.
 * Useful for parsing log files or test data.
 *
 * @param data - Complete NDJSON string to parse
 * @param onWarning - Optional callback for parse warnings
 * @returns Array of parsed stream events
 */
export function parseNdjson(data: string, onWarning?: StreamWarningCallback): StreamEvent[] {
  const events: StreamEvent[] = [];

  const parser = new StreamParser({
    onEvent: (event) => events.push(event),
    onWarning,
  });

  parser.write(data);
  parser.flush();

  return events;
}
