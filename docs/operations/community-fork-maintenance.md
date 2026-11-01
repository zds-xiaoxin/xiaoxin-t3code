# Maintaining the community fork

`main` is the maintained Xiaoxin edition. Keep its shared history: integrate upstream with a real merge through a short-lived `sync/<version>` branch and a pull request. Do not rebase or force-push published `main`. For a new maintenance checkout, name the official `pingdotgg/t3code` remote `upstream` and this fork `origin`. Existing release checkouts may use a local mirror as `origin`; inspect their remotes before fetching or pushing, and do not rewrite shared checkout configuration.

Use an official stable release tag as the normal integration target. Evaluate an urgent nightly fix separately and record the exact upstream commit. Being behind upstream `main` is expected between releases; the commit count is not a count of missing features or an installation status.

Use short-lived `feat/*` or `fix/*` branches for independent changes. Keep customizations in focused commits so an equivalent upstream implementation can replace them after regression testing. Submit upstream contributions as separate, minimal changes based on the current official branch, following its contribution policy.

Before integration, reconcile the installed application's build manifest and any local patches with a committed source baseline. Preserve uncommitted work in the original checkout. Validate the merge in an isolated worktree and state directory, retaining the Chinese interface, task progress, artifacts and feedback, Claude runtime selection, scheduled task time zones, and account isolation. Run `vp run check:changed` and an integrated client check before promoting the branch.

Use immutable release tags and matching package manifests for each distribution. Do not move the default branch to a version-named branch for each release. Preserve historical branches and tags for retrieval; label obsolete releases clearly rather than deleting their history. Keep the bilingual visible feature gallery required by `community-release-showcase.md`.

Source validation, a published package, a queued installer, an installed application, and user acceptance are separate states. Record the source commit, upstream tag, custom patch identity and package digest. A source update must not imply that the application has been installed or accepted.

Install only after the storage guard passes and the candidate is verified. Wait for the existing task/input idle gates, take the protected cold backup, and verify the program, data, authentication and configuration after replacement. A program rollback never restores an old database over new conversations.
