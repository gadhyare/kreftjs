# Package security gatekeeper

`kreft install`, `kreft i` and `kreft add` use the same npm security pipeline.

```sh
kreft install luxon
# CI: explicitly allow installation after policy checks
kreft install luxon --yes
kreft i @scope/package@1.2.3 --dev
kreft install luxon --check --json
```

### The order of things

1. **Check.** Kreft resolves the exact versions in a temporary folder and reviews every package: registry identity, integrity, advisories, license and tier. Your project is not touched.
2. **Ask.** If the review passed, you see the summary and the question. A package that failed the review is blocked and no question is asked.
3. **Install, only on Allow.** Kreft installs the reviewed packages with their integrity verified and scripts disabled, then updates `package.json`, the lockfile and `node_modules` together.
4. **Disallow cancels.** Option 2, Enter, an unknown answer, Ctrl+C, EOF or a closed terminal cancel; option 4 also saves a deny rule.

### What is judged: only what you install

`kreft install luxon` judges **luxon and the new packages luxon brings**. The packages your project already had (electron-builder, Tauri, Capacitor, anything you installed before) are not part of that decision. A problem that is already in your project must not stop you installing something unrelated, so:

- **New packages** (the requested ones and what they need) are judged against the whole policy. A new package that fails it is blocked, and nothing is installed.
- **Packages already in the project** are still reviewed. Their advisories, tier and license findings are shown as **warnings** (`Already in your project, not blocking this install`), counted in a note under the report, and listed in full with `--verbose` and in the report file. They do not block.
- **Some findings block everywhere**, even in packages you already had, because they protect the installation itself: missing integrity metadata, a source that is not an https registry artifact, a registry identity or integrity mismatch, a **malware advisory**, and a package you denied yourself (`deniedPackages`).
- **How "already in the project" is decided.** A package is existing only when your lockfile already had it with the **same version and integrity** (wherever it sat). Without a lockfile there is no baseline, so a package reachable from a dependency your `package.json` already lists is also treated as existing. Once a lockfile exists, any package whose version or integrity changed — even one an existing dependency also uses — is a **new package** and is judged.

For example, a project made with `kreft new my-app --electron` has hundreds of packages from electron-builder, some with known advisories. Installing `dayjs` there is judged on `dayjs` alone, and the report adds a note that those existing packages have findings. Installing a package that is itself vulnerable is still blocked, and the report says which package and which rule (`✖ lodash@4.17.15  vulnerability: high advisory`).

**What a No changes: nothing.** A cancelled install leaves `package.json`, the lockfile, `node_modules`, `kreftjs.config.json` and other project files exactly as they were. npm may still update its external cache or logs while reviewing metadata. The temporary folder is removed, and no report is written either (no `.kreft/` folder appears). The only answers that write anything are the ones that say so: **Always allow** and **Never allow** save a rule in `kreftjs.config.json`.

### What you see

Normal output shows a colored **Package Security Assessment Report** with only the requested package name, exact version and status, followed by the installation choices. Registry progress, dependency lists and advisory details are hidden. If project policy blocks installation, a short reason replaces the confirmation.

- **Every package, one by one,** is written to `.kreft/security/latest.txt` (and `latest.json`) when reporting is enabled, except on cancellation. Add `--verbose` to `kreft install` to see all of it, and every check message, in the terminal.

After security checks pass, interactive CLI installs display the findings and ask what to do with the requested packages:

Like the JavaScript / TypeScript question in `kreft new`, package installation uses a numbered menu after the security check completes. For example, run `kreft add dayjs`, `kreft i dayjs` or `kreft install dayjs`:

```text
Security checks passed for dayjs@1.11.23. Choose what to do:
  1) Allow installation once
  2) Disallow installation once (default)
  3) Always allow this package in this project
  4) Never allow this package in this project

Installation [1/2/3/4]:
```

The version shown is the exact version resolved for that operation.

