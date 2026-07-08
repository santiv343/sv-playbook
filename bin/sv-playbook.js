#!/usr/bin/env node
process.removeAllListeners('warning');
process.on('warning', (w) => { if (w.name !== 'ExperimentalWarning') console.error(w.stack ?? w.message); });

const { main } = await import('../dist/cli/main.js');

const code = await main(process.argv.slice(2));
process.exit(code);
