/**
 * Ralph CLI - Completion Detection
 *
 * Parses output from the opencode CLI to detect the <promise>COMPLETE</promise> marker
 * that indicates all tasks have been completed.
 */

import type { RunnerCallbacks } from './types.js';

/**
 * The completion marker that the agent outputs when all tasks are done.
 */
export const COMPLETION_MARKER = '<promise>COMPLETE</promise>';

/**
 * Result from completion detection.
 */
export interface CompletionDetectionResult {
  /** Whether the completion marker was detected */
  isComplete: boolean;
}

/**
 * Detect the completion marker in content.
 *
 * @param content - The content to scan for the completion marker
 * @returns Detection result indicating if completion was found
 */
export function detectCompletion(content: string): CompletionDetectionResult {
  if (!content || typeof content !== 'string') {
    return { isComplete: false };
  }

  // Check for the exact completion marker
  const isComplete = content.includes(COMPLETION_MARKER);

  return { isComplete };
}

/**
 * Completion detector class that maintains state and notifies on completion.
 * Accumulates content across multiple message parts to handle the case where
 * the completion marker spans multiple chunks.
 */
export class CompletionDetector {
  private isComplete: boolean = false;
  private callbacks: RunnerCallbacks | null = null;
  private debug: boolean;
  private contentBuffer: string = '';

  constructor(options: { callbacks?: RunnerCallbacks; debug?: boolean } = {}) {
    this.callbacks = options.callbacks ?? null;
    this.debug = options.debug ?? false;
  }

  /**
   * Set callbacks for completion notifications.
   */
  setCallbacks(callbacks: RunnerCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Check if completion has been detected.
   */
  getIsComplete(): boolean {
    return this.isComplete;
  }

  /**
   * Process content and check for completion.
   * Accumulates content to handle the marker spanning multiple message parts.
   *
   * @param content - New content to process
   * @returns Detection result
   */
  processContent(content: string): CompletionDetectionResult {
    if (!content) {
      return { isComplete: false };
    }

    // If already complete, no need to process further
    if (this.isComplete) {
      return { isComplete: true };
    }

    // Add to buffer (keep last 100 chars - enough for the marker)
    this.contentBuffer += content;
    if (this.contentBuffer.length > 100) {
      this.contentBuffer = this.contentBuffer.slice(-100);
    }

    // Check for completion in the buffer
    const result = detectCompletion(this.contentBuffer);

    if (result.isComplete) {
      this.isComplete = true;

      if (this.debug) {
        console.log('[CompletionDetector] Detected completion marker: <promise>COMPLETE</promise>');
      }

      // Notify via callback if available
      if (this.callbacks) {
        this.callbacks.onStatusChange('complete');
      }

      return { isComplete: true };
    }

    return { isComplete: false };
  }

  /**
   * Reset the detector state.
   * Call this when starting a new iteration.
   */
  reset(): void {
    this.isComplete = false;
    this.contentBuffer = '';
  }

  /**
   * Force set completion status.
   * Useful for testing or external status updates.
   */
  setComplete(): void {
    if (!this.isComplete) {
      this.isComplete = true;
      if (this.callbacks) {
        this.callbacks.onStatusChange('complete');
      }
    }
  }
}

/**
 * Create a completion detector with the given options.
 *
 * @param options - Detector options
 * @returns A new CompletionDetector instance
 */
export function createCompletionDetector(
  options: { callbacks?: RunnerCallbacks; debug?: boolean } = {}
): CompletionDetector {
  return new CompletionDetector(options);
}
