export const viteReactTemplate = {
  packageJson: {
    name: 'sandbox-app',
    version: '1.0.0',
    type: 'module',
    scripts: { dev: 'vite --host', build: 'vite build', preview: 'vite preview' },
    dependencies: { react: '19.1.0', 'react-dom': '19.1.0' },
    devDependencies: {
      '@vitejs/plugin-react': '5.2.0',
      vite: '7.3.6',
      tailwindcss: '3.4.19',
      postcss: '8.4.31',
      autoprefixer: '10.4.16',
    },
  },
} as const;
