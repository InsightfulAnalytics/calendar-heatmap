// A node:test reporter that prints one line per check: "pass <name>" or "fail <name>", with the
// failure's message indented under a fail line, and a count at the end. node --test itself sets a
// non-zero exit code when any check fails.
interface TestEventData {
  name: string;
  nesting: number;
  file?: string;
  details?: { type?: string; error?: { message?: string; cause?: unknown } };
}
interface TestEvent {
  type: string;
  data: TestEventData & { message?: string };
}

const describeError = (error: { message?: string; cause?: unknown } | undefined): string => {
  const cause = error?.cause as { message?: string } | undefined;
  return (cause?.message ?? error?.message ?? 'failed').trim();
};

export default async function* reporter(source: AsyncIterable<TestEvent>): AsyncGenerator<string> {
  let passed = 0;
  let failed = 0;
  for await (const event of source) {
    if (event.type !== 'test:pass' && event.type !== 'test:fail') continue;
    if (event.data.details?.type === 'suite') continue;
    if (event.type === 'test:pass') {
      passed += 1;
      yield `pass ${event.data.name}\n`;
    } else {
      failed += 1;
      const detail = describeError(event.data.details?.error).split('\n').map((l) => `     ${l}`).join('\n');
      yield `fail ${event.data.name}\n${detail}\n`;
    }
  }
  yield `\n${passed + failed} checks: ${passed} passed, ${failed} failed\n`;
}
