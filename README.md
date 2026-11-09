# MTonkla Practice

Practice-problem quizzes for the [MTonkla](https://www.youtube.com/@MTonkla) channel, hosted free on GitHub Pages. Viewers open a quiz link, work through the problems, and see the answer and a worked explanation after each one.

- **Home page** (`/`): all quizzes, filterable by level (Olympiad, Grade 6, Grade 7, Other)
- **Quiz page** (`quiz.html?q=<link-name>`): the video embed, one question at a time, instant feedback, and a score with a review at the end
- **Admin** (`/admin/`): create, edit and delete quizzes, and copy the share link

## Turn on GitHub Pages (one time)

1. On GitHub, open this repository → **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**. Pick the branch that has this code (the default branch) and the **/ (root)** folder, then click **Save**.
3. After a minute or two the site is live at **https://tkfam151.github.io/tonkla/**.

On a free GitHub account, Pages only works for **public** repositories.


## Writing questions

- **Multiple choice:** 2–10 choices. Pick the correct one with the radio button.
- **Short answer:** list the accepted answers, one per line. Numbers match in any equal form (`3/4`, `0.75`, `6/8`). Text ignores capital letters, extra spaces and a trailing period.
- **Math:** write LaTeX between `$...$` (inline) or `$$...$$` (its own line). The editor shows a live preview.
- **Diagrams:** paste an image link into "Image link".
- **Video:** paste the YouTube link (`youtu.be/…`, `watch?v=…`, or `shorts/…`). It is embedded above the questions.

- **Video time:** type where the problem is explained (like `3:42`). Viewers get a **Watch** button that plays the video from that moment, and it shows again if they get the question wrong.
- **Hint:** an optional nudge viewers can open before answering.

## Sharing a quiz in your video

After saving, the editor shows the quiz link with:
- **QR code:** download a PNG to put on screen in your video. Viewers scan it with their phone camera. The logo sits in the middle, and the code still scans.
- **Text for description:** ready-to-paste text for the video description or a pinned comment.

Links shared in chats and social apps show a preview card (`assets/og.png`).

## What viewers get

- Video thumbnails on the home page, plus their best score on each quiz (saved in their own browser)
- Hints and jump-to-the-video buttons while answering
- At the end: a score ring, confetti for a perfect score, a "Share my score" button, an "Up next" quiz suggestion and a Subscribe button for the channel
- Search on the home page once there are 7 or more quizzes

Saving creates a commit in the repository, and GitHub Pages takes about a minute to publish it. Untick **Show on the home page** to keep a quiz as a draft. A draft isn't listed on the home page, but anyone with its link can still open it.

## Good to know

- Quizzes live in `quizzes/`: `index.json` is the list, and each quiz is `<link-name>.json`.
- Answers are scrambled in those files so they don't show at a glance. Because this is a static site, a determined viewer could still decode them. That's fine for practice; don't use it for graded tests.
- To change the header name or channel link, edit `assets/config.js`.
- KaTeX (the math renderer) is included in `vendor/katex`, so the site has no outside dependencies.

## Running locally

```bash
python3 -m http.server 8000   # then open http://localhost:8000
npm test                      # answer-checking tests
```
