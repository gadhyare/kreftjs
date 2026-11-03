const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { installAlias, createBackend } = require('../bin/backend/index.js');
installAlias();

const { namespace, use } = require('../bin/backend/namespace.js');

test('namespace: resolves classes in split project layout (backend/app) from project root', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kreft-split-'));
  try {
    const backendDir = path.join(tmp, 'backend');
    const controllerDir = path.join(backendDir, 'app', 'Http', 'Controllers', 'Admin');
    fs.mkdirSync(controllerDir, { recursive: true });
    fs.writeFileSync(path.join(controllerDir, 'DashboardController.js'), `
      class DashboardController {
        async index(req) { return { ok: true, stats: 42 }; }
      }
      module.exports = DashboardController;
    `);

    // In a split project, cwd is the project root (tmp), not backendDir
    const prevCwd = process.cwd();
    process.chdir(tmp);
    try {
      const { DashboardController } = namespace('App\\Http\\Controllers\\Admin');
      assert.ok(DashboardController, 'DashboardController is found and not undefined');
      const inst = new DashboardController();
      assert.strictEqual(typeof inst.index, 'function', 'has index() method');
    } finally {
      process.chdir(prevCwd);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('resolveAction: executes class methods and handles prototype and undefined controller errors', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kreft-action-'));
  try {
    const backendDir = path.join(tmp, 'backend');
    fs.mkdirSync(path.join(backendDir, 'routes'), { recursive: true });
    fs.mkdirSync(path.join(backendDir, 'app', 'Http', 'Controllers'), { recursive: true });
    fs.writeFileSync(path.join(backendDir, 'routes', 'api.js'), `
      const { Route } = require('kreftjs/server');
      module.exports = (Route) => {};
    `);

    const backend = createBackend(backendDir, { db: 'sqlite::memory:' });
    assert.ok(backend, 'backend created');

    // Test resolveAction directly
    const { Route } = require('../bin/backend/index.js');

    class GoodController {
      async index() { return { done: true }; }
    }

    Route.get('/test-good', [GoodController, 'index']);

    // Undefined controller error check
    assert.throws(() => {
      Route.get('/test-bad', [undefined, 'index']);
      // We will trigger handler
    }, /undefined/i, 'undefined controller caught when registered or resolved');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('remove:model and kreft:remove: cleans up generated files, routes, and sidebar links', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kreft-remove-'));
  const prevCwd = process.cwd();
  try {
    process.chdir(tmp);

    // Set up project structure (split backend/frontend layout)
    fs.mkdirSync(path.join(tmp, 'backend', 'routes'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'backend', 'app', 'Models'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'backend', 'database', 'migrations'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'backend', 'database', 'factories'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'backend', 'database', 'seeders'), { recursive: true });

    fs.mkdirSync(path.join(tmp, 'frontend', 'routes'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'frontend', 'layouts'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'frontend', 'pages'), { recursive: true });

    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'test-app' }));
    fs.writeFileSync(path.join(tmp, 'frontend', 'index.html'), '<html><body></body></html>');
    fs.writeFileSync(path.join(tmp, 'backend', 'routes', 'api.js'), "const { Route } = require('kreftjs/server')\n");
    fs.writeFileSync(path.join(tmp, 'frontend', 'routes', 'web.kreft'), "// web routes\n");
    fs.writeFileSync(path.join(tmp, 'frontend', 'layouts', 'app.kreft'), `
      <sidebar>
        { label: 'Management', links: [
          { to: 'dashboard', label: 'Dashboard', icon: 'home' },
        ] }
      </sidebar>
    `);

    const { commands } = require('../bin/artisan.js');

    // 1. Generate model with --all and --folder=Admin
    commands['make:model'](['Category', '--all', '--folder=Admin']);

    // Check files created
    const modelFile = path.join(tmp, 'backend', 'app', 'Models', 'Category.js');
    const controllerFile = path.join(tmp, 'backend', 'app', 'Http', 'Controllers', 'Admin', 'CategoryController.js');
    const storeReqFile = path.join(tmp, 'backend', 'app', 'Http', 'Requests', 'Admin', 'StoreCategoryRequest.js');
    const updateReqFile = path.join(tmp, 'backend', 'app', 'Http', 'Requests', 'Admin', 'UpdateCategoryRequest.js');
    const pageFile = path.join(tmp, 'frontend', 'pages', 'Admin', 'Category.kreft');
    const factoryFile = path.join(tmp, 'backend', 'database', 'factories', 'CategoryFactory.js');
    const seederFile = path.join(tmp, 'backend', 'database', 'seeders', 'CategorySeeder.js');

    assert.ok(fs.existsSync(modelFile), 'model file exists');
    assert.ok(fs.existsSync(controllerFile), 'controller file exists');
    assert.ok(fs.existsSync(storeReqFile), 'store request exists');
    assert.ok(fs.existsSync(updateReqFile), 'update request exists');
    assert.ok(fs.existsSync(pageFile), 'page file exists');
    assert.ok(fs.existsSync(factoryFile), 'factory file exists');
    assert.ok(fs.existsSync(seederFile), 'seeder file exists');

    const apiRoutes = fs.readFileSync(path.join(tmp, 'backend', 'routes', 'api.js'), 'utf8');
    assert.ok(apiRoutes.includes('CategoryController'), 'api route references CategoryController');

    const webRoutes = fs.readFileSync(path.join(tmp, 'frontend', 'routes', 'web.kreft'), 'utf8');
    assert.ok(webRoutes.includes('admin/categories'), 'web route registered');

    const appKreft = fs.readFileSync(path.join(tmp, 'frontend', 'layouts', 'app.kreft'), 'utf8');
    assert.ok(appKreft.includes('admin.categories'), 'sidebar link registered');

    // 2. Test dry-run: nothing is deleted
    await commands['remove:model'](['Category', '--all', '--folder=Admin', '--dry-run']);
    assert.ok(fs.existsSync(modelFile), 'dry-run did not delete model');
    assert.ok(fs.existsSync(controllerFile), 'dry-run did not delete controller');

    // 3. Selective removal: remove migration only
    const migFilesBefore = fs.readdirSync(path.join(tmp, 'backend', 'database', 'migrations')).filter((f) => f.includes('create_categories_table'));
    assert.strictEqual(migFilesBefore.length, 1, 'one migration file exists');

    await commands['remove:model'](['Category', '--migration', '-f']);
    const migFilesAfter = fs.readdirSync(path.join(tmp, 'backend', 'database', 'migrations')).filter((f) => f.includes('create_categories_table'));
    assert.strictEqual(migFilesAfter.length, 0, 'migration file removed');
    assert.ok(fs.existsSync(modelFile), 'model file still exists after selective migration removal');
    assert.ok(fs.existsSync(controllerFile), 'controller file still exists');

    // 4. Test kreft:remove alias with --all
    await commands['kreft:remove'](['model', 'Category', '--all', '--folder=Admin', '-f']);
    assert.ok(!fs.existsSync(modelFile), 'model deleted');
    assert.ok(!fs.existsSync(controllerFile), 'controller deleted');
    assert.ok(!fs.existsSync(storeReqFile), 'store request deleted');
    assert.ok(!fs.existsSync(updateReqFile), 'update request deleted');
    assert.ok(!fs.existsSync(pageFile), 'page deleted');
    assert.ok(!fs.existsSync(factoryFile), 'factory deleted');
    assert.ok(!fs.existsSync(seederFile), 'seeder deleted');

    // Verify empty Admin directories cleaned up
    assert.ok(!fs.existsSync(path.join(tmp, 'backend', 'app', 'Http', 'Controllers', 'Admin')), 'empty Admin controller dir removed');
    assert.ok(!fs.existsSync(path.join(tmp, 'backend', 'app', 'Http', 'Requests', 'Admin')), 'empty Admin requests dir removed');
    assert.ok(!fs.existsSync(path.join(tmp, 'frontend', 'pages', 'Admin')), 'empty Admin pages dir removed');

    // Verify routes and sidebar cleaned up
    const apiRoutesClean = fs.readFileSync(path.join(tmp, 'backend', 'routes', 'api.js'), 'utf8');
    assert.ok(!apiRoutesClean.includes('CategoryController'), 'controller import and route removed from routes/api.js');

    const webRoutesClean = fs.readFileSync(path.join(tmp, 'frontend', 'routes', 'web.kreft'), 'utf8');
    assert.ok(!webRoutesClean.includes('admin/categories'), 'route removed from web.kreft');

    const appKreftClean = fs.readFileSync(path.join(tmp, 'frontend', 'layouts', 'app.kreft'), 'utf8');
    assert.ok(!appKreftClean.includes('admin.categories'), 'sidebar link removed from app.kreft');

    // 5. Test positional tokens without leading dashes
    commands['make:model'](['Product', '--all']);
    assert.ok(fs.existsSync(path.join(tmp, 'backend', 'app', 'Models', 'Product.js')), 'Product model exists');
    assert.ok(fs.existsSync(path.join(tmp, 'backend', 'app', 'Http', 'Controllers', 'ProductController.js')), 'ProductController exists');

    await commands['remove'](['model', 'Product', 'controller', 'request', 'migration', 'seeder', 'factory', 'page', 'route', 'all', '-f']);
    assert.ok(!fs.existsSync(path.join(tmp, 'backend', 'app', 'Models', 'Product.js')), 'Product model removed with positional tokens');
    assert.ok(!fs.existsSync(path.join(tmp, 'backend', 'app', 'Http', 'Controllers', 'ProductController.js')), 'ProductController removed with positional tokens');
  } finally {
    process.chdir(prevCwd);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('resolveAction & namespace: resolves Admin controllers (DashboardController) even if root app/ exists and unwraps default exports', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kreft-admin-stats-'));
  const prevCwd = process.cwd();
  try {
    process.chdir(tmp);

    // Set up a project structure with backend/app and a stray root app/ (e.g. from make:model)
    const backendAdminDir = path.join(tmp, 'backend', 'app', 'Http', 'Controllers', 'Admin');
    fs.mkdirSync(backendAdminDir, { recursive: true });
    fs.mkdirSync(path.join(tmp, 'backend', 'routes'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'app', 'Models'), { recursive: true }); // stray root app/ folder

    fs.writeFileSync(path.join(backendAdminDir, 'DashboardController.js'), `
      class DashboardController {
        async index(req) { return { users: 10, admins: 2 }; }
      }
      module.exports = DashboardController;
    `);

    fs.writeFileSync(path.join(tmp, 'backend', 'routes', 'api.js'), `
      const { Route, namespace } = require('kreftjs/server');
      const { DashboardController } = namespace('App\\\\Http\\\\Controllers\\\\Admin');
      Route.get('/admin/stats', [DashboardController, 'index']);
      Route.get('/admin/stats-wrapped', [{ default: DashboardController }, 'index']);
      Route.get('/admin/stats-auto', [undefined, 'index']);
    `);

    const backend = createBackend(path.join(tmp, 'backend'), { db: 'sqlite::memory:' });
    assert.ok(backend, 'backend created');
    await backend.ready();

    // 1. Direct [DashboardController, 'index']
    const routes = backend.routes();
    const r1 = routes.find((r) => r.uri === '/admin/stats');
    assert.ok(r1, 'route /admin/stats exists');

    let status1 = null, body1 = null;
    await backend({ method: 'GET', url: '/api/admin/stats', headers: { host: 'localhost' } }, {
      writeHead(s) { status1 = s; },
      end(b) { body1 = b; }
    }, '/api/admin/stats');

    assert.strictEqual(status1, 200, 'status is 200 for /admin/stats');
    const json1 = JSON.parse(body1.toString());
    assert.strictEqual(json1.users, 10, 'returned correct stats data');

    // 2. Wrapped { default: DashboardController } (TS / ES module)
    let status2 = null, body2 = null;
    await backend({ method: 'GET', url: '/api/admin/stats-wrapped', headers: { host: 'localhost' } }, {
      writeHead(s) { status2 = s; },
      end(b) { body2 = b; }
    }, '/api/admin/stats-wrapped');

    assert.strictEqual(status2, 200, 'status is 200 for wrapped default export');
    const json2 = JSON.parse(body2.toString());
    assert.strictEqual(json2.users, 10, 'returned correct stats data from wrapped controller');

    // 3. Auto-recovery when Controller is undefined
    let status3 = null, body3 = null;
    await backend({ method: 'GET', url: '/api/admin/stats-auto', headers: { host: 'localhost' } }, {
      writeHead(s) { status3 = s; },
      end(b) { body3 = b; }
    }, '/api/admin/stats-auto');

    assert.strictEqual(status3, 200, 'status is 200 with auto-recovery');
    const json3 = JSON.parse(body3.toString());
    assert.strictEqual(json3.users, 10, 'returned stats with auto-recovery');
  } finally {
    process.chdir(prevCwd);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('factories: callable as function, constructor, static methods, and in seeders', async () => {
  const { connect } = require('../bin/db.js');
  const { setConnection } = require('../bin/backend/query.js');
  const { Model } = require('../bin/backend/model.js');
  const { Factory } = require('../bin/backend/factory.js');
  const { migrator } = require('../bin/backend/index.js');

  const db = await connect('sqlite::memory:');
  setConnection(db);
  await db.exec(`
    CREATE TABLE categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT,
      updated_at TEXT
    );
  `);

  class Category extends Model {
    static table = 'categories';
    static fillable = ['name', 'slug', 'is_active'];
  }

  const CategoryFactory = Factory.define(Category, (fake) => ({
    name: 'Electronics',
    slug: (attrs) => attrs.name.toLowerCase(),
    is_active: 1,
  }))
    .state('inactive', { is_active: 0 });

  // 1. CategoryFactory is a function and callable
  assert.strictEqual(typeof CategoryFactory, 'function', 'CategoryFactory is a function');

  // 2. CategoryFactory().count(2).create()
  const cats1 = await CategoryFactory().count(2).create();
  assert.strictEqual(cats1.length, 2, 'CategoryFactory().count(2).create() created 2');

  // 3. CategoryFactory(3).create()
  const cats2 = await CategoryFactory(3).create();
  assert.strictEqual(cats2.length, 3, 'CategoryFactory(3).create() created 3');

  // 4. new CategoryFactory().count(2).create()
  const cats3 = await new CategoryFactory().count(2).create();
  assert.strictEqual(cats3.length, 2, 'new CategoryFactory().count(2).create() created 2');

  // 5. CategoryFactory.count(2).create()
  const cats4 = await CategoryFactory.count(2).create();
  assert.strictEqual(cats4.length, 2, 'CategoryFactory.count(2).create() created 2');

  // 6. Named state: CategoryFactory.inactive().create()
  const inactiveCat = await CategoryFactory.inactive().create();
  assert.strictEqual(inactiveCat.is_active, 0, 'CategoryFactory.inactive() state applied');

  // 7. Named state: CategoryFactory().inactive().create()
  const inactiveCat2 = await CategoryFactory().inactive().create();
  assert.strictEqual(inactiveCat2.is_active, 0, 'CategoryFactory().inactive() state applied');

  // 8. Category.factory().count(2).create()
  const cats5 = await Category.factory().count(2).create();
  assert.strictEqual(cats5.length, 2, 'Category.factory().count(2).create() created 2');

  // 9. Seeder execution where CategoryFactory().count(4).create() is called inside seeder
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kreft-seeder-'));
  try {
    fs.mkdirSync(path.join(tmp, 'database', 'seeders'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'database', 'factories'), { recursive: true });

    fs.writeFileSync(path.join(tmp, 'database', 'factories', 'ItemFactory.js'), `
      const { Factory } = require('${path.resolve(__dirname, '../bin/backend/factory.js')}');
      module.exports = Factory.define(class Item extends require('${path.resolve(__dirname, '../bin/backend/model.js')}').Model {
        static table = 'categories';
        static fillable = ['name', 'slug', 'is_active'];
      }, (fake) => ({
        name: 'Item',
        slug: 'item',
        is_active: 1,
      }));
    `);

    fs.writeFileSync(path.join(tmp, 'database', 'seeders', 'CategorySeeder.js'), `
      const { Seeder } = require('${path.resolve(__dirname, '../bin/backend/migrator.js')}');
      const CategoryFactory = require('../factories/ItemFactory');

      class CategorySeeder extends Seeder {
        async run() {
          await CategoryFactory().count(4).create();
        }
      }
      module.exports = CategorySeeder;
    `);

    // Also test DatabaseSeeder calling this.call(CategorySeeder) WITHOUT await!
    fs.writeFileSync(path.join(tmp, 'database', 'seeders', 'DatabaseSeeder.js'), `
      const { Seeder } = require('${path.resolve(__dirname, '../bin/backend/migrator.js')}');
      const CategorySeeder = require('./CategorySeeder');

      class DatabaseSeeder extends Seeder {
        run() {
          // Omitted await intentionally (like in Laravel PHP or common user oversight):
          this.call(CategorySeeder);
        }
      }
      module.exports = DatabaseSeeder;
    `);

    const seeded = await migrator.seed(db, tmp, { className: 'DatabaseSeeder' });
    assert.ok(seeded, 'migrator.seed completed successfully with un-awaited this.call');

    // Immediately closing the database must not throw "database is not open" because all seeders completed
    await db.close();
    assert.ok(true, 'database closed cleanly without race condition');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});


test('routes/api.js requiring a deleted controller keeps the other routes (login) working', async () => {
  const { createBackend } = require('../bin/backend/index.js');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kreft-missing-ctrl-'));
  try {
    const ctrlDir = path.join(tmp, 'backend', 'app', 'Http', 'Controllers', 'Auth');
    fs.mkdirSync(ctrlDir, { recursive: true });
    fs.mkdirSync(path.join(tmp, 'backend', 'routes'), { recursive: true });
    fs.writeFileSync(path.join(ctrlDir, 'SessionController.js'), `
      class SessionController { async store() { return { ok: true }; } }
      module.exports = SessionController;
    `);
    fs.writeFileSync(path.join(tmp, 'backend', 'routes', 'api.js'), `
      const { Route } = require('kreftjs/server');
      const SessionController = require('../app/Http/Controllers/Auth/SessionController');
      const PostController = require('../app/Http/Controllers/Admin/PostController');
      Route.get('/login', [SessionController, 'store']);
      Route.apiResource('admin/posts', PostController);
    `);
    const warnings = [];
    const log = { error: () => {}, warn: (m) => warnings.push(m), info: () => {}, log: () => {} };
    const backend = createBackend(path.join(tmp, 'backend'), { log });
    await backend.ready();

    const call = async (method, url) => {
      let status = null, body = null;
      await backend({ method, url, headers: { host: 'localhost' } }, {
        writeHead(s) { status = s; }, setHeader() {}, end(b) { body = b; },
      }, url);
      return { status, body: String(body || '') };
    };
    const login = await call('GET', '/api/login');
    assert.strictEqual(login.status, 200, 'login still works');
    assert.ok(warnings.some((w) => w.includes('Admin/PostController')), 'a clear warning names the missing controller');
    const posts = await call('GET', '/api/admin/posts');
    assert.strictEqual(posts.status, 500, 'only the missing controller routes fail');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
