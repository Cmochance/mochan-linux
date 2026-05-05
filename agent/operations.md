# Operations

## Local Development Backend Target

- Default frontend development proxy target is `http://127.0.0.1:38421`.
- To test a backend on another port, run Vite with `MOCHAN_DEV_TARGET`, for example:

```bash
cd web
MOCHAN_DEV_TARGET=http://127.0.0.1:38422 npm run dev
```

- This affects `/api`, `/ws`, and `/healthz` proxy targets in `web/vite.config.ts`.
