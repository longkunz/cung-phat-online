#!/usr/bin/env node
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const isWindows = process.platform === 'win32';

// 1. Resolve Python binary (.exe on Windows to allow direct process invocation without shell splitting)
function resolvePython() {
  if (process.env.PYTHON) return process.env.PYTHON;

  const candidateDirs = [
    path.join(__dirname, '..', '.venv'),
    path.join(process.cwd(), '.venv')
  ];

  for (const venvDir of candidateDirs) {
    const venvPy = path.join(venvDir, isWindows ? 'Scripts' : 'bin', isWindows ? 'python.exe' : 'python');
    if (fs.existsSync(venvPy)) return venvPy;
  }

  return isWindows ? 'python.exe' : 'python3';
}

// 2. Resolve Gateway runner (bun or node)
function resolveGatewayCmd() {
  if (process.env.GATEWAY_RUNNER) return process.env.GATEWAY_RUNNER;

  try {
    const res = spawnSync(isWindows ? 'bun.exe' : 'bun', ['--version'], { stdio: 'ignore', shell: false });
    if (res.status === 0) return 'bun';
  } catch (_) {
    try {
      const res = spawnSync('bun', ['--version'], { stdio: 'ignore', shell: false });
      if (res.status === 0) return 'bun';
    } catch (_) {}
  }

  return 'node';
}

// 3. Build arguments for Gateway
function buildGatewayArgs(runner, isDev) {
  if (runner === 'bun') {
    return isDev ? ['--watch', 'server.js'] : ['run', 'server.js'];
  }
  return isDev ? ['--watch', 'server.js'] : ['server.js'];
}

// 4. Chunk-safe line prefixer
function createLogLinePrefixer(prefix, colorCode = '\x1b[36m', outFn = console.log) {
  const reset = '\x1b[0m';
  let buffer = '';

  function processText(text) {
    buffer += text;
    const parts = buffer.split(/\r?\n/);
    buffer = parts.pop() || '';
    for (const line of parts) {
      if (line.trim().length > 0) {
        outFn(`${colorCode}${prefix}${reset} ${line}`);
      }
    }
  }

  return {
    feed(data) {
      processText(typeof data === 'string' ? data : data.toString());
    },
    flush() {
      if (buffer.trim().length > 0) {
        outFn(`${colorCode}${prefix}${reset} ${buffer}`);
        buffer = '';
      }
    }
  };
}

// 5. Pipe logs using line prefixer
function pipeLogs(proc, prefix, colorCode = '\x1b[36m') {
  const outPrefixer = createLogLinePrefixer(prefix, colorCode, console.log);
  const errPrefixer = createLogLinePrefixer(prefix, colorCode, console.error);

  proc.stdout?.on('data', (data) => outPrefixer.feed(data));
  proc.stderr?.on('data', (data) => errPrefixer.feed(data));

  proc.on('close', () => {
    outPrefixer.flush();
    errPrefixer.flush();
  });
}

// 6. Kill process tree safely across platforms
function killProcTree(proc) {
  if (!proc || !proc.pid) return;
  try {
    if (isWindows) {
      spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore', shell: false });
    } else {
      proc.kill('SIGTERM');
    }
  } catch (_) {}
}

function startServices(options = {}) {
  const isDev = options.dev !== undefined ? options.dev : (process.argv.includes('--dev') || process.argv.includes('--watch'));
  const pythonBin = resolvePython();
  const gatewayRunner = resolveGatewayCmd();

  console.log('============================================================');
  console.log('🪷 KHỞI ĐỘNG HỆ THỐNG CHÙA ONLINE (GATEWAY + TTS SERVICE)');
  console.log(`[TTS Service]  Python: ${pythonBin}`);
  console.log(`[Live Gateway] Runner: ${gatewayRunner} (Mode: ${isDev ? 'dev/watch' : 'production'})`);
  console.log('============================================================\n');

  // Spawn TTS Service directly without shell to avoid splitting paths containing spaces on Windows
  const ttsPort = process.env.TTS_PORT || '8008';
  const ttsArgs = ['-m', 'uvicorn', 'services.tts.main:app', '--host', '0.0.0.0', '--port', ttsPort];
  if (isDev) ttsArgs.push('--reload');

  const ttsProc = spawn(pythonBin, ttsArgs, {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
    shell: false
  });
  pipeLogs(ttsProc, '[TTS]', '\x1b[35m');

  // Spawn Gateway directly without shell
  const gatewayArgs = buildGatewayArgs(gatewayRunner, isDev);
  const gatewayProc = spawn(gatewayRunner, gatewayArgs, {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, TTS_SERVICE_URL: process.env.TTS_SERVICE_URL || `http://localhost:${ttsPort}` },
    shell: false
  });
  pipeLogs(gatewayProc, '[Gateway]', '\x1b[36m');

  // Graceful shutdown
  let isShuttingDown = false;
  function shutdown() {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log('\n[System] Đang dừng Gateway và TTS Service...');
    killProcTree(gatewayProc);
    killProcTree(ttsProc);
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  ttsProc.on('exit', (code) => {
    if (code !== 0 && code !== null && !isShuttingDown) {
      console.warn(`[TTS] Dịch vụ dừng với mã: ${code}. Live Gateway vẫn hoạt động (soft dependency).`);
    }
  });

  gatewayProc.on('exit', (code) => {
    if (!isShuttingDown) {
      console.log(`[Gateway] Live Gateway thoát (${code}).`);
      shutdown();
    }
  });

  return { ttsProc, gatewayProc, shutdown };
}

if (require.main === module) {
  startServices();
}

module.exports = {
  resolvePython,
  resolveGatewayCmd,
  buildGatewayArgs,
  createLogLinePrefixer,
  pipeLogs,
  killProcTree,
  startServices
};