| Choice | What happens |
|---|---|
| `1` — Allow once | Install now after checks pass. No rule is saved; ask again next time. Also accepts `a`, `allow`, `y`, `yes`. |
| `2` — Disallow once | Cancel without changing project files or writing a report. This is the default for Enter, an unknown answer, EOF or Ctrl+C. Also accepts `d`, `disallow`. |
| `3` — Always allow | Install now and save the exact reviewed version in `security.allowedPackages`, for example `dayjs@1.11.23`. Future installs of that version still run security checks, then skip the question. Also accepts `r`, `always`. |
| `4` — Never allow | Cancel and save the package name in `security.deniedPackages`, for example `dayjs`. All versions are blocked on later installs. Also accepts `n`, `never`. |

For several requested packages, the answer applies to the whole batch. Saved choices apply to the requested packages, not automatic approvals of their dependencies. An already allowed batch skips the question only after the full review passes. Use `--yes` / `-y` for unattended CI installs; it never bypasses security policy. IDE terminals and redirected streams can answer the numbered question too. If input is closed or no answer is available, installation visibly cancels. Blocked packages cannot be allowed through this menu; dry runs do not prompt.

The installer copies the manifest, npm lockfile and project `.npmrc` to a temporary sibling directory inside the project. npm resolves a lockfile with scripts disabled. Kreft inspects every resolved entry, including nested duplicates, peer and optional dependencies. npm handles version conflicts and cycles. Registry metadata is fetched once per exact package/version per operation, with bounded retries and timeouts. User npm configuration and scoped registry settings remain applicable. Reports can contain private package metadata; registry credentials are not copied into reports.

Before fetching package bodies, Kreft enforces exact registry identity, strong integrity metadata, license policy and npm advisory thresholds. Any policy failure leaves the project manifest, lockfile and node_modules untouched. A successful review installs in staging using `npm ci --ignore-scripts`, which verifies downloaded bytes against lockfile integrity. Kreft compares the resulting lockfile and installed package identities with the approved graph, then promotes the staged tree with recovery on promotion failure. Platform-specific optional omissions are recorded. Existing node_modules is replaced with the approved tree, so extraneous modules and manual edits are removed. An interrupted process or machine failure during promotion may require manual recovery from `.kreft-node-modules-*`; this is not a crash-atomic multi-file transaction.

Configuration follows the existing JSON configuration convention, in `kreftjs.config.json` (including the existing `config/`, `Config/` and legacy filename lookup conventions):

```json
{
  "security": {
    "enabled": true,
    "minimumTier": 2,
    "blockCriticalVulnerabilities": true,
    "blockHighVulnerabilities": true,
    "blockMaliciousPackages": true,
    "ignoreScripts": true,
    "verifyIntegrity": true,
    "auditOnInstall": true,
    "allowUnverified": false,
    "checkDependencies": true,
    "checkLicenses": true,
    "checkMaintenance": true,
    "failOnUnknownSecurityStatus": true,
    "deniedLicenses": ["AGPL-3.0-only"],
    "deniedPackages": ["example-denied", "another-package@1.0.0"],
    "allowedPackages": ["luxon@3.5.0", "@scope/internal-tool"],
    "reports": {
      "enabled": true,
      "format": ["json", "text"],
      "directory": ".kreft/security"
    }
  }
}
```

The deny and allow lists are empty by default; the entries above illustrate organization-specific restrictions. The other settings shown are defaults. Unknown settings and invalid types fail with an error. `enabled`, `ignoreScripts`, `verifyIntegrity` and `checkDependencies` must remain true in this implementation. `--force` and `--yes` never bypass package policy. `--allow-scripts`, `--trusted`, `--no-audit` and `--no-exact` are rejected; script-dependent native packages require a separately reviewed build step. Per-version script exceptions are not yet implemented. Desktop scaffolding (`kreft add electron tauri`) retains its existing separate setup workflow and is not covered by this gatekeeper. Run desktop scaffolding and package installation separately.

## Remembering your decision: allow and deny rules

The prompt's **Always allow** and **Never allow** answers write a rule into `kreftjs.config.json`. You can also edit the rules yourself, without installing anything:

```sh
kreft install --allow-package luxon@3.5.0        # allow this exact version for good
kreft install --allow-package @scope/tool        # allow every version of a package
kreft install --deny-package left-pad            # block a package for good
kreft install --forget-package left-pad          # remove the rule again (a name removes every version)
kreft install --packages                         # list the rules (add --json for a machine-readable list)
```

