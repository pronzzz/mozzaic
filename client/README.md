# Mozzaic web app

React 19 + TypeScript + Vite + WebGL2. See the [main README](../README.md) for features and the [technical guide](../docs/GUIDE.md) for how the pipeline works.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # Vitest unit tests
npm run lint
npm run build    # static site in dist/
```

Set `VITE_API_URL` to point the "Stabilised render" panel at a backend other than `http://localhost:8000`.
