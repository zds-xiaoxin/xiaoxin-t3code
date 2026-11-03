# Xiaoxin T3 Code C37 · Apple Silicon Mac preview

[简体中文](RELEASE.zh.md) · 2026-11-03 · Community prerelease · macOS arm64

<!-- community-showcase -->

[完整功能图集 / Full feature gallery](https://github.com/zds-xiaoxin/xiaoxin-t3code#feature-showcase)

![工作台功能布局示意 / Workbench feature-layout concept](https://raw.githubusercontent.com/zds-xiaoxin/xiaoxin-t3code/main/assets/community/showcase/01-workbench-overview.png)

_合成内容的功能布局示意；其他图片的来源和平台标注见完整图集。 / Synthetic layout concept; see the gallery for image provenance and platform labels._

<!-- /community-showcase -->

## What changed

Choose Current style or macOS style in Settings → Appearance → Interface → Interface style. Changes apply immediately and survive reopening. Colors, fonts, text sizes and sidebar preferences remain independent. Legacy settings default to Current style.

Includes the C36 0.1.7 nightly core, compact Chinese workbench, context/cache details, task responsiveness improvements and SQLite writer changes. C37 is a community build number; the embedded upstream version is `0.1.7-nightly.20261103.4119`, not a new upstream stable version.

## Download and install

- Download `Xiaoxin-T3-Code-C37-macOS-arm64.zip`, verify `SHA256SUMS.txt`, and extract `T3 Code (Alpha).app`.
- Apple Silicon (M-series) Mac only. The bundle declares macOS 13.0 minimum; local validation does not establish compatibility with every macOS version. No Intel Mac or Windows build is included in this release.
- New users move the app into Applications and supply their own provider CLIs and accounts. No maintainer chats, accounts, keys, projects, private settings or temporary permission helper are included.
- Existing users must finish tasks and quit T3 before backing up `~/.t3` and `~/Library/Application Support/t3code-v2`. Keep the old app, then replace it. Keep T3 closed during the cold backup and run only one instance against the data.
- The new core uses schema 78. **Do not run an older app against upgraded data or restore an old database over new chats.** A rollback requires compatible software and a matching complete pre-upgrade backup.
- The app is ad-hoc signed and not Apple-notarized. If macOS blocks opening, use its Privacy & Security guidance. Installing this package does not require disabling system security or granting Full Disk Access.
- **Updates are manual for this preview.** Download subsequent builds from this repository. The distribution disables the upstream nightly update feed and is re-signed; its application ASAR is identical to the verified C37 build.

## Validation and limits

- 59 targeted contract/settings tests, 88 affected tests, typechecks of 36 packages, formatting, lint, knip and React Compiler checks passed. These test sets overlap and must not be added together. All seven desktop build tasks passed.
- An isolated real client verified both style transitions, persistence after reopening, light/dark materials and removal of macOS rules when returning to Current style. The installed Mac passed Chinese UI, historical conversations/projects, existing provider authentication status and protected-configuration readback. Physical Fn switching and WeChat IME candidates/text input were tested by the user.
- Across 65 renderer samples, median CPU was 4.9% and P95 7.1%, below the numerical limits of 5% and 10%. Three global input observations of unknown origin invalidate strict idle-window acceptance. **A clean idle window is still unconfirmed.** This is not a whole-app savings or long-term stability claim.
- No real or paid model request was sent for this acceptance pass. Not every provider, network, long-running conversation or remote connection is covered. Optional T3 Connect sign-in was not retested, and this local ad-hoc package omits the official signing/passkey claims.
- Release `BUILD-PROVENANCE.json` contains the public summary of ZIP integrity, signatures, member hashes and isolated startup.

C31 remains the previous recommended stable download for its data version. C37 is a Mac prerelease for friends to try; use this release's assets rather than the Latest link.
