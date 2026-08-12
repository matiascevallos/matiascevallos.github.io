import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    outDir: path.resolve(__dirname, 'airport-prototype/assets'),
    emptyOutDir: true,
    lib: {
      entry: path.resolve(__dirname, 'src/airport-prototype/main.ts'),
      name: 'AirportPrototype',
      fileName: 'airport-prototype',
      formats: ['es'],
    },
    rollupOptions: {
      output: {
        assetFileNames: 'airport-prototype[extname]',
      },
    },
  },
});
