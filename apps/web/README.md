# Iskra Web Workspace

The Next.js frontend for the HackNation Maschmeyer Group **The VC Brain**
submission.

## Run

```bash
npm ci
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

Open <http://localhost:3000>.

## Main Routes

- `/` - portfolio dashboard and global intelligence
- `/sourcing` - thesis-driven public-signal discovery and lead promotion
- `/opportunities` - deal flow and analysis jobs
- `/search` - Iskra chat, founder discovery, dictation, and dialogue
- `/thesis` - organization investment thesis
- `/company/{id}` - evidence, founder history, scores, memo, collaboration, and
  outcomes
- `/sign-in` - Clerk sign-in when configured

## Environment

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=
```

Without Clerk configuration, the app uses the local demo identity supplied by
`AuthProvider`.

## Verify

```bash
npx tsc --noEmit
npm run lint
npm run build
```

Product and system documentation lives in [docs](../../docs/README.md).
