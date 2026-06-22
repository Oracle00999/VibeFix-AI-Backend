# AI Website Design Polisher Backend

## Setup

1. Install dependencies:

```bash
npm install
```

2. Install the browser used for screenshot capture:

```bash
npm run install:browsers
```

3. Create `Backend/.env` from `Backend/.env.example` and set `DATABASE_URL`.

4. Create the database if it does not exist yet:

```bash
createdb ai_website_design_polisher
```

5. Initialize the schema:

```bash
npm run db:init
```

6. Start the API:

```bash
npm run dev
```

The API defaults to `http://localhost:5055`.

## AI Mode

Real OpenAI calls are disabled by default so development does not spend credits accidentally.

```env
OPENAI_API_KEY=
AI_ENABLED=false
AI_AUDIT_MODEL=gpt-5.4-mini
AI_CODE_MODEL=gpt-5.4-mini
AI_IMAGE_MAX_WIDTH=1200
AI_IMAGE_QUALITY=82
```

Set `OPENAI_API_KEY` and switch `AI_ENABLED=true` only when you want real AI audits, improved previews, and code generation. Original screenshots remain untouched; optimized JPEG copies are created only for AI input.

Code generation depends on the improved preview. The intended flow is:

1. Run audit.
2. Generate improved preview.
3. Generate improved component from that preview.
