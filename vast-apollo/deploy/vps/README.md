# VPS deploy (Hostinger srv1964514, Docker Swarm via Dokploy)

- `api/` wraps `../../api/index.js` for the VPS: Node 22, secrets from `/run/secrets`,
  bills read by the Tesseract service (`TESSERACT_OCR_URL=http://lakshmi-ocr:3003/ocr`).
  Build context = `api/` plus a copy of `../../api/index.js`; image `lakshmi-api:full-vN`.
- `ocr-service/` is the Tesseract bill reader (`lakshmi-ocr:tesseract-vN`).
  Parser test with two real bills lives on the VPS only (`~/lcp/vast-apollo/ocr-service/test_parser.py`);
  it holds vendor bank details, so it stays out of this public repo.
- Screens: build from `vast-apollo/` with `MSYS_NO_PATHCONV=1 VITE_API_URL=/api
  VITE_SUPABASE_URL=https://supabase.lakshmisarees.in VITE_SUPABASE_ANON_KEY=...` and
  serve `dist/` with nginx (`lakshmi-sarees-inventory:vN`). Without MSYS_NO_PATHCONV,
  Git Bash rewrites `/api` into a Windows folder path.
- Roll back any service: `sudo docker service rollback <service>`.
