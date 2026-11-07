/*
 * Home pages made for apps, not for the web:
 *
 *   kreft new my-app --mobile      the home page is a phone screen: top bar, cards, big touch targets, bottom tab bar
 *   kreft new my-app --electron    the home page is a desktop workspace: sidebar, toolbar, cards, shortcuts
 *   kreft make:home --mobile | --desktop     (re)write them in an existing project (replaces pages/Home.kreft)
 *
 * Both together: pages/Home.kreft shows the desktop one inside the Electron window and the phone one everywhere else.
 * Add ?platform=mobile or ?platform=desktop to the address to preview either in a normal browser.
 *
 * The generated files are plain .kreft files in the project: change them freely.
 */
const fs = require('fs');
const path = require('path');

// what the project has: no-auth projects have no dashboard, users or profile pages
function features(front) {
  const has = (f) => fs.existsSync(path.join(front, f));
  return { dashboard: has('pages/Dashboard.kreft'), users: has('pages/Users.kreft'), profile: has('pages/Profile.kreft'), docs: has('docs/Docs.kreft'), auth: has('pages/auth') };
}

const js = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

function mobileSource(f, { standalone = false } = {}) {
  const tiles = [
    f.dashboard && { icon: 'grid', label: 'Dashboard', to: '/dashboard' },
    f.users && { icon: 'users', label: 'Users', to: '/users' },
    f.profile && { icon: 'user', label: 'Profile', to: '/profile' },
    f.docs && { icon: 'book', label: 'Docs', to: '/docs' },
    { icon: 'warning', label: 'Errors', to: '/error-monitor' },
    { icon: 'code', label: 'Components', to: '/edge' },
  ].filter(Boolean);
  const tabs = [{ icon: 'home', label: 'Home', to: '/' }, ...tiles.filter((t) => !['/error-monitor', '/edge'].includes(t.to)).slice(0, 3)];
  const bars = standalone ? {
    top: '\n    <template k-slot:top><edge-top-bar title={app} center></edge-top-bar></template>',
    bottom: '\n    <template k-slot:bottom><edge-bottom-nav items={tabs}></edge-bottom-nav></template>',
    open: '<edge-shell>', close: '</edge-shell>',
  } : { top: '', bottom: '', open: '<div>', close: '</div>' };
  return `<!-- The home page of the phone app, built from the edge components (components/edge/).
     ${standalone ? 'It draws its own top bar and bottom bar.' : 'The top bar and the bottom bar come from layouts/mobile.kreft and never move; only this page scrolls.'}
     @tap, @swipeleft and @longpress are Kreft's touch events. Add ?platform=mobile in a browser to preview it. -->

state app = Kreftjs.env.PUBLIC_APP_NAME || 'My app'
state tiles = ${js(tiles)}${standalone ? `\nstate tabs = ${js(tabs)}` : ''}
state taps = 0
state note = 'Tap the card. Swipe left to reset. Hold to double.'
state hour = new Date().getHours()
derive greeting = hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
derive platform = Kreftjs.native ? Kreftjs.native.platform() : 'web'

action hit() { taps++; note = 'Tapped ' + taps + (taps === 1 ? ' time' : ' times') }
action reset() { taps = 0; note = 'Reset by swipe' }
action boost() { taps = taps * 2; note = 'Doubled by long press' }

<view>
  ${bars.open}${bars.top}
    <section class="page">
      <div class="hero">
        <p class="hi">{greeting}<span k-if="$store.auth && $store.auth.user">, {$store.auth.user.name}</span></p>
        <h2>What do you want to do?</h2>
        <span class="chip">Running on <b>{platform}</b></span>
      </div>

      <div class="grid">
        <edge-pressable k-each="(t, i) in tiles" k-key="t.to" feedback="scale" haptics @press="$router.go(t.to)">
          <div class="tile" :style="{ animationDelay: (i * 60) + 'ms' }"><edge-icon name={t.icon} size={28}></edge-icon><edge-text weight={600}>{t.label}</edge-text></div>
        </edge-pressable>
      </div>

      <edge-gesture-area @tap="hit()" @swipeleft="reset()" @longpress="boost()">
        <div class="card try">
          <edge-text size="sm" muted>Touch events</edge-text>
          <edge-text size="2xl" weight={800}>{taps}</edge-text>
          <edge-text size="sm" muted>{note}</edge-text>
        </div>
      </edge-gesture-area>

      <div class="card">
        <edge-text size="sm" muted>This app</edge-text>
        <edge-text>One Kreft codebase: the website, the phone app and the desktop app.</edge-text>
      </div>
    </section>${bars.bottom}
  ${bars.close}
</view>

<style scoped>
.page { display: flex; flex-direction: column; gap: 16px; padding: 16px 16px 24px; }
.hero { position: relative; overflow: hidden; padding: 22px 20px; border-radius: 22px; color: #fff; background: linear-gradient(135deg, var(--edge-accent), color-mix(in srgb, var(--edge-accent) 45%, #7c3aed)); }
.hero::before, .hero::after { content: ''; position: absolute; border-radius: 50%; background: rgba(255, 255, 255, .13); }
.hero::before { width: 150px; height: 150px; right: -40px; top: -50px; }
.hero::after { width: 90px; height: 90px; right: 50px; bottom: -45px; }
.hero > * { position: relative; }
.hi { margin: 0 0 4px; font-size: 14px; color: rgba(255, 255, 255, .85); }
.hero h2 { margin: 0 0 14px; color: #fff; font-size: 26px; line-height: 1.2; letter-spacing: -0.03em; }
.chip { display: inline-block; padding: 4px 12px; border-radius: 999px; background: rgba(255, 255, 255, .2); font-size: 12px; font-weight: 500; }
.chip b { font-weight: 700; text-transform: capitalize; }
.grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.tile { animation: tile-in .45s ease both; display: flex; flex-direction: column; justify-content: space-between; gap: 18px; min-height: 104px; padding: 16px; background: var(--edge-card); border: 1px solid var(--edge-border); border-radius: var(--edge-radius); }
.card { display: flex; flex-direction: column; gap: 4px; padding: 18px; background: var(--edge-card); border: 1px solid var(--edge-border); border-radius: var(--edge-radius); }
.try { align-items: center; text-align: center; user-select: none; -webkit-user-select: none; }
@keyframes tile-in { from { opacity: 0; transform: translateY(14px) scale(.96); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .tile { animation: none; } }
</style>
`;
}

