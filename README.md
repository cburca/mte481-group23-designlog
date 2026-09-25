# Group 23 — MTE 481/482 Design Log

A Jekyll site built to run on GitHub Pages. Read this whole file before you
push — the access-control section matters, and the due date on this
assignment is today (Sep 25, 11:59 pm).

## 1. Get it onto GitHub (fastest path, ~10 minutes)

1. On GitHub, create a **new repository** named `mte481-group23-designlog`
   (any name works, but if you pick a different one, update `baseurl` in
   `_config.yml` to match — see the comment right above it).
2. For now, it's fine to make it a normal **public** repository — see
   Section 2 for why, and how to upgrade to a genuinely private one.
3. Upload everything in this folder to the repo (drag-and-drop on
   github.com works, or `git init`, `git add .`, `git commit -m "Initial design log"`,
   `git remote add origin <your repo URL>`, `git push -u origin main`).
4. In the repo, go to **Settings → Pages**. Under "Build and deployment",
   set Source to **Deploy from a branch**, branch `main`, folder `/ (root)`.
   Save.
5. Wait 1–2 minutes, then your site is live at:
   `https://<your-github-username-or-org>.github.io/mte481-group23-designlog/`
6. Submit that link to your group's LEARN dropbox before 11:59 pm.

## 2. Making the site actually private

GitHub Pages sites are **public by default** — anyone with the URL can view
them, and public repos can be discovered even without a direct link. You
asked for something only your 4 group members and instructors can access.
There are two ways to get there, and they're genuinely different in how
much protection they give:

### Option A — real access control (recommended)

GitHub can restrict a Pages site to only the people you invite as
collaborators, **but only on a private repository belonging to an account
with GitHub Pro** (or an organization on GitHub Team/Enterprise). Free
personal accounts can build Pages from a private repo, but the resulting
site is still visible to anyone with the link — the "restrict to
collaborators" toggle itself needs Pro.

The good news: University of Waterloo students can get GitHub Pro for free
through the **GitHub Student Developer Pack**
(https://education.github.com/pack) — verify with your `@uwaterloo.ca`
email. It's usually approved within minutes to a day or two.

Once you have Pro:
1. Make the repository **private** (Settings → General → Danger Zone →
   Change visibility, or set it private at creation).
2. Settings → Collaborators and teams → add your 3 teammates and your
   supervising professors as collaborators.
3. Settings → Pages → under "Visibility", choose **Private**. Now the
   site only loads for someone logged into GitHub *and* listed as a
   collaborator — everyone else gets a 404, link or no link.

This is the option that actually matches "only these 4 members and the
professors can access it," so switch to it once your Pro upgrade comes
through, even if you launch with Option B today to hit the deadline.

### Option B — unlisted, link-only (what's active in this build right now)

If Pro isn't approved in time for today's deadline, this repo ships with a
fallback that gets you *practical* privacy — not real access control, but
enough that a stranger won't stumble onto it:

- **`robots.txt`** and a `noindex, nofollow` meta tag on every page tell
  search engines not to index the site.
- **A passcode screen** (`assets/js/gate.js`) hides the content behind a
  simple prompt. The default passcode is `mte481-group23` — **change it**
  (instructions are in the comment at the top of `gate.js`) and share the
  new one with your teammates and supervisors directly (e.g. in your LEARN
  submission note or your weekly meeting), not in a public place.

Be clear-eyed about the limits: the page content ships to the browser
before the passcode check runs, and the check itself happens in
JavaScript anyone can read via "View Source" — so this stops casual
visitors, not a determined one. Don't put anything on this site you
wouldn't be comfortable with a classmate seeing if they found the link.
Move to Option A as soon as you can.

## 3. Everyday use

### Adding a log entry (any team member)

1. Copy `_log/TEMPLATE.md` to a new file in the same folder, named
   `YYYY-MM-DD-short-title.md` (e.g. `2026-10-02-motor-sizing.md`).
2. Fill in the front matter (`title`, `author`, `date`, `tags`) and write
   your entry.
3. Commit and push (or edit directly in the GitHub web UI — click "Add
   file" in `_log/`). The site rebuilds automatically in about a minute.
4. Your entry appears at the top of the [Log](log/) page automatically,
   sorted by date, with your name attached.

### Updating team info

Edit `team.md` — replace the four placeholder cards with real names,
programs, and emails, and confirm your supervisor pair in the table at the
bottom.

### Filling in the design pages

`problem-definition.md`, `objectives-constraints-criteria.md`,
`design-alternatives.md`, `decision-matrix.md`, and `timeline.md` all have
`<!-- EDIT ME -->` comments marking placeholder content to replace as your
project develops through the term — you don't need all of it filled in on
day one.

## 4. Local preview (optional)

You don't need this to submit — GitHub builds the site for you. If you
want to preview changes locally before pushing:

```bash
gem install bundler jekyll
bundle init
echo 'gem "github-pages", group: :jekyll_plugins' >> Gemfile
bundle install
bundle exec jekyll serve
```

Then open `http://localhost:4000/mte481-group23-designlog/`.
