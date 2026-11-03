/*
 * Fake data for factories and seeders, like Faker (no package needed).
 *
 *   fake.name()  fake.email()  fake.sentence()  fake.paragraph()  fake.number(1, 100)
 *   fake.boolean()  fake.date()  fake.uuid()  fake.phone()  fake.city()  fake.pick(['a', 'b'])
 *   fake.unique().email()   — never the same value twice (until fake.unique().reset())
 */
const crypto = require('crypto');

const FIRST = ['Maxamuud', 'Amina', 'Cabdi', 'Hodan', 'Faadumo', 'Yuusuf', 'Sahra', 'Ahmed', 'Layla', 'Omar', 'Noor', 'Ali', 'Ifrah', 'Khalid', 'Maryam', 'Hassan',
  'Sara', 'Daniel', 'Emma', 'Lucas', 'Mia', 'Noah', 'Olivia', 'Liam', 'Ava', 'Ethan', 'Zara', 'Ibrahim', 'Fatima', 'Yasmin', 'Adam', 'Hana'];
const LAST = ['Xussen', 'Cali', 'Yuusuf', 'Warsame', 'Jaamac', 'Faarax', 'Maxamed', 'Nuur', 'Aadan', 'Saleebaan', 'Ismaaciil', 'Osman',
  'Smith', 'Johnson', 'Garcia', 'Khan', 'Haddad', 'Mansour', 'Rahman', 'Novak', 'Silva', 'Kim', 'Ali', 'Farah'];
const WORDS = ('lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ' +
  'enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit ' +
  'voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum').split(' ');
const CITIES = ['Mogadishu', 'Hargeisa', 'Berbera', 'Kismayo', 'Garowe', 'Bosaso', 'Nairobi', 'Dubai', 'Cairo', 'Istanbul', 'London', 'Toronto', 'Doha', 'Riyadh'];
const COUNTRIES = ['Somalia', 'Kenya', 'Ethiopia', 'Djibouti', 'United Arab Emirates', 'Egypt', 'Turkey', 'United Kingdom', 'Canada', 'Qatar', 'Saudi Arabia'];
const COMPANIES = ['Hormuud', 'Dahabshiil', 'Telesom', 'Golis', 'Premier', 'Salaam', 'Amal', 'Juba', 'Horizon', 'Nile', 'Atlas', 'Sahan'];
const SUFFIX = ['Group', 'Ltd', 'Solutions', 'Trading', 'Services', 'Tech', 'Holdings'];
const DOMAINS = ['example.com', 'example.org', 'example.net'];

const CATEGORIES = [
  'Electronics', 'Computers & Accessories', 'Smartphones & Tablets', 'Home & Kitchen',
  'Fashion & Apparel', 'Health & Personal Care', 'Beauty & Cosmetics', 'Sports & Fitness',
  'Outdoor & Recreation', 'Books & Literature', 'Automotive', 'Toys & Games',
  'Groceries & Food', 'Software & Apps', 'Furniture & Interior', 'Jewelry & Watches',
  'Garden & Tools', 'Music & Audio', 'Video Games & Consoles', 'Office Supplies',
  'Pet Supplies', 'Travel & Luggage', 'Baby & Kids', 'Arts & Crafts', 'Industrial & Scientific',
  'Food & Beverages', 'Photography & Video', 'Smart Home', 'Watches & Accessories', 'Shoes & Footwear',
];
const DEPARTMENTS = [
  'Engineering', 'Product Management', 'Design & UX', 'Marketing', 'Sales',
  'Customer Support', 'Human Resources', 'Finance', 'Legal', 'Operations',
  'Research & Development', 'Information Technology', 'Quality Assurance',
];
const TAGS = [
  'technology', 'programming', 'ai', 'productivity', 'design', 'lifestyle',
  'business', 'startup', 'health', 'fitness', 'travel', 'food', 'gaming',
  'finance', 'education', 'news', 'minimalism', 'remote-work', 'trending', 'featured',
];
const PRODUCTS = [
  'Wireless Noise-Canceling Headphones', 'Mechanical Gaming Keyboard', 'Ultra-Wide 4K Gaming Monitor',
  'Stainless Steel Insulated Water Bottle', 'Smart Fitness Watch Series 5', 'Waterproof Portable Bluetooth Speaker',
  'Fast USB-C Multi-Port Charging Hub', 'Organic Cotton Crewneck T-Shirt', 'Minimalist RFID-Blocking Leather Wallet',
  'Ceramic Pour-Over Coffee Dripper', 'Anti-Blue Light Computer Glasses', 'Compact High-Capacity Power Bank 20000mAh',
  'HEPA Air Purifier for Home', 'Memory Foam Ergonomic Travel Pillow', 'Professional High-Carbon Chef Knife',
  'Adjustable Standing Desk Converter', 'Dimmable LED Desk Lamp with Wireless Charger', 'Waterproof Trail Running Backpack',
];
const BRANDS = [
  'Apple', 'Samsung', 'Sony', 'Nike', 'Adidas', 'Logitech', 'Anker', 'Bose',
  'Dell', 'Asus', 'Dyson', 'Philips', 'Lenovo', 'Canon', 'LG', 'Google',
];
const STATUSES = ['active', 'inactive', 'pending', 'draft', 'archived', 'published', 'completed'];