function desktopSource(f) {
  const nav = [
    { label: 'Home', to: '/' },
    f.dashboard && { label: 'Dashboard', to: '/dashboard' },
    f.users && { label: 'Users', to: '/users' },
    f.profile && { label: 'Profile', to: '/profile' },
    f.docs && { label: 'Docs', to: '/docs' },
    { label: 'Error monitor', to: '/error-monitor' },
  ].filter(Boolean);
  return `<!-- The home page of the desktop app: a sidebar, a toolbar and a workspace, like a real desktop program.
     Inside the Electron window window.kreftDesktop gives the app name, version and system.
     Add ?platform=desktop in a browser to preview it. -->

state app = Kreftjs.env.PUBLIC_APP_NAME || 'My app'
state nav = ${js(nav)}
state query = ''
state info = { name: app, version: '', platform: 'browser' }
state shortcuts = [
  { keys: 'F12', does: 'Open or close the developer tools' },
  { keys: 'Ctrl / ⌘ + R', does: 'Reload the window' },
  { keys: 'Ctrl / ⌘ + +  /  −', does: 'Zoom in and out' },
  { keys: 'F11', does: 'Full screen' },
]
derive shown = nav.filter((n) => n.label.toLowerCase().includes(query.trim().toLowerCase()))

on ready {
  if (window.kreftDesktop && window.kreftDesktop.getInfo) {
    window.kreftDesktop.getInfo().then((i) => { info = { name: i.name, version: i.version, platform: i.platform + ' ' + i.arch } }).catch(() => {})
  }
}

<view>
  <div class="shell">
    <aside class="side">
      <div class="brand"><img src="logo-mark.svg" alt="" width="22" height="22"><span>{app}</span></div>
      <nav aria-label="Main">
        <kreft-link k-for="n in nav" to={n.to} class="item" active-class="on" exact-active-class="on">{n.label}</kreft-link>
      </nav>
      <p class="foot">{info.name} {info.version}<br>{info.platform}</p>
    </aside>

    <section class="work">
      <header class="toolbar">
        <h1>Home</h1>
        <input type="search" placeholder="Search pages…" k-model="query" aria-label="Search pages">
      </header>

      <div class="content">
        <div class="cards">
          <article class="card"><p class="small">Application</p><p class="big">{info.name}</p></article>
          <article class="card"><p class="small">Version</p><p class="big">{info.version || 'dev'}</p></article>
          <article class="card"><p class="small">System</p><p class="big">{info.platform}</p></article>
        </div>

        <h2>Open</h2>
        <div class="list">
          <kreft-link k-for="n in shown" to={n.to} class="row"><span>{n.label}</span><span class="arrow">→</span></kreft-link>
          <p k-if="shown.length === 0" class="empty">No page matches “{query}”.</p>
        </div>

        <h2>Shortcuts</h2>
        <table class="keys">
          <tr k-for="s in shortcuts"><td><kbd>{s.keys}</kbd></td><td>{s.does}</td></tr>
        </table>
      </div>
    </section>
  </div>
</view>

<style scoped>
.shell { display: grid; grid-template-columns: 232px 1fr; height: 100vh; background: var(--background); color: var(--foreground); }
.side { display: flex; flex-direction: column; gap: 8px; padding: 16px 12px; background: var(--accent); border-right: 1px solid var(--border); overflow: auto; }
.brand { display: flex; align-items: center; gap: 8px; padding: 4px 8px 12px; font-weight: 700; letter-spacing: -0.02em; }
.item { display: block; padding: 8px 10px; border-radius: 6px; color: var(--muted); text-decoration: none; font-size: 14px; }
.item:hover { background: var(--accent-strong); color: var(--foreground); }
.item.on { background: var(--accent-strong); color: var(--foreground); font-weight: 600; }
.foot { margin: auto 0 0; padding: 8px; font-size: 12px; color: var(--muted); }
.work { display: flex; flex-direction: column; min-width: 0; }
.toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 24px; border-bottom: 1px solid var(--border); }
.toolbar h1 { margin: 0; font-size: 18px; }
.toolbar input { width: 260px; max-width: 50%; }
.content { padding: 24px; overflow: auto; }
.content h2 { margin: 28px 0 12px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; }
.card { padding: 16px; background: var(--card); border: 1px solid var(--card-border); border-radius: var(--radius-lg); }
.small { margin: 0 0 4px; font-size: 12px; color: var(--muted); }
.big { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.02em; overflow-wrap: anywhere; }
.list { border: 1px solid var(--card-border); border-radius: var(--radius-lg); overflow: hidden; }
.row { display: flex; justify-content: space-between; padding: 12px 16px; color: var(--foreground); text-decoration: none; border-bottom: 1px solid var(--border-subtle); }
.row:last-child { border-bottom: 0; }
.row:hover { background: var(--accent); }
.arrow { color: var(--muted); }
.empty { margin: 0; padding: 12px 16px; color: var(--muted); }
.keys { border-collapse: collapse; }
.keys td { padding: 6px 24px 6px 0; font-size: 14px; }
kbd { padding: 2px 6px; border: 1px solid var(--border); border-radius: 4px; background: var(--accent); font-size: 12px; }
@media (max-width: 720px) { .shell { grid-template-columns: 1fr; height: auto; } .side { border-right: 0; border-bottom: 1px solid var(--border); } }
</style>
`;
}

