/**
 * Ralph CLI - Task Detection
 *
 * Parses output from the opencode CLI to detect the current task being worked on.
 * Looks for patterns like "Found next task:", "Working on:", and markdown headings.
 */

import type { RunnerCallbacks } from './types.js';

/**
 * Result from task detection.
 */
export interface TaskDetectionResult {
  /** Whether a task was detected */
  detected: boolean;
  /** The detected task name/description */
  task: string | null;
  /** The pattern that matched */
  pattern?: string;
}

/**
 * Patterns to look for when detecting the current task.
 * Each pattern is a regex with a capture group for the task name.
 */
const TASK_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  // Explicit task indicators
  {
    pattern: /Found next task:\s*(.+?)(?:\n|$)/i,
    name: 'found-next-task',
  },
  {
    pattern: /Working on:\s*(.+?)(?:\n|$)/i,
    name: 'working-on',
  },
  {
    pattern: /Current task:\s*(.+?)(?:\n|$)/i,
    name: 'current-task',
  },
  {
    pattern: /Starting task:\s*(.+?)(?:\n|$)/i,
    name: 'starting-task',
  },
  {
    pattern: /Next task:\s*(.+?)(?:\n|$)/i,
    name: 'next-task',
  },
  // Task heading patterns (from plan.md format)
  {
    pattern: /###\s*Task\s+\d+\.\d+[:\s]+(.+?)(?:\n|$)/i,
    name: 'task-heading',
  },
  {
    pattern: /Task\s+\d+\.\d+[:\s]+(.+?)(?:\n|$)/i,
    name: 'task-numbered',
  },
  // Generic "picking" or "selecting" task patterns
  {
    pattern: /(?:Pick|Select|Chose|Choosing|Picking|Selecting)(?:ing)?\s+(?:the\s+)?(?:next\s+)?task[:\s]+(.+?)(?:\n|$)/i,
    name: 'picking-task',
  },
  // Implementing patterns
  {
    pattern: /(?:I'll|I will|Let me|Going to|Now)\s+(?:implement|work on|tackle|start with|begin with)[:\s]+(.+?)(?:\n|$)/i,
    name: 'implementing',
  },
];

/**
 * Detect a task from a line of output.
 * Returns the first matching task if found.
 *
 * @param content - The content to scan for task patterns
 * @returns Detection result with task if found
 */
export function detectTaskFromContent(content: string): TaskDetectionResult {
  if (!content || typeof content !== 'string') {
    return { detected: false, task: null };
  }

  for (const { pattern, name } of TASK_PATTERNS) {
    const match = content.match(pattern);
    if (match && match[1]) {
      const task = cleanTaskName(match[1]);
      if (task) {
        return {
          detected: true,
          task,
          pattern: name,
        };
      }
    }
  }

  return { detected: false, task: null };
}

/**
 * Clean up a detected task name.
 * Removes extra whitespace, markdown formatting, and trailing punctuation.
 *
 * @param rawTask - The raw task string from regex match
 * @returns Cleaned task name
 */
function cleanTaskName(rawTask: string): string {
  let task = rawTask.trim();

  // Remove markdown formatting (bold, italic, code)
  task = task.replace(/\*\*/g, '');
  task = task.replace(/\*/g, '');
  task = task.replace(/`/g, '');

  // Remove leading/trailing punctuation (but keep inner punctuation)
  task = task.replace(/^[:\-\s]+/, '');
  task = task.replace(/[:\-\s]+$/, '');

  // Remove markdown checkbox markers
  task = task.replace(/^\[[ x]\]\s*/i, '');

  // Collapse multiple spaces
  task = task.replace(/\s+/g, ' ');

  // Truncate very long task names (keep first 100 chars)
  if (task.length > 100) {
    task = task.substring(0, 97) + '...';
  }

  return task.trim();
}

/**
 * Task detector class that maintains state and notifies on task changes.
 * Useful for accumulating content across multiple message parts.
 */
export class TaskDetector {
  private currentTask: string | null = null;
  private callbacks: RunnerCallbacks | null = null;
  private debug: boolean;
  private contentBuffer: string = '';

  constructor(options: { callbacks?: RunnerCallbacks; debug?: boolean } = {}) {
    this.callbacks = options.callbacks ?? null;
    this.debug = options.debug ?? false;
  }

  /**
   * Set callbacks for task detection notifications.
   */
  setCallbacks(callbacks: RunnerCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Get the current detected task.
   */
  getCurrentTask(): string | null {
    return this.currentTask;
  }

  /**
   * Process content and detect tasks.
   * Accumulates content to handle tasks that span multiple message parts.
   *
   * @param content - New content to process
   * @returns Detection result
   */
  processContent(content: string): TaskDetectionResult {
    if (!content) {
      return { detected: false, task: null };
    }

    // Add to buffer (keep last 500 chars to handle multi-part messages)
    this.contentBuffer += content;
    if (this.contentBuffer.length > 500) {
      this.contentBuffer = this.contentBuffer.slice(-500);
    }

    // Try to detect task from the full buffer
    const result = detectTaskFromContent(this.contentBuffer);

    if (result.detected && result.task && result.task !== this.currentTask) {
      this.currentTask = result.task;

      if (this.debug) {
        console.log(`[TaskDetector] Detected task: "${result.task}" (pattern: ${result.pattern})`);
      }

      // Notify via callback if available
      if (this.callbacks) {
        this.callbacks.onTaskChange(result.task);
      }

      // Clear buffer after successful detection to avoid re-detecting same task
      this.contentBuffer = '';

      return result;
    }

    return { detected: false, task: null };
  }

  /**
   * Reset the detector state.
   * Call this when starting a new iteration.
   */
  reset(): void {
    this.currentTask = null;
    this.contentBuffer = '';
  }

  /**
   * Force set the current task.
   * Useful for setting task from external sources.
   */
  setTask(task: string): void {
    if (task && task !== this.currentTask) {
      this.currentTask = task;
      if (this.callbacks) {
        this.callbacks.onTaskChange(task);
      }
    }
  }
}

/**
 * Create a task detector with the given options.
 *
 * @param options - Detector options
 * @returns A new TaskDetector instance
 */
export function createTaskDetector(
  options: { callbacks?: RunnerCallbacks; debug?: boolean } = {}
): TaskDetector {
  return new TaskDetector(options);
}
