// The container-name scan: Deneb's container size names may appear only in the top-level width
// and height, because Deneb 2.0 rewrites them textually and the library checker rejects them
// anywhere else.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { containerScan } from '../src/index.ts';

test('the container-name scan passes on the prototype', () => {
  assert.deepEqual(containerScan('prototype'), { ok: true, findings: [] });
});

test('the container-name scan passes on the valid test strip', () => {
  assert.equal(containerScan('test/specs/strip.json').ok, true);
});

test('the container-name scan fails on a test spec that names a container size inside a label', () => {
  const scan = containerScan('test/specs/container-name-in-label.json');
  assert.equal(scan.ok, false);
  assert.deepEqual(scan.findings, [{ path: 'marks[1].encode.update.text.signal', name: 'pbiContainerWidth' }]);
});
