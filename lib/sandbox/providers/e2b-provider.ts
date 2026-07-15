import { Sandbox } from '@e2b/code-interpreter';
import { SandboxProvider, SandboxInfo, CommandResult } from '../types';
// SandboxProviderConfig available through parent class
import { appConfig } from '@/config/app.config';
import { waitForHttpReady } from '../readiness/http-readiness';
import { viteReactTemplate } from '../templates/vite-react';

type ManagedCommandHandle = {
  kill(): Promise<unknown>;
};

type E2BRunCodeResult = {
  logs: { stdout: string[]; stderr: string[] };
  error?: { name?: string; value?: string };
};

const MAX_CREATE_ATTEMPTS = 2;
const CREATE_RETRY_DELAY_MS = 50;
const MAX_TRANSIENT_OPERATION_ATTEMPTS = 2;
const TRANSIENT_OPERATION_RETRY_DELAY_MS = 50;

export function isTransientE2BProvisioningError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /fetch failed|econnreset|etimedout|eai_again|temporarily unavailable|service unavailable|\b5\d\d\b/i.test(message);
}

async function withTransientE2BRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_TRANSIENT_OPERATION_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientE2BProvisioningError(error) || attempt === MAX_TRANSIENT_OPERATION_ATTEMPTS) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, TRANSIENT_OPERATION_RETRY_DELAY_MS * attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export class E2BProvider extends SandboxProvider {
  private existingFiles: Set<string> = new Set();
  private viteCommand: ManagedCommandHandle | null = null;

  /**
   * Attempt to reconnect to an existing E2B sandbox
   */
  async reconnect(sandboxId: string): Promise<boolean> {
    try {
      const connected = await Sandbox.connect(sandboxId, {
        timeoutMs: this.config.e2b?.timeoutMs,
      });
      this.sandbox = connected;
      const info = await connected.getInfo();
      this.sandboxInfo = {
        sandboxId,
        url: `https://${connected.getHost(appConfig.e2b.vitePort)}`,
        provider: 'e2b',
        createdAt: new Date(info.startedAt),
      };
      return true;
    } catch (error) {
      console.error(`[E2BProvider] Failed to reconnect to sandbox ${sandboxId}:`, error);
      return false;
    }
  }

  async createSandbox(): Promise<SandboxInfo> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_CREATE_ATTEMPTS; attempt += 1) {
      try {
        return await this.createSandboxAttempt();
      } catch (error) {
        lastError = error;
        await this.cleanupFailedCreate();
        if (!isTransientE2BProvisioningError(error) || attempt === MAX_CREATE_ATTEMPTS) {
          console.error('[E2BProvider] Error creating sandbox:', error);
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, CREATE_RETRY_DELAY_MS * attempt));
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private async createSandboxAttempt(): Promise<SandboxInfo> {
    if (this.sandbox) await this.cleanupFailedCreate();
    this.existingFiles.clear();
    this.sandbox = await Sandbox.create({
      apiKey: this.config.e2b?.apiKey || process.env.E2B_API_KEY,
      timeoutMs: this.config.e2b?.timeoutMs || appConfig.e2b.timeoutMs,
      lifecycle: { onTimeout: 'pause', autoResume: true },
    });

    const sandboxId = (this.sandbox as any).sandboxId || Date.now().toString();
    const host = (this.sandbox as any).getHost(appConfig.e2b.vitePort);
    this.sandboxInfo = {
      sandboxId,
      url: `https://${host}`,
      provider: 'e2b',
      createdAt: new Date(),
    };
    if (typeof this.sandbox.setTimeout === 'function') {
      this.sandbox.setTimeout(appConfig.e2b.timeoutMs);
    }
    return this.sandboxInfo;
  }

  private async cleanupFailedCreate(): Promise<void> {
    if (this.viteCommand) {
      try { await this.viteCommand.kill(); } catch { /* best effort */ }
      this.viteCommand = null;
    }
    if (this.sandbox) {
      try { await this.sandbox.kill(); } catch { /* best effort */ }
      this.sandbox = null;
    }
    this.sandboxInfo = null;
    this.existingFiles.clear();
  }

  async runCommand(command: string): Promise<CommandResult> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    
    const result = await this.sandbox.commands.run(command, { cwd: '/home/user/app' });
    
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      success: result.exitCode === 0
    };
  }

  async writeFile(path: string, content: string): Promise<void> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    const fullPath = path.startsWith('/') ? path : `/home/user/app/${path}`;
    
    // Use the E2B filesystem API to write the file
    // Note: E2B SDK uses files.write() method
    if ((this.sandbox as any).files && typeof (this.sandbox as any).files.write === 'function') {
      // Use the files.write API if available
      await (this.sandbox as any).files.write(fullPath, Buffer.from(content));
    } else {
      // Fallback to Python code execution
      await this.sandbox.runCode(`
        import os

        # Ensure directory exists
        dir_path = os.path.dirname("${fullPath}")
        os.makedirs(dir_path, exist_ok=True)

        # Write file
        with open("${fullPath}", 'w') as f:
            f.write(${JSON.stringify(content)})
        print(f"✓ Written: ${fullPath}")
      `);
    }
    
    this.existingFiles.add(path);
  }

  async readFile(path: string): Promise<string> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    const fullPath = path.startsWith('/') ? path : `/home/user/app/${path}`;
    
    const result = await withTransientE2BRetry<E2BRunCodeResult>(() => this.sandbox!.runCode(`
      with open("${fullPath}", 'r') as f:
          content = f.read()
      print(content)
    `));

    if (result.error) {
      const errorName = result.error.name || 'ExecutionError';
      const errorValue = result.error.value || 'Unknown sandbox execution error';
      if (errorName === 'FileNotFoundError') {
        throw Object.assign(new Error(`ENOENT: ${errorName}: ${errorValue}`), { code: 'ENOENT' });
      }
      throw new Error(`Failed to read file: ${errorName}: ${errorValue}`);
    }
    
    return result.logs.stdout.join('\n');
  }

  async listFiles(directory: string = '/home/user/app'): Promise<string[]> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    const result = await this.sandbox.runCode(`
      import os
      import json

      def list_files(path):
          files = []
          for root, dirs, filenames in os.walk(path):
              # Skip node_modules and .git
              dirs[:] = [d for d in dirs if d not in ['node_modules', '.git', '.next', 'dist', 'build']]
              for filename in filenames:
                  rel_path = os.path.relpath(os.path.join(root, filename), path)
                  files.append(rel_path)
          return files

      files = list_files("${directory}")
      print(json.dumps(files))
    `);
    
    try {
      return JSON.parse(result.logs.stdout.join(''));
    } catch {
      return [];
    }
  }

  async installPackages(packages: string[]): Promise<CommandResult> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    const packageList = packages.join(' ');
    const flags = appConfig.packages.useLegacyPeerDeps ? '--legacy-peer-deps' : '';
    
    
    const result = await this.sandbox.runCode(`
      import subprocess
      import os

      os.chdir('/home/user/app')

      # Install packages
      result = subprocess.run(
          ['npm', 'install', ${flags ? `'${flags}',` : ''} ${packages.map(p => `'${p}'`).join(', ')}],
          capture_output=True,
          text=True
      )

      print("STDOUT:")
      print(result.stdout)
      if result.stderr:
          print("\\nSTDERR:")
          print(result.stderr)
      print(f"\\nReturn code: {result.returncode}")
    `);
    
    const output = result.logs.stdout.join('\n');
    const stderr = result.logs.stderr.join('\n');
    
    // Restart Vite if configured
    if (appConfig.packages.autoRestartVite && !result.error) {
      await this.restartViteServer();
    }
    
    return {
      stdout: output,
      stderr,
      exitCode: result.error ? 1 : 0,
      success: !result.error
    };
  }

  async setupViteApp(): Promise<void> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    
    const templatePackageJson = JSON.stringify(viteReactTemplate.packageJson);

    // Write all files in a single Python script
    const setupScript = `
import os
import json

print('Setting up React app with Vite and Tailwind...')

# Create directory structure
os.makedirs('/home/user/app/src', exist_ok=True)
os.makedirs('/home/user/app/public', exist_ok=True)

# Package.json
package_json = ${templatePackageJson}

with open('/home/user/app/package.json', 'w') as f:
    json.dump(package_json, f, indent=2)
print('✓ package.json')

# Vite config
vite_config = """import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    hmr: false,
    allowedHosts: ['.e2b.app', '.e2b.dev', '.vercel.run', 'localhost', '127.0.0.1']
  }
})"""

with open('/home/user/app/vite.config.js', 'w') as f:
    f.write(vite_config)
print('✓ vite.config.js')

# Tailwind config
tailwind_config = """/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}"""

with open('/home/user/app/tailwind.config.js', 'w') as f:
    f.write(tailwind_config)
print('✓ tailwind.config.js')

# PostCSS config
postcss_config = """export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}"""

with open('/home/user/app/postcss.config.js', 'w') as f:
    f.write(postcss_config)
print('✓ postcss.config.js')

# Inspector Bridge JS
inspector_bridge = """(function() {
  let hoveredElement = null;
  let inspecting = false;

  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'TOGGLE_INSPECTOR') {
      inspecting = e.data.active;
      if (!inspecting && hoveredElement) {
        hoveredElement.style.outline = '';
        hoveredElement = null;
      }
    }
    
    if (e.data && e.data.type === 'RUN_SEO_AUDIT') {
      const title = document.title || '';
      const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
      const viewport = document.querySelector('meta[name="viewport"]')?.getAttribute('content') || '';
      const h1Count = document.querySelectorAll('h1').length;
      
      const images = document.querySelectorAll('img');
      let imagesWithoutAlt = 0;
      images.forEach(img => {
        if (!img.getAttribute('alt') || img.getAttribute('alt').trim() === '') {
          imagesWithoutAlt++;
        }
      });

      window.parent.postMessage({
        type: 'SEO_AUDIT_RESULTS',
        title,
        metaDesc,
        viewport,
        h1Count,
        imagesWithoutAlt
      }, '*');
    }
  });

  document.addEventListener('mouseover', (e) => {
    if (!inspecting) return;
    if (hoveredElement && hoveredElement !== e.target) {
      hoveredElement.style.outline = '';
    }
    hoveredElement = e.target;
    hoveredElement.style.outline = '2px dashed #f97316';
    hoveredElement.style.cursor = 'pointer';
  });

  document.addEventListener('mouseout', (e) => {
    if (!inspecting) return;
    if (hoveredElement) {
      hoveredElement.style.outline = '';
    }
  });

  document.addEventListener('click', (e) => {
    if (!inspecting) return;
    e.preventDefault();
    e.stopPropagation();
    
    window.parent.postMessage({
      type: 'ELEMENT_SELECTED',
      tag: e.target.tagName.toLowerCase(),
      text: (e.target.textContent || '').trim().substring(0, 80)
    }, '*');
  });
})();"""

with open('/home/user/app/public/inspector-bridge.js', 'w') as f:
    f.write(inspector_bridge)
print('✓ public/inspector-bridge.js')

# Index.html
index_html = """<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Sandbox App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
    <script src="/inspector-bridge.js"></script>
  </body>
</html>"""

with open('/home/user/app/index.html', 'w') as f:
    f.write(index_html)
print('✓ index.html')

# Main.jsx
main_jsx = """import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)"""

with open('/home/user/app/src/main.jsx', 'w') as f:
    f.write(main_jsx)
print('✓ src/main.jsx')

# App.jsx
app_jsx = """function App() {
  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
      <div className="text-center max-w-2xl">
        <p className="text-lg text-gray-400">
          Sandbox Ready<br/>
          Start building your React app with Vite and Tailwind CSS!
        </p>
      </div>
    </div>
  )
}

export default App"""

with open('/home/user/app/src/App.jsx', 'w') as f:
    f.write(app_jsx)
print('✓ src/App.jsx')

# Index.css
index_css = """@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  background-color: rgb(17 24 39);
}"""

with open('/home/user/app/src/index.css', 'w') as f:
    f.write(index_css)
print('✓ src/index.css')

print('\\nAll files created successfully!')
`;

    await this.sandbox.runCode(setupScript);
    
    // Install dependencies
    await this.sandbox.runCode(`
import subprocess

print('Installing npm packages...')
result = subprocess.run(
    ['npm', 'install'],
    cwd='/home/user/app',
    capture_output=True,
    text=True
)

if result.returncode == 0:
    print('✓ Dependencies installed successfully')
else:
    print(f'⚠ Warning: npm install had issues: {result.stderr}')
    `);

    // Files created through runCode are owned by root; Vite and later shell
    // commands run as the sandbox user and need write access to the app tree.
    await this.sandbox.commands.run('sudo chown -R user:user /home/user/app', {
      cwd: '/home/user/app',
    });
    
    this.viteCommand = await this.sandbox.commands.run('npm run dev', {
      cwd: '/home/user/app',
      background: true,
    });
    await this.waitForViteReady();
    
    // Track initial files
    this.existingFiles.add('src/App.jsx');
    this.existingFiles.add('src/main.jsx');
    this.existingFiles.add('src/index.css');
    this.existingFiles.add('index.html');
    this.existingFiles.add('package.json');
    this.existingFiles.add('vite.config.js');
    this.existingFiles.add('tailwind.config.js');
    this.existingFiles.add('postcss.config.js');
  }

  async restartViteServer(): Promise<void> {
    if (!this.sandbox) {
      throw new Error('No active sandbox');
    }

    if (this.viteCommand) {
      await this.viteCommand.kill();
      this.viteCommand = null;
    }

    this.viteCommand = await this.sandbox.commands.run('npm run dev', {
      cwd: '/home/user/app',
      background: true,
    });
    await this.waitForViteReady();
  }

  private async waitForViteReady(): Promise<void> {
    const url = this.getSandboxUrl();
    if (!url) throw new Error('Sandbox URL is unavailable for readiness probe');
    const readiness = await waitForHttpReady({
      url,
      timeoutMs: this.config.e2b?.timeoutMs || appConfig.e2b.timeoutMs,
      stableSuccesses: 2,
      isReady: async (response) => {
        const html = await response.text();
        return html.includes('id="root"') && html.includes('/src/main.jsx');
      },
    });
    if (!readiness.ready) throw new Error(`Vite did not become ready: ${readiness.lastError ?? 'unknown error'}`);
  }

  async pause(): Promise<void> {
    if (!this.sandbox) throw new Error('No active sandbox');
    await this.sandbox.pause();
    this.viteCommand = null;
  }

  getSandboxUrl(): string | null {
    return this.sandboxInfo?.url || null;
  }

  getSandboxInfo(): SandboxInfo | null {
    return this.sandboxInfo;
  }

  async terminate(): Promise<void> {
    if (this.sandbox) {
      try {
        await this.sandbox.kill();
      } catch (e) {
        console.error('Failed to terminate sandbox:', e);
      }
      this.sandbox = null;
      this.sandboxInfo = null;
    }
  }

  isAlive(): boolean {
    return !!this.sandbox;
  }
}
