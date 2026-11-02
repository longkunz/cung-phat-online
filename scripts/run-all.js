#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const isDev = process.argv.includes('--dev') || process.argv.includes('--watch');
const isWindows = process.platform === 'win32';

// 1. Resolve Python binary
function resolvePython() {
  const venvPy = path.join(__dirname, '..', '.venv', isWindows ? 'Scripts' : 'bin', isWindows ? 'python.exe' : 'python');
  if (fs.existsSync(venvPy)) return venvPy;
  return isWindows ? 'python' : 'python3';
}

// 2. Resolve Gateway runner (bun or node)
function resolveGatewayCmd() {
  return 'bun';
}

const pythonBin = resolvePython();
const gatewayRunner = resolveGatewayCmd();

console.log('============================================================');
console.log('🪷 KHỞI ĐỘNG HỆ THỐNG CHÙA ONLINE (GATEWAY + TTS SERVICE)');
console.log(`[TTS Service]  Python: ${pythonBin}`);
console.log(`[Live Gateway] Runner: ${gatewayRunner} (Mode: ${isDev ? 'dev/watch' : 'production'})`);
console.log('============================================================\n');

// Prefix log helper
function pipeLogs(proc, prefix, colorCode = '\x1b[36m') {
  const reset = '\x1b[0m';
  proc.stdout.on('data', (data) => {
    const lines = data.toString().split(/\r?\n/);
    for (const line of lines) {
      if (line.trim()) console.log(`${colorCode}${prefix}${reset} ${line}`);
    }
  });
  proc.stderr.on('data', (data) => {
    const lines = data.toString().split(/\r?\n/);
    for (const line of lines) {
      if (line.trim()) console.error(`${colorCode}${prefix}${reset} ${line}`);
    }
  });
}

// Spawn TTS Service
const ttsArgs = ['-m', 'uvicorn', 'services.tts.main:app', '--host', '0.0.0.0', '--port', process.env.TTS_PORT || '8008'];
if (isDev) ttsArgs.push('--reload');

const ttsProc = spawn(pythonBin, ttsArgs, {
  cwd: path.join(__dirname, '..'),
  env: { ...process.env, PYTHONUNBUFFERED: '1' }
});
pipeLogs(ttsProc, '[TTS]', '\x1b[35m');

// Spawn Gateway
const gatewayArgs = isDev ? ['--watch', 'server.js'] : ['run', 'server.js'];
const gatewayProc = spawn(gatewayRunner, gatewayArgs, {
  cwd: path.join(__dirname, '..'),
  env: { ...process.env, TTS_SERVICE_URL: process.env.TTS_SERVICE_URL || 'http://localhost:8008' }
});
pipeLogs(gatewayProc, '[Gateway]', '\x1b[36m');

// Graceful shutdown
function shutdown() {
  console.log('\n[System] Đang dừng Gateway và TTS Service...');
  try { gatewayProc.kill(); } catch (_) {}
  try { ttsProc.kill(); } catch (_) {}
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

ttsProc.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.warn(`[TTS] Dịch vụ dừng với mã: ${code}. Live Gateway vẫn hoạt động (soft dependency).`);
  }
});

gatewayProc.on('exit', (code) => {
  console.log(`[Gateway] Live Gateway thoát (${code}).`);
  shutdown();
});
