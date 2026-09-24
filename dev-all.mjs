// Runs the Vite dev server and the coach API together.
// Uses only node builtins so it needs no extra dependency and works on Windows.
import {spawn} from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const kids = ['dev', 'dev:server'].map((script) =>
  spawn(npm, ['run', script], {stdio: 'inherit', shell: process.platform === 'win32'}),
);

const stop = () => kids.forEach((k) => k.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
kids.forEach((k) => k.on('exit', (code) => { stop(); process.exit(code ?? 0); }));
