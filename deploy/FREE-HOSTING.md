# Free Render deployment

This project includes a `render.yaml` Blueprint for one **free Node web service** in Singapore.
It provisions no paid disks or databases. The service has a stable HTTPS `onrender.com` address
and runs independently of your PC while its Render service/account remains active.

## Free-tier limits

- The service sleeps after 15 minutes without requests. The next visit takes about a minute to wake it.
- SQLite changes disappear after sleep, restart, or redeployment. The original synthetic CTF dataset is rebuilt automatically.
- Login sessions and player progress are held in memory and reset whenever the Node process restarts.
- Free instance hours, bandwidth, and builds have monthly limits. Free hosting is not a guarantee of permanent availability.
- Keep the service on **Free** and do not enable paid resources. Accounts with a payment method can incur bandwidth/build overages; review your workspace spending settings.

Current provider details: <https://render.com/docs/free>.

## Publish

1. Put the project folder containing `package.json` and `render.yaml` at the root of a **private GitHub repository**. Keep `data/db/schema.sql`, `data/challenge-data/`, and the source evidence images in the repository. The generated SQLite database, login JSON, logs, and tunnel executable are excluded by `.gitignore`.
2. Connect that repository to Render. Create a **Blueprint** from the repository and review that the web service plan is **Free** before deploying.
3. The Blueprint runs `npm run render-build`, then `npm run render-start`, with Node 24. It sets `DISABLE_CTF_ADMIN=1` and `COOKIE_SECURE=1` and checks `/healthz`.
4. Open the HTTPS URL returned by Render and verify the login page. `/healthz` should return `{"ok":true}`. `/ctf-admin.html` and `/api/ctf-admin/*` should return 404.

If creating a Web Service manually, use the same commands and environment variables from `render.yaml`.
Use a Node Web Service, not a Static Site. No npm dependencies or separate database service are required.
Render supplies `PORT` and `RENDER=true`; do not hardcode a public URL or port in the frontend.

## Verification

Run `npm run test:deploy`. It creates a temporary clean copy, builds a full dataset, verifies that repeat preparation preserves existing data, then checks health, login, secure cookies, per-client throttling, and blocked admin routes. It does not change your working database.

## Data and recovery

Seeding happens during the build so wake-ups can use the prepared dataset. Startup also creates missing data before accepting requests. Existing data is preserved when still present, but the free host does not retain it across replacement instances.

For a clean reset on the free service, trigger a new deployment. The hosted developer reset panel is deliberately disabled.
Do not mount a disk directly over `data/` without also arranging the source schema, evidence, and challenge files: an empty mount hides those required assets.
Durable player progress requires additional session-storage changes even if a persistent disk is later added.
