# FinSight frontend

This package contains the React and TypeScript interface for FinSight. Start with the [project quick start](../README.md) to run the backend and browser together.

For frontend-only development with a running FastAPI backend, follow [the two-terminal setup](../docs/handbook/01-getting-started.md#16-separate-terminals-for-frontend-development). From the repository root:

```powershell
npm ci --prefix frontend
npm run lint --prefix frontend
npm run build --prefix frontend
```

The production build runs TypeScript checks before Vite bundles the app. The development server reloads changes as you edit. Use the [programming primer](../docs/handbook/04-programming-primer.md), [code map](../docs/handbook/05-architecture-and-code.md), [design tokens](../DESIGN.md), and [verification guide](../docs/handbook/07-testing-and-debugging.md) when changing a feature.