- **`security.allowedPackages`** lists packages that skip the question. An entry is a package name (any version) or an exact version (`name@1.2.3`). It never holds a range, a tag or a URL.
- **`security.deniedPackages`** lists packages that are blocked. The same two forms.
- **Allowing never bypasses the review.** The security check (registry identity, integrity, advisories, license, tier) runs first, exactly as for any package. An allowed package that fails it is still blocked, and nothing is installed. The allow list only saves you the question. In the same way, `--yes` and `--force` never bypass the policy.
- **Always allow records the exact version** you reviewed, so a new version of the package is reviewed and asked about again.
- **One package cannot be both.** A configuration that allows and denies the same package (with overlapping versions) is rejected with a message. `--allow-package` on a package you denied removes the deny, and `--deny-package` on an allowed package removes the allow: you changed your mind on purpose, and the command says it did so.
- **Your file is kept as written.** Kreft edits only the `security` lists. Every other setting, and every `${NAME}` placeholder, stays exactly as you wrote it, and the new file is written in one step so a crash cannot leave half a file. If the file cannot be written, the choice still counts for the current installation and Kreft says it was not saved.
- A skipped question is recorded in the report as `decisionSource: "allowedPackages"`; an answer at the prompt is `"prompt"`, and a saved choice also has a `remembered` entry.

Commit `kreftjs.config.json` to share the rules with your team, or keep them local: the file is the only place they live.

Classifications:

- **Trusted (Tier 1)** requires verified provenance evidence this implementation cannot supply, so it is never issued. Requiring Tier 1 blocks installation.
- **Established (Tier 2)** requires matching registry identity/integrity, available advisory results, license evidence and (by default) maintainer/repository evidence. These are registry claims, not proof that code is safe.
- **Unverified (Tier 3)** indicates missing evidence, deprecation or license expressions requiring manual review. Permit explicitly with `allowUnverified: true` or `minimumTier: 3`. Missing registry/advisory evidence still blocks unless `failOnUnknownSecurityStatus` is also false.
- **Blocked** means a mandatory configured policy rule failed. Reports give the package, version, graph location, rule and supporting advisory evidence.

Download counts and dependency counts never establish trust. Package age alone never blocks installation. Advertised provenance is reported as unverified. License denial checks SPDX identifier tokens conservatively, including OR expressions; there is no automatic legal interpretation. Maintenance evidence is limited to metadata, not a claim about maintainer trustworthiness.

Reports default to `.kreft/security/latest.json` and `latest.txt`; operations that write reports replace these files. Cancellation preserves any earlier reports. Interactive decisions are recorded in the report as `decision: "allow"`, and a cancellation as `status: "cancelled"` with `policyAllowed: true` (which tells the developer's choice apart from a security block). **A cancellation writes no report file**: see "What a No changes" above. With `--json` the report goes to stdout either way. Other statuses are `approved` (successful review without installation), `installed`, `blocked` and `failed`.

`--json` emits the report to stdout; failures also produce diagnostic stderr and nonzero exit status. `--check` resolves and evaluates without fetching/extracting package bodies, so its approval does not mean artifact bytes have been verified. CI can run `kreft install package --check --json` and inspect the exit status before an actual install.

This version supports standalone npm projects with lockfile versions 2 and 3. Aliases, git/file/URL sources, npm overrides, workspaces, npm shrinkwrap and other package managers fail explicitly. They require additional resolution and verification support; they are not silently converted to npm. npm registry advisory availability is required by default. No advisory database guarantees complete malware or vulnerability detection. Source review, cryptographic provenance verification, historical dependency-change analysis and a dedicated malicious-package feed remain future work.

Validation: `node --test test/package-rules.test.js` covers the allow and deny rules, the prompt answers, the command-line flags and the guarantee that an allowed package is still reviewed. `node --test test/package-gatekeeper.test.js` exercises policy decisions, malicious specifications, advisory and license blocking, missing evidence, graph mismatch, dry runs, exact pinning and project preservation on failure. Resolution uses npm's documented [lockfile behavior](https://docs.npmjs.com/cli/commands/npm-install/) and [npm ci semantics](https://docs.npmjs.com/cli/commands/npm-ci/).
