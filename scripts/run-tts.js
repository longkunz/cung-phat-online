#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const isDev = process.argv.includes('--dev') || process.argv.includes('--reload');
const isWindows = process.platform === 'win32';

function resolvePython() {
  const venvPy = path.join(__dirname, '..', '.venv', isWindows ? 'Scripts' : 'bin', isWindows ? 'python.exe' : 'python');
  if (fs.existsSync(venvPy)) return venvPy;
  return isWindows ? 'python' : 'python3';
}

const pythonBin = resolvePython();
const port = process.env.PORT || process.env.TTS_PORT || '8008';
const args = ['-m', 'uvicorn', 'services.tts.main:app', '--host', '0.0.0.0', '--port', port];
if (isDev) args.push('--reload');

console.log(`[TTS Service] Khởi chạy với ${pythonBin} tại cổng ${port}...`);
const proc = spawn(pythonBin, args, {
  cwd: path.join(__dirname, '..'),
  env: { ...process.env, PYTHONUNBUFFERED: '1' },
  stdio: 'inherit'
});

process.on('SIGINT', () => { proc.kill(); process.exit(0); });
process.on('SIGTERM', () => { proc.kill(); process.exit(0); });
proc.on('exit', (code) => process.exit(code || 0));
