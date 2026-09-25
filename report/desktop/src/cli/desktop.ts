// Open, save or close Power BI Desktop on the Daily Sales PBIP, from any folder:
//
//   node src/cli/desktop.ts open            start Desktop with the canvas debugging port (9339)
//   node src/cli/desktop.ts open --plain    start it without a debugging port
//   node src/cli/desktop.ts save            save through the title bar Save button
//   node src/cli/desktop.ts close           close it, answering the save prompt with Don't save
//
// The debugging port is set in the Desktop process's own environment only, never for the user or
// the machine, and it listens on 127.0.0.1 only.
import { parseArgs } from 'node:util';
import { DEBUG_PORT, PBIP, closeDesktop, desktopInstances, launchDesktop, saveDesktop } from '../desktop.ts';

const { positionals, values } = parseArgs({ allowPositionals: true, options: { plain: { type: 'boolean' }, port: { type: 'string' } } });
const command = positionals[0];

const holding = () => {
  const mine = desktopInstances();
  if (mine.length !== 1) throw new Error(`expected one Desktop instance holding ${PBIP}, found ${mine.length}`);
  return mine[0];
};

if (command === 'open') {
  const port = values.plain ? null : Number(values.port ?? DEBUG_PORT);
  const i = await launchDesktop({ debugPort: port });
  console.log(`Desktop ${i.pid} holds ${i.currentFilePath}${port === null ? ' (no debugging port)' : `; DevTools on http://127.0.0.1:${port}`}`);
} else if (command === 'save') {
  const i = holding();
  await saveDesktop(i.pid);
  console.log(`saved; Desktop ${i.pid} has no unsaved changes`);
} else if (command === 'close') {
  const i = holding();
  console.log(await closeDesktop(i.pid));
} else {
  console.error('usage: node src/cli/desktop.ts open [--plain] [--port N] | save | close');
  process.exit(2);
}
