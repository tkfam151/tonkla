# Practice-problem quizzes for the channel

A small site that goes with each video. Viewers open a link, work through the problems, and see a worked explanation after each one. You make the quizzes yourself at `/admin`.

- **`/`**: all published quizzes, filterable by level (Olympiad, Grade 6, Grade 7, Other)
- **`/q/<link-name>`**: one quiz. It shows the video embed, one question at a time, instant feedback, the explanation, and a score with review at the end.
- **`/admin`**: password-protected. Create, edit, publish and delete quizzes, copy the share link, and see attempt counts and average scores.

## Run it

```bash
npm install
ADMIN_PASSWORD=choose-something npm start
# open http://localhost:3000/admin
```

| Variable | What it does |
| --- | --- |
| `ADMIN_PASSWORD` | **Required for `/admin`.** If it isn't set, admin login is turned off. |
| `PORT` | Port to listen on (default `3000`). |
| `DATA_DIR` | Where quizzes are saved (default `./data`). Use a persistent disk in production. |
| `SITE_NAME` | Name shown in the header (default "MTonkla Practice"). |
| `CHANNEL_URL` | YouTube channel linked in the header (default `https://www.youtube.com/@MTonkla`). |
| `SESSION_SECRET` | Optional. Signs the admin login cookie. By default it is derived from the password, so changing the password logs everyone out. |

On first start a sample Grade 6 quiz is created so the site isn't empty. Edit it or delete it from `/admin`.

## Writing questions

- **Multiple choice:** 2–10 choices. Pick the correct one with the radio button.
- **Short answer:** list the accepted answers, one per line. Numbers match in any equal form (`3/4`, `0.75`, `6/8`). Text ignores capital letters, extra spaces and a trailing period.
- **Math:** write LaTeX between `$...$` (inline) or `$$...$$` (its own line). The editor shows a live preview.
- **Diagrams:** paste an image link into "Image link".
- **Video:** paste the YouTube link (`youtu.be/…`, `watch?v=…`, or `shorts/…`). It is embedded above the questions.

Quizzes start as drafts. Tick **Published** and save to get the link for your video description or pinned comment. While a quiz is a draft, only you (logged in) can preview it.

## How it works

- Node + Express. The only other dependency is KaTeX, which the site serves itself, so there is no external CDN.
- Quizzes are stored in `DATA_DIR/quizzes.json`, which is written atomically.
- Answers never reach the browser. Each answer is checked on the server, and the final score is re-graded on the server so the stats can't be faked.

## Deploying (putting it on the internet)

**Easiest: Render.** Sign in at render.com with GitHub → **New → Blueprint** → choose this repo. Render reads `render.yaml`, asks you for `ADMIN_PASSWORD`, and gives you a link like `https://mtonkla-practice.onrender.com`. Your admin page is that link plus `/admin`. The config uses the Starter plan (about $7/month plus about $0.25/month for the 1 GB disk) because the free plan has no persistent disk and would lose your quizzes on every redeploy.

Never put the password in the code or the repo; set it only in the host's settings.

Any other Node 18+ host works too (Render, Railway, Fly.io, a VPS). Set `ADMIN_PASSWORD`, and point `DATA_DIR` at a persistent volume. On hosts with an ephemeral filesystem, your quizzes would disappear on every redeploy.

## Tests

```bash
npm test
```
