import { defineConfig } from 'tsup';

export default defineConfig([
  // Package ESM (componente React para sites que importam diretamente)
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    clean: true,
    sourcemap: true,
    external: ['react', '@supabase/supabase-js'],
  },
  // Widget universal auto-contido (React + supabase incluídos) para QUALQUER site:
  // <script src=".../widget.global.js" data-channel="bridge-x"></script>
  {
    entry: { widget: 'src/widget.tsx' },
    format: ['iife'],
    globalName: 'IframeMacWidget',
    platform: 'browser',
    minify: true,
    clean: false,
    noExternal: [/.*/],
    define: { 'process.env.NODE_ENV': '"production"' },
  },
]);