// pages/Home.kreft: the platform switch when both exist, otherwise the one that exists
function homeSource(mobile, desktop) {
  if (mobile && desktop) {
    return `<!-- The home page: the desktop workspace inside the Electron window, the phone screen everywhere else.
     Preview in a browser with ?platform=desktop or ?platform=mobile. -->
state desktop = (function () {
  const asked = new URLSearchParams(location.search).get('platform')
  if (asked) return asked === 'desktop'
  return Boolean(window.kreftDesktop || window.__KREFT_ELECTRON__)
})()

<view>
  <home-desktop k-if="desktop"></home-desktop>
  <home-mobile k-else></home-mobile>
</view>
`;
  }
  return `<!-- The home page of the ${mobile ? 'phone' : 'desktop'} app. Its design is in components/${mobile ? 'HomeMobile' : 'HomeDesktop'}.kreft -->
<view>
  <home-${mobile ? 'mobile' : 'desktop'}></home-${mobile ? 'mobile' : 'desktop'}>
</view>
`;
}

// index.html lists every component: .component('Field', 'components/Field.kreft')
function register(front, names) {
  const file = path.join(front, 'index.html');
  if (!fs.existsSync(file)) return;
  let html = fs.readFileSync(file, 'utf8');
  const add = names.filter((n) => !html.includes(`.component('${n}'`));
  if (!add.length) return;
  const lines = add.map((n) => `.component('${n}', 'components/${n}.kreft')`);
  const m = html.match(/^([ \t]*)\.component\(/m) || html.match(/^([ \t]*)\.use\(router\)/m);
  if (!m) { console.warn('  Could not find where components are listed in index.html. Add: ' + lines.join(' ')); return; }
  const indent = m[1];
  html = html.replace(m[0], lines.map((l) => indent + l + '\n').join('') + m[0]);
  fs.writeFileSync(file, html);
}

// existing: what a project that already had one of them keeps when the other is added
function apply(target, { mobile = false, desktop = false } = {}) {
  const lay = require('./layout.js').layout(target);
  const front = lay.frontend;
  if (mobile) require('./mobile-ui.js').install(target, {}); // the phone home page is made of edge components
  const f = features(front);
  fs.mkdirSync(path.join(front, 'components'), { recursive: true });
  fs.mkdirSync(path.join(front, 'pages'), { recursive: true });
  const has = (n) => fs.existsSync(path.join(front, 'components', n));
  const wantMobile = mobile || has('HomeMobile.kreft');
  const wantDesktop = desktop || has('HomeDesktop.kreft');
  if (mobile) fs.writeFileSync(path.join(front, 'components', 'HomeMobile.kreft'), mobileSource(f, { standalone: (wantMobile && wantDesktop) || !fs.existsSync(path.join(front, 'layouts', 'mobile.kreft')) }));
  if (desktop) fs.writeFileSync(path.join(front, 'components', 'HomeDesktop.kreft'), desktopSource(f));
  fs.writeFileSync(path.join(front, 'pages', 'Home.kreft'), homeSource(wantMobile, wantDesktop));
  register(front, [wantMobile && 'HomeMobile', wantDesktop && 'HomeDesktop'].filter(Boolean));
  return { mobile: wantMobile, desktop: wantDesktop };
}

function make(args = []) {
  const mobile = args.includes('--mobile'), desktop = args.includes('--desktop') || args.includes('--electron');
  if (!mobile && !desktop) { console.error('  Use kreft make:home --mobile or --desktop (or both).'); process.exit(1); }
  const r = apply(process.cwd(), { mobile, desktop });
  console.log(`  Wrote the ${[r.mobile && 'phone', r.desktop && 'desktop'].filter(Boolean).join(' and ')} home page (pages/Home.kreft and components/).`);
}

module.exports = { apply, make, mobileSource, desktopSource, homeSource, features };
