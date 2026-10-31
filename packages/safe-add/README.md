# @somjs/somjs

> Enterprise-Grade Security Gatekeeper & Safe Package Installer for Som.js.  
> Works on any computer, server, or CI/CD environment with **zero external dependencies**.

---

## 🔒 Why @somjs/somjs?

Standard `npm install` blindly executes lifecycle scripts (`preinstall`, `install`, `postinstall`), allows disposable newly registered malicious packages, and is susceptible to **typosquatting** and **unicode homoglyph** attacks.

`@somjs/somjs` acts as an intelligent, automated security firewall between your project and the public npm registry.

---

## 🚀 Quick Start (Use Anywhere)

### Run instantly with NPX (No installation needed)
```bash
npx @somjs/somjs express lodash
```

### Install globally on any machine
```bash
npm install -g @somjs/somjs
```

Once installed globally, you can use either `safe-add` or the short alias `sadd`:
```bash
safe-add express
sadd -D vitest
```

---

## 🛡️ Multi-Tier Security Verification Rules

1. **Homoglyph & Confusable Unicode Shield**  
   Blocks deceptive package names using invisible zero-width or non-ASCII characters that mimic authentic packages.

2. **Algorithmic Typosquatting Blocker**  
   Calculates Levenshtein edit distance dynamically against 50+ high-profile npm packages (e.g. `expres` -> `express`, `lodsh` -> `lodash`).

3. **Disposable Package Age Inspection**  
   Queries npm registry creation dates; automatically halts installation if a package was registered less than 14 days ago (common supply-chain malware pattern).

4. **Lifecycle Script RCE Scanner & Sandbox**  
   Deep-scans `preinstall`, `install`, and `postinstall` scripts for dangerous payload patterns (`curl | sh`, `wget | sh`, `powershell -enc`, `rm -rf`, `eval(Buffer.from)`). Enforces `--ignore-scripts` sandbox by default.

5. **Interactive Trust Tier Classification**  
   Categorizes requested packages into 4 distinct security tiers and prompts for explicit user confirmation before installing unverified community packages.

6. **Exact Version Pinning (`--save-exact`)**  
   Pins exact package versions in your `package.json` to prevent malicious upstream supply-chain mutations from stealthily slipping into your builds.

7. **Automated Post-Install Audit**  
   Automatically triggers `npm audit` to verify the health of the entire dependency graph after installation.

8. **Live Package Information Cards & Notification Center**  
   Renders a clear terminal dashboard for each installed package displaying:
   - Package author, license, and weekly download volume
   - Public repository and official issue tracker
   - Security advisories, update alerts, and deprecation warnings
   - Zero-dependency footprint verification

---

## 💻 CLI Commands & Options

```bash
# Basic installation with full verification
safe-add <packages...>

# Install as development dependency
safe-add -D vitest @types/node

# Dry-run security inspection without installing
safe-add --check <package>
safe-add --dry-run <package>

# Auto-confirm in CI/CD non-interactive pipelines
safe-add -y <package>
safe-add --yes <package>

# Allow lifecycle scripts for verified packages needing native C++ builds
safe-add --allow-scripts <package>

# Force installation (bypass warnings)
safe-add --force <package>
```

---

## 📦 How to Publish as a Private Package to npmjs.org

This package is already pre-configured for private publishing with:
```json
"publishConfig": {
  "access": "restricted"
}
```

### Steps to Publish:

1. **Authenticate your machine with npm**:
   ```bash
   npm login
   ```

2. **Verify your active account**:
   ```bash
   npm whoami
   ```

3. **Publish to npmjs.com as a private package**:
   ```bash
   npm publish --access restricted
   ```

*(Requires an npm Pro or npm Teams/Organization subscription for private package hosting on npmjs.com).*

---

## 🔌 Programmatic API

You can also import `safe-add` directly into your Node.js scripts or build tools:

```javascript
const { install, checkTyposquatting, fetchNpmRegistryMetadata } = require('@gadhyare/safe-add');

// Inspect typosquatting
const typo = checkTyposquatting('lodsh'); // returns 'lodash'

// Install safely
await install(['express', '-D', 'vitest']);
```

---

## 📄 License

MIT © Maxamuud Xuseen
