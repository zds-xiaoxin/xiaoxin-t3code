# C47 数据对比：测试范围与原始证据

本轮把三组条件分开：C45→C47 动效组件同窗 A/B；C47 安装后的严格空闲采样；官方 v0.1.9 源码的三个特定边界样例回放。它们不能合并为一个“整机提速”百分比。

渲染 CPU 四次均值4.175%→1.175%，相对下降71.8563%；GPU 进程的 CPU 四次均值7.675%→4.425%，相对下降42.3453%。海报分别取整为72%与42%。每版四次8秒样本，只能说明该组件在本次条件下的表现。完整方法与可证伪条件见下方英文记录；原始数据在同目录 strip-cpu-raw.json，摘要在 measurements.json。

安装后的空闲验收为另一场景：65个有效样本，中位数1.0%、P951.2%。C37 历史空闲窗口有输入活动，不能与之计算性能提升。

官方对照固定为2026-11-11发布的v0.1.9。纯映射函数的3个选定样例中，C47符合3个预期、官方符合0个；这不是整体准确率或完整官方测试通过率。官方预置主题定义5个，C47为7个（额外两种仅桌面端）。两者整应用性能尚无同条件对照，不宣称优于官方。

应优先复核：原始样本的算术是否正确；相同fixture在指定源码版本是否得到相同结果；正常账号耗尽及恢复后是否仍有旧读数覆盖新状态。后一个真实账号流程目前仍待正常使用验证。

# C47 benchmark methods and limits

These results describe a local build, a narrowly isolated UI component and three selected source-level quota fixtures. They are not a universal performance or accuracy ranking.

## Component experiment

The same headful Chromium page alternated the shipped C45 activity-strip CSS/markup with the optimized C46 implementation. Viewport900×700 CSS px, scale2; Harbor and Mist; two rounds per skin; 1.5s settling plus8s sampling. Process CPU time deltas from CDP SystemInfo were divided by elapsed seconds. Pooling the four observations per version gives renderer4.175→1.175% and GPU-process CPU7.675→4.425%. Reductions are71.8563% and42.3453%, rounded to72%/42% in the poster. Raw observations are in strip-cpu-raw.json. The installed C47 uses byte-identical C46 client assets. Small samples, background load, browser/GPU configuration and hardware can change these values. No energy, battery-life, throughput or whole-app improvement was measured.

## Installed idle window

After30s settling,65 retained samples from the installed C47 renderer passed median≤5% and P95≤10% thresholds. Observed median1.0%, P951.2%; task and input observations were empty, no screenshot/CDP/UI polling occurred during the measurement. The C37 published window had input observations and cannot serve as a matched baseline. This is single-device evidence, not an every-Mac guarantee.

## Official source comparison

Upstream tagv0.1.9 was read on2026-11-11. Compare apps/server/src/provider/claudeUsageLimits.ts and packages/shared/src/themePalettes.ts at that exact tag. The source SHA256 and fixture scope are recorded in measurements.json. The selected fixtures tested expected results for unifiedWindows with no top-level utilization, rejected five_hour with no utilization, and an already-six-minute-old startup observation with probe time supplied. All3 expectations were met by C47; the official mapper met0. The stale-observation fixture exercises the pure mapper, while C47's provider separately preserves matching cached observation time; this is not full provider pipeline verification. Additional names, normal responses or unknown future SDK payloads are outside this selected set. There is no claim that official software is generally0% accurate, or that C47 passed all official tests. Theme counts refer to named predefined theme objects, not system light/dark choices, imported/custom themes or mobile compatibility. C47 adds two desktop-only skins; mobile does not gain those skins.

Official sources: https://github.com/pingdotgg/t3code/blob/v0.1.9/apps/server/src/provider/claudeUsageLimits.ts and https://github.com/pingdotgg/t3code/blob/v0.1.9/packages/shared/src/themePalettes.ts .

## How to challenge the claims

1. Recompute both means and relative reductions from strip-cpu-raw.json; any mismatched number disproves the poster arithmetic.
2. Replay the three stated boundary fixtures against the exact official module and C47 mapper with the existing project dependencies. Different expected results disprove this targeted compatibility comparison.
3. Repeat a matched same-machine A/B workload with more and longer samples. A failure to reproduce the component reduction limits the claim to this recorded run; do not generalize it to whole-app performance.
4. Use a normal account to observe quota exhaustion and a later reset. A new stale reading overriding newer exhaustion disproves the end-to-end repair; this live workflow has not been claimed as completed.

## Visual provenance

01-update-card-A.png is a code-native release layout following the owner-approved AI-generated style study; exact bar lengths are computed from the published numbers. It embeds an authentic native screenshot without redrawing it. 02-themes-native.png is an unedited C47 packaged native app screenshot with an isolated synthetic fixture. The previous nine showcase assets remain unchanged and version-labelled. No customer data, credentials or private chats are included.

## Source publication checks

Formatting, lint, GraphQL checks, typechecks for3affected packages and18tests across3files passed in check:changed. The17quota regression tests overlap this set; do not sum them. Knip found three unused constant exports, made private before publication without changing their values or callers. Its other findings are two generated local SDK files (excluded from the public update) and two relay devDependencies whose files match the existing public baseline. This publication does not claim a fully green monorepo check. See VALIDATION.json.

Follow-up: the three publication-cleanup files passed formatting and lint; apps/web and packages/shared passed the targeted export check after those constants became private. The two relay devDependency findings are byte-identical to the existing public baseline and remain disclosed.

## Reproduce the targeted official comparison

With this repository's existing development dependencies installed, run `vp test run apps/server/src/provider/ClaudeQuotaPublicComparison.test.ts`. The server testFixtures reference module is copied byte-for-byte from upstreamv0.1.9; its SHA256 is in measurements.json. The assertions explicitly test both implementations against the same three selected inputs. No account, provider request or credential is used.
