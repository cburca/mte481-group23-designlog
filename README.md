# G23 Tracker — MTE 481/482 design log

A Jira-style tracker for Group 23's capstone: epics and child tickets, a
board, a timeline with a swim lane per epic, checklists, comments, owners,
reporters and approvers, start and due dates, and a work log of who spent
how long on what.

It runs entirely on GitHub Pages. There is no server: all tickets live in one
file, `data/tracker.json`, which the site reads and writes through the GitHub
API. **Every change is a git commit**, so the repository history is a complete,
timestamped audit trail of who changed what. That's useful evidence for the
design log mark.

---

## 1. Install (replacing the old site)

1. Delete everything in the repository **except** the hidden `.git` folder.
   The old Jekyll files (`_config.yml`, `_layouts/`, `_includes/`, `_log/`,
   `index.md`, `team.md` and so on) must go, or GitHub will keep building
   the old site.
2. Copy in everything from this folder, including the hidden `.nojekyll`
   file. On macOS press `Cmd+Shift+.` in Finder to see hidden files.
3. Commit and push:
   ```
   git add -A
   git commit -m "Replace design log with tracker"
   git push
   ```
4. Settings → Pages should still say *Deploy from a branch*, `main`, `/ (root)`.
   Wait 1–2 minutes, then open the site in a private/incognito window.

**Passcode:** Ask Chris Burca for it. If you changed it earlier, copy your
`PASSCODE_HASH` value into `assets/js/gate.js` again, because this folder
ships the default.

## 2. Give teammates edit access

Anyone can *view* the board (after the passcode). To *edit*, a person needs
write access to the repository and a GitHub token.

1. The repository owner goes to **Settings → Collaborators → Add people**
   and invites the other three team members.
2. Each person creates a token:
   **github.com → Settings → Developer settings → Personal access tokens →
   Tokens (classic) → Generate new token (classic)**.
   Tick the **`repo`** scope and set the expiry to after the term ends.
   (The Settings page in the tracker has a direct link that pre-fills this.)
3. Open the tracker → **Settings** → paste the token → **Connect**.
4. Pick your name under **Who are you?** Add everyone's GitHub username in
   the Team table and the tracker will recognise people automatically.
5. Rename "Member 1–4" to your real names in the Team table.

The token is saved only in that browser and is sent only to
`api.github.com`. Treat it like a password: don't paste it into chats or
commit it. A classic `repo` token can access all of your repositories, so if
you prefer a narrower token, a fine-grained token with **Contents: Read and
write** on this one repository also works, provided GitHub lets you select
the repository under "Repository access".

## 3. Privacy options

Be clear about what each setup actually protects.

### Default: link + passcode (active now)

- The passcode screen and `noindex` tags keep casual visitors and search
  engines out.
- **Editing is genuinely protected**: only collaborators with a token can
  change anything.
- **Viewing is not**: the passcode is checked in the browser, and anyone who
  knows the URL can open `…/data/tracker.json` directly. Don't put anything
  in tickets you'd mind a classmate reading.

### Private: ticket data only visible to collaborators

GitHub can't restrict who views a Pages site unless you're an organization
on GitHub Enterprise Cloud. Making the repo private (which needs GitHub Pro
for a personal account; it's free for students through the
[GitHub Student Developer Pack](https://education.github.com/pack)) hides the
code, but **the published site is still public**.

To make the ticket data itself private:

1. Get GitHub Pro via the Student Pack, then make the repository **private**
   (Settings → General → Danger Zone → Change visibility).
2. Create a branch named `tracker-data`: on the repo's main page, click the
   branch dropdown, type `tracker-data` and choose *Create branch from main*.
3. In `assets/js/config.js`, set `dataBranch: "tracker-data"` and
   `publicRead: false`. Commit.
4. Add your instructors as collaborators too, so they can connect with their
   own token.

GitHub Pages only publishes `main`, so the ticket data on `tracker-data`
never appears on the public site. People without a token see only a
"Connect GitHub to view" message. The trade-off: instructors need to connect
with a token to view it themselves. Otherwise you show it to them during
weekly meetings.

## 4. How the team uses it

- **Board**: tickets by status. Drag cards between columns. Toggle *Group
  by epic* for swim lanes.
- **Timeline**: one lane per epic, with a bar per child ticket from start to
  due date. Shows today and the course milestones (link due, PDP, FDP,
  report). Tickets without dates are marked "no dates".
- **List**: every ticket in a table grouped by epic.
- **Work log**: hours per member, per discipline and per week, plus every
  entry. **Export CSV** for reports. Log time here or on any ticket.
- **Filters** (top bar): discipline chips (Mechanical, Electrical, Firmware,
  Software, Project), epic, owner, and search. They apply to every view.

**Roles on a ticket:** the *reporter* is whoever created it. The *owner*
does the work. The *approver* accepts it. When a ticket reaches **Done**,
only the approver can click **Accept**. Moving it out of Done clears the
acceptance.

**Log your hours on the ticket you worked on.** That's what makes each
person's contribution visible, which the course asks the design log to show.

**Concurrent edits:** if two people save at the same moment, the tracker
re-fetches and re-applies the second change, so nobody's work is overwritten.
Other people's changes appear when you come back to the tab or click
**Refresh**.

## 5. Customizing

- **Disciplines, colors and course milestones** are in `data/tracker.json`
  (`disciplines` and `milestones`). Edit the file on GitHub, keep the JSON
  valid, and reload. The "Project" discipline covers course deliverables
  such as the PDP and report. Rename or remove it if you prefer.
- **Placeholder tickets:** the course-deliverable tickets use real MTE 481
  dates. The four "Define … requirements" tickets are placeholders. Edit or
  delete them once your problem statement is set.
- **Backup:** Settings → *Download tracker.json*. You can also restore any
  earlier version from the repository's commit history.

## Files

```
index.html            page shell
assets/css/app.css    styles
assets/js/config.js   repo / branch / privacy settings
assets/js/gate.js     passcode screen
assets/js/store.js    GitHub read/write, conflict handling
assets/js/app.js      board, timeline, list, work log, settings, ticket panel
data/tracker.json     tickets, team, disciplines, milestones
.nojekyll             tells GitHub Pages to serve files as-is
```
