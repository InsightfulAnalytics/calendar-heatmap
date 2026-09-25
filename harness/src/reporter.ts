// A node:test reporter that prints one line per check: "pass <name>" or "fail <name>", with the
// failure's message indented under a fail line, and a count at the end. node --test itself sets a
// non-zero exit code when any check fails. When a whole test file fails (it cannot load, or a
// before hook throws), its stderr is printed under its fail line.
interface TestEventData {
  name: string;
  file?: string;
  message?: string;
  details?: { type?: string; error?: { message?: string; cause?: unknown } };
}
interface TestEvent {
  type: string;
  data: TestEventData;
}

const indent = (text: string) => text.trim().split('\n').map((l) => `     ${l}`).join('\n');

const describeError = (error: { message?: string; cause?: unknown } | undefined): string => {
  const cause = error?.cause as { message?: string } | string | undefined;
  if (typeof cause === 'string') return cause;
  return (cause?.message ?? error?.message ?? 'failed').trim();
};

export default async function* reporter(source: AsyncIterable<TestEvent>): AsyncGenerator<string> {
  let passed = 0;
  let failed = 0;
  const stderr = new Map<string, string[]>();
  for await (const event of source) {
    if (event.type === 'test:stderr') {
      const file = event.data.file ?? '';
      stderr.set(file, [...(stderr.get(file) ?? []), event.data.message ?? '']);
      continue;
    }
    if (event.type !== 'test:pass' && event.type !== 'test:fail') continue;
    if (event.data.details?.type === 'suite') continue;
    if (event.type === 'test:pass') {
      passed += 1;
      yield `pass ${event.data.name}\n`;
      continue;
    }
    failed += 1;
    let detail = describeError(event.data.details?.error);
    // stderr events name the file relative to the working directory; test events name it absolute.
    const file = event.data.file ?? '';
    const key = [...stderr.keys()].find((k) => k && file.endsWith(k));
    if (key) {
      detail += `\n${(stderr.get(key) ?? []).join('')}`;
      stderr.delete(key);
    }
    yield `fail ${event.data.name}\n${indent(detail)}\n`;
  }
  yield `\n${passed + failed} checks: ${passed} passed, ${failed} failed\n`;
}
