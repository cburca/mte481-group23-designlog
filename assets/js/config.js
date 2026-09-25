/**
 * Tracker configuration.
 *
 * owner / repo: leave blank and they're detected from the site URL
 * (https://<owner>.github.io/<repo>/). Fill them in only if you use a
 * custom domain or the detection gets it wrong.
 *
 * dataBranch: the branch the tracker reads and writes tickets on.
 *   "main"  (default) — tickets live next to the site, so anyone with the
 *           site link and passcode can VIEW the board without a GitHub token.
 *   "tracker-data" — for real privacy. Create this branch in GitHub first,
 *           make the repository private, and only people with a GitHub token
 *           for the repo (your collaborators) can see any ticket data.
 *           See README.md, "Privacy options".
 *
 * publicRead: true lets people without a token view the board read-only
 * (loaded from the copy on the site branch). Set to false together with
 * dataBranch "tracker-data" so the board shows nothing until someone connects.
 */
window.TRACKER_CONFIG = {
  owner: "",
  repo: "",
  dataBranch: "main",
  dataPath: "data/tracker.json",
  publicRead: true
};
