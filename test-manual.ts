/**
 * Manual test script for Ralph CLI
 * Run with: npx tsx test-manual.ts
 */

import { parseNdjson } from './src/stream-parser.js';
import { detectCompletion, CompletionDetector } from './src/completion-detection.js';
import { TaskDetector, detectTaskFromContent } from './src/task-detection.js';
import { validateRequiredFiles } from './src/validation.js';
import { checkGitStatus } from './src/git.js';
import { handleStreamEvent, createEventHandler } from './src/event-handlers.js';
import { formatElapsedTime, formatTokenCount } from './src/components/StatusBar.js';
import type { RunnerCallbacks, StreamEvent, OutputLine } from './src/types.js';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`✗ ${name}`);
    console.error(`  Error: ${error instanceof Error ? error.message : String(error)}`);
    failed++;
  }
}

function assertEqual<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(`${message || 'Assertion failed'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertTrue(value: boolean, message?: string) {
  if (!value) {
    throw new Error(message || 'Expected true');
  }
}

function assertFalse(value: boolean, message?: string) {
  if (value) {
    throw new Error(message || 'Expected false');
  }
}

async function runTests() {
console.log('\n=== Ralph CLI Manual Tests ===\n');

// Stream Parser Tests
console.log('--- Stream Parser ---');

await test('parseNdjson parses valid JSON', () => {
  const events = parseNdjson('{"type":"step_start"}\n{"type":"step_finish"}\n');
  assertEqual(events.length, 2, 'Should parse 2 events');
  assertEqual(events[0]?.type, 'step_start');
  assertEqual(events[1]?.type, 'step_finish');
});

await test('parseNdjson handles empty lines', () => {
  const events = parseNdjson('{"type":"step_start"}\n\n{"type":"step_finish"}\n');
  assertEqual(events.length, 2, 'Should ignore empty lines');
});

await test('parseNdjson skips malformed JSON', () => {
  const events = parseNdjson('{"type":"step_start"}\nnot json\n{"type":"step_finish"}\n');
  assertEqual(events.length, 2, 'Should skip invalid JSON');
});

// Completion Detection Tests
console.log('\n--- Completion Detection ---');

await test('detectCompletion finds COMPLETE marker', () => {
  const result = detectCompletion('Some text <promise>COMPLETE</promise> more text');
  assertTrue(result.isComplete);
});

await test('detectCompletion returns false for missing marker', () => {
  const result = detectCompletion('Some text without the marker');
  assertFalse(result.isComplete);
});

await test('CompletionDetector accumulates content', () => {
  const detector = new CompletionDetector();
  detector.processContent('<promise>COMP');
  assertFalse(detector.getIsComplete(), 'Should not be complete yet');
  detector.processContent('LETE</promise>');
  assertTrue(detector.getIsComplete(), 'Should detect completion after full marker');
});

await test('CompletionDetector.reset clears state', () => {
  const detector = new CompletionDetector();
  detector.setComplete();
  assertTrue(detector.getIsComplete());
  detector.reset();
  assertFalse(detector.getIsComplete());
});

// Task Detection Tests
console.log('\n--- Task Detection ---');

await test('detectTaskFromContent finds "Working on:" pattern', () => {
  const result = detectTaskFromContent('Working on: Implement feature X');
  assertTrue(result.detected, 'Should detect task');
  assertEqual(result.task, 'Implement feature X');
  assertEqual(result.pattern, 'working-on');
});

await test('detectTaskFromContent finds "Found next task:" pattern', () => {
  const result = detectTaskFromContent('Found next task: Task 1.1');
  assertTrue(result.detected, 'Should detect task');
  assertEqual(result.task, 'Task 1.1');
});

await test('detectTaskFromContent finds task headings', () => {
  const result = detectTaskFromContent('### Task 2.3: File Validation');
  assertTrue(result.detected, 'Should detect task');
  assertEqual(result.task, 'File Validation');
  assertEqual(result.pattern, 'task-heading');
});

await test('detectTaskFromContent returns null for no match', () => {
  const result = detectTaskFromContent('Random text without tasks');
  assertFalse(result.detected, 'Should not detect task');
  assertEqual(result.task, null);
});

await test('TaskDetector only notifies on task change', () => {
  const tasks: string[] = [];
  const callbacks: Partial<RunnerCallbacks> = {
    onTaskChange: (task: string) => tasks.push(task),
  };
  const detector = new TaskDetector({ callbacks: callbacks as RunnerCallbacks });
  detector.processContent('Working on: Task A');
  detector.processContent('More about Task A');
  assertEqual(tasks.length, 1, 'Should only notify once');
  assertEqual(tasks[0], 'Task A');
});

// Event Handlers Tests
console.log('\n--- Event Handlers ---');

await test('handleStreamEvent processes step_start', () => {
  const outputs: OutputLine[] = [];
  const callbacks: Partial<RunnerCallbacks> = {
    onOutput: (line: OutputLine) => outputs.push(line),
    onTokensUpdate: () => {},
  };
  const event: StreamEvent = { type: 'step_start' };
  handleStreamEvent(event, { callbacks: callbacks as RunnerCallbacks });
  assertTrue(outputs.length > 0, 'Should produce output');
  assertEqual(outputs[0]?.type, 'info');
});

await test('handleStreamEvent processes step_finish with tokens', () => {
  let tokens = { input: 0, output: 0 };
  const callbacks: Partial<RunnerCallbacks> = {
    onOutput: () => {},
    onTokensUpdate: (t) => { tokens = t; },
  };
  const event: StreamEvent = {
    type: 'step_finish',
    part: { tokens: { input: 100, output: 50 } },
  };
  handleStreamEvent(event, { callbacks: callbacks as RunnerCallbacks });
  assertEqual(tokens.input, 100);
  assertEqual(tokens.output, 50);
});

await test('handleStreamEvent processes tool.execute.before', () => {
  const outputs: OutputLine[] = [];
  const callbacks: Partial<RunnerCallbacks> = {
    onOutput: (line: OutputLine) => outputs.push(line),
    onTokensUpdate: () => {},
  };
  const event: StreamEvent = { type: 'tool.execute.before', tool: { name: 'ReadFile' } };
  handleStreamEvent(event, { callbacks: callbacks as RunnerCallbacks });
  assertTrue(outputs.length > 0);
  assertEqual(outputs[0]?.type, 'tool');
  assertTrue(outputs[0]?.content.includes('ReadFile') ?? false);
});

// StatusBar formatters
console.log('\n--- StatusBar Formatters ---');

await test('formatElapsedTime formats seconds correctly', () => {
  assertEqual(formatElapsedTime(0), '00:00:00');
  assertEqual(formatElapsedTime(61), '00:01:01');
  assertEqual(formatElapsedTime(3661), '01:01:01');
});

await test('formatTokenCount formats with commas', () => {
  assertEqual(formatTokenCount(0), '0');
  assertEqual(formatTokenCount(1000), '1,000');
  assertEqual(formatTokenCount(1234567), '1,234,567');
});

// File Validation Tests
console.log('\n--- File Validation ---');

await test('validateRequiredFiles validates existing files', async () => {
  // Running from the ralph-cli directory which has all required files
  const result = await validateRequiredFiles(process.cwd());
  assertTrue(result.valid, 'Should be valid when all files exist');
  assertEqual(result.missingFiles.length, 0);
});

// Git Status Tests
console.log('\n--- Git Status ---');

await test('checkGitStatus detects git repo', async () => {
  const result = await checkGitStatus(process.cwd());
  assertTrue(result.isGitRepo, 'Should detect git repo');
});

await test('checkGitStatus handles non-git directory', async () => {
  const result = await checkGitStatus('/tmp');
  assertFalse(result.isGitRepo, 'Should detect non-git directory');
});

// Edge Case Tests
console.log('\n--- Edge Cases ---');

await test('parseNdjson handles various malformed JSON gracefully', () => {
  // Test various types of malformed JSON
  const testCases = [
    '{"type":"valid"}\n{invalid json}\n{"type":"also_valid"}\n',
    '{"type":"valid"}\n\n\n\n{"type":"also_valid"}\n',
    '{"type":"valid"}\nrandom garbage text\n{"type":"also_valid"}\n',
    '{"type":"valid"}\n{"missing": "type field"}\n{"type":"also_valid"}\n',
  ];
  
  for (const testCase of testCases) {
    const warnings: string[] = [];
    const events = parseNdjson(testCase, (warning) => warnings.push(warning));
    assertTrue(events.length >= 1, 'Should still parse valid events');
    // Just verify it doesn't crash - malformed lines are skipped
  }
});

await test('parseNdjson handles extremely long lines', () => {
  // Create a very long valid JSON line
  const longContent = 'x'.repeat(10000);
  const longJson = `{"type":"message.part.updated","part":{"delta":"${longContent}"}}\n`;
  const events = parseNdjson(longJson);
  assertEqual(events.length, 1, 'Should parse long JSON line');
  assertEqual(events[0]?.type, 'message.part.updated');
});

await test('parseNdjson handles rapid sequential events', () => {
  // Simulate rapid output - many events in sequence
  const rapidEvents = Array.from({ length: 100 }, (_, i) => 
    `{"type":"message.part.updated","part":{"delta":"chunk ${i}"}}`
  ).join('\n') + '\n';
  
  const events = parseNdjson(rapidEvents);
  assertEqual(events.length, 100, 'Should parse all rapid events');
});

await test('StreamParser handles partial chunks across writes', async () => {
  const { StreamParser } = await import('./src/stream-parser.js');
  const events: StreamEvent[] = [];
  
  const parser = new StreamParser({
    onEvent: (event) => events.push(event),
  });
  
  // Split a JSON object across multiple writes
  parser.write('{"type":"step');
  assertEqual(events.length, 0, 'Should not emit incomplete JSON');
  
  parser.write('_start","step":{"name":"test"}}');
  assertEqual(events.length, 0, 'Still incomplete without newline');
  
  parser.write('\n');
  assertEqual(events.length, 1, 'Should emit after newline');
  assertEqual(events[0]?.type, 'step_start');
});

// Summary
console.log('\n=== Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed + failed}\n`);

if (failed > 0) {
  process.exit(1);
}
}

// Run all tests
runTests().catch((error) => {
  console.error('Test runner failed:', error);
  process.exit(1);
});
