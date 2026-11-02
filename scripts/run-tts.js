#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');
const { resolvePython, killProcTree } = require('./run-all');

const isDev = process.argv.includes('--dev') || process.argv.includes('--reload');
const isWindows = process.platform === 'win32';

const pythonBin = resolvePython();
const port = process.env.PORT || process.env.TTS_PORT || '8008';
const args = ['-m', 'uvicorn', 'services.tts.main:app', '--host', '0.0.0.0', '--port', port];
if (isDev) args.push('--reload');

console.log(`[TTS Service] Khởi chạy với ${pythonBin} tại cổng ${port}...`);
const proc = spawn(pythonBin, args, {
  cwd: path.join(__dirname, '..'),
  env: { ...process.env, PYTHONUNBUFFERED: '1' },
  stdio: 'inherit',
  shell: isWindows
});

let isShuttingDown = false;
function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  killProcTree(proc);
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
proc.on('exit', (code) => process.exit(code || 0));

module.exports = { proc, shutdown };
