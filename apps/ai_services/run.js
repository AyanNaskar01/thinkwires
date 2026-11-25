const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const isWin = process.platform === 'win32';
const venvPy = isWin
  ? path.join(__dirname, 'venv', 'Scripts', 'python.exe')
  : fs.existsSync(path.join(__dirname, 'venv', 'bin', 'python'))
    ? path.join(__dirname, 'venv', 'bin', 'python')
    : path.join(__dirname, 'venv', 'bin', 'python3');

function isWorkingPython(binPath) {
  if (!binPath) return false;
  try {
    const res = spawnSync(binPath, ['--version'], { encoding: 'utf8', shell: !path.isAbsolute(binPath) && isWin });
    return !res.error && res.status === 0;
  } catch {
    return false;
  }
}

function resolvePythonExe() {
  if (fs.existsSync(venvPy) && isWorkingPython(venvPy)) {
    return venvPy;
  }

  const localAppData = process.env.LOCALAPPDATA || '';
  const standardWinPaths = isWin
    ? [
        path.join(localAppData, 'Programs', 'Python', 'Python312', 'python.exe'),
        path.join(localAppData, 'Programs', 'Python', 'Python311', 'python.exe'),
        path.join(localAppData, 'Programs', 'Python', 'Python310', 'python.exe'),
        'C:\\Python312\\python.exe',
        'C:\\Python311\\python.exe',
        'C:\\Python310\\python.exe',
      ].filter(fs.existsSync)
    : [];

  const candidates = isWin
    ? [...standardWinPaths, 'python', 'py']
    : ['python3', 'python'];

  for (const c of candidates) {
    if (isWorkingPython(c)) return c;
  }

  return isWin ? 'python' : 'python3';
}

const pythonExe = resolvePythonExe();

const isDev = process.argv.includes('--dev');
const args = [
  '-m',
  'uvicorn',
  'main:app',
  '--host',
  '0.0.0.0',
  '--port',
  '8000',
];
if (isDev) {
  args.splice(3, 0, '--reload');
}

// Ensure execution directory is apps/ai_services and avoid shell: true to prevent space-splitting
const child = spawn(pythonExe, args, { stdio: 'inherit', cwd: __dirname });

child.on('error', (err) => {
  console.error(
    `\n❌ [ai_services] Failed to start Python runtime with '${pythonExe}': ${err.message}`
  );
  console.error('Please verify that Python 3 and requirements are set up:');
  console.error(
    '  Windows:       python -m venv venv && .\\venv\\Scripts\\pip install -r requirements.txt'
  );
  console.error(
    '  Linux/macOS:   python3 -m venv venv && ./venv/bin/pip install -r requirements.txt'
  );
  console.error('  Or monorepo:   npm run setup:ai\n');
  process.exit(1);
});

child.on('exit', (code) => process.exit(code || 0));