const int = (min, max) => {
  const lo = Math.ceil(Math.min(Number(min) || 0, Number(max) || 0));
  const hi = Math.floor(Math.max(Number(min) || 0, Number(max) || 0));
  return lo >= hi ? lo : lo + crypto.randomInt(hi - lo + 1);
};
const pick = (list) => list[crypto.randomInt(list.length)];
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const slugify = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const dotSlug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '');

function makeFake() {
  const f = {
    number: (min = 0, max = 9999) => int(min, max),
    float: (min = 0, max = 1000, digits = 2) => Number((min + Math.random() * (max - min)).toFixed(digits)),
    boolean: (chance = 50) => crypto.randomInt(100) < chance,
    pick, oneOf: pick,
    some: (list, n = 2) => [...list].sort(() => Math.random() - 0.5).slice(0, n),
    firstName: () => pick(FIRST),
    lastName: () => pick(LAST),
    name: () => `${pick(FIRST)} ${pick(LAST)}`,
    userName: () => dotSlug(`${pick(FIRST)}${int(1, 999)}`),
    email: () => `${dotSlug(pick(FIRST))}.${dotSlug(pick(LAST))}${int(1, 9999)}@${pick(DOMAINS)}`,
    safeEmail: () => f.email(),
    phone: () => `+252 6${int(1, 9)} ${int(100, 999)} ${int(1000, 9999)}`,
    city: () => pick(CITIES),
    country: () => pick(COUNTRIES),
    address: () => `${int(1, 999)} ${pick(WORDS)} ${pick(['Road', 'Street', 'Avenue'])}, ${pick(CITIES)}`,
    company: () => `${pick(COMPANIES)} ${pick(SUFFIX)}`,
    category: () => pick(CATEGORIES),
    department: () => pick(DEPARTMENTS),
    product: () => pick(PRODUCTS),
    productName: () => pick(PRODUCTS),
    tag: () => pick(TAGS),
    brand: () => pick(BRANDS),
    sku: (prefix = 'SKU') => `${prefix}-${int(1000, 9999)}-${pick(['A', 'B', 'X', 'PRO', 'PLUS'])}`,
    price: (min = 9.99, max = 499.99) => Number((min + Math.random() * (max - min)).toFixed(2)),
    status: (customList) => pick(Array.isArray(customList) && customList.length ? customList : STATUSES),
    word: () => pick(WORDS),
    words: (n = 3) => Array.from({ length: n }, () => pick(WORDS)).join(' '),
    sentence: (n = int(6, 12)) => cap(f.words(n)) + '.',
    paragraph: (n = int(3, 6)) => Array.from({ length: n }, () => f.sentence()).join(' '),
    paragraphs: (n = 3) => Array.from({ length: n }, () => f.paragraph()).join('\n\n'),
    text: (max = 200) => f.paragraph().slice(0, max),
    title: () => cap(f.words(int(2, 5))),
    slug: (arg = 3) => {
      if (typeof arg === 'string') return slugify(arg);
      const n = typeof arg === 'number' ? arg : 3;
      return slugify(f.words(n));
    },
    smart: (col, modelName = '') => {
      const c = String(col || '').toLowerCase();
      const m = String(modelName || '').toLowerCase();
      if (c === 'name' || c === 'title') {
        if (m.includes('category')) return f.category();
        if (m.includes('department')) return f.department();
        if (m.includes('product') || m.includes('item')) return f.product();
        if (m.includes('tag')) return f.tag();
        if (m.includes('brand') || m.includes('company')) return f.company();
        if (m.includes('post') || m.includes('article')) return f.title();
        return f.name();
      }
      if (c === 'slug') {
        if (m.includes('category')) return slugify(f.category());
        if (m.includes('tag')) return slugify(f.tag());
        if (m.includes('product')) return slugify(f.product());
        return f.slug();
      }
      if (c === 'price' || c === 'cost' || c === 'amount') return f.price();
      if (c === 'sku' || c === 'code') return f.sku();
      if (c === 'status') return f.status();
      if (c.includes('email')) return f.email();
      if (c.includes('phone')) return f.phone();
      if (c.includes('city')) return f.city();
      if (c.includes('country')) return f.country();
      if (c.includes('address')) return f.address();
      if (c.includes('image') || c.includes('avatar')) return f.imageUrl();
      if (c.includes('description') || c.includes('summary')) return f.sentence();
      if (c.includes('content') || c.includes('body')) return f.paragraph();
      if (c.startsWith('is_') || c.startsWith('has_')) return true;
      return f.word();
    },
    url: () => `https://${pick(DOMAINS)}/${f.slug(2)}`,
    imageUrl: (w = 640, h = 480) => `https://picsum.photos/seed/${int(1, 100000)}/${w}/${h}`,
    color: () => '#' + crypto.randomBytes(3).toString('hex'),
    uuid: () => crypto.randomUUID(),
    password: (n = 12) => crypto.randomBytes(n).toString('base64url').slice(0, n),
    // dates as 'YYYY-MM-DD HH:MM:SS' (how the database keeps them)
    date: (from = '-1 year', to = 'now') => {
      const UNITS = { second: 1e3, minute: 6e4, hour: 36e5, day: 864e5, week: 6048e5, month: 2592e6, year: 31536e6 };
      const span = (s) => {
        if (s instanceof Date) return s.getTime();
        if (typeof s === 'number' && Number.isFinite(s)) return s;
        const str = String(s || 'now').trim();
        if (str === 'now') return Date.now();
        const numMatch = str.match(/-?\d+/);
        const unitMatch = str.match(/second|minute|hour|day|week|month|year/i);
        if (numMatch && unitMatch) {
          return Date.now() + Number(numMatch[0]) * UNITS[unitMatch[0].toLowerCase()];
        }
        const parsed = Date.parse(str);
        return Number.isNaN(parsed) ? Date.now() : parsed;
      };
      const t = int(Math.min(span(from), span(to)), Math.max(span(from), span(to)));
      return new Date(t).toISOString().slice(0, 19).replace('T', ' ');
    },
    pastDate: () => f.date('-1 year', 'now'),
    futureDate: () => f.date('now', '+1 year'),
  };
  // fake.unique().email(): tries again until the value is new
  let seen = new Map();
  f.unique = () => new Proxy({}, {
    get(_, name) {
      if (name === 'reset') return () => { seen = new Map(); };
      return (...args) => {
        const set = seen.get(name) || new Set();
        seen.set(name, set);
        for (let i = 0; i < 1000; i++) { const v = f[name](...args); if (!set.has(v)) { set.add(v); return v; } }
        throw new Error(`fake.unique().${String(name)}() ran out of new values`);
      };
    },
  });
  return f;
}

module.exports = { fake: makeFake(), makeFake };
