/*
 * Form requests and API resources: validation and JSON transformation.
 *
 *   // app/Http/Requests/StorePostRequest.js
 *   class StorePostRequest extends FormRequest {
 *     authorize(req) { return req.user != null }                       // false → 403
 *     rules(req) { return { title: 'required|max:200', body: 'required' } }
 *     messages() { return { 'title.required': 'Give the post a title.' } }
 *     prepareForValidation(data) { return { ...data, title: String(data.title || '').trim() } }
 *   }
 *   const data = await StorePostRequest.validate(req)                // in a controller
 *
 *   // app/Http/Resources/PostResource.js
 *   class PostResource extends JsonResource {
 *     toArray(req) { return { id: this.id, title: this.title, author: new UserResource(this.user), comments: this.whenLoaded('comments') } }
 *   }
 *   return new PostResource(post)                  // { data: { … } }
 *   return PostResource.collection(posts)          // { data: [ … ] }  (a paginate() result keeps its meta)
 */
const { HttpError } = require('./http.js');

class FormRequest {
  authorize() { return true; }
  rules() { return {}; }
  messages() { return {}; }
  attributes() { return {}; }
  prepareForValidation(data) { return data; }
  static async validate(req) {
    const f = new this();
    if (!(await f.authorize(req))) throw new HttpError(403, 'This action is unauthorized.');
    const prepared = await f.prepareForValidation({ ...(req.body && typeof req.body === 'object' ? req.body : {}) });
    if (prepared && typeof prepared === 'object') req.body = prepared;
    return req.validate(await f.rules(req), f.messages(), f.attributes());
  }
}

const MISSING = Symbol('missing');
class JsonResource {
  static wrap = 'data';
  constructor(resource) { this.resource = resource; return new Proxy(this, { get: (t, k) => (k in t ? t[k] : t.resource == null ? undefined : t.resource[k]) }); }
  toArray() { return this.resource && typeof this.resource.toJSON === 'function' ? this.resource.toJSON() : this.resource; }
  // only when the relation was loaded with with(…)
  whenLoaded(name, value) { const r = this.resource; return r && r.__relations && r.__relations[name] ? (value === undefined ? r[name] : value) : MISSING; }
  when(condition, value) { return condition ? (typeof value === 'function' ? value() : value) : MISSING; }
  resolve(req) { return clean(this.resource == null ? null : this.toArray(req)); }
  toJSON() { const W = this.constructor.wrap; const data = this.resolve(null); return W ? { [W]: data } : data; }
  static collection(items) { return new ResourceCollection(items, this); }
  static make(resource) { return new this(resource); }
}
class ResourceCollection {
  constructor(items, Resource) { this.items = items; this.Resource = Resource; }
  toJSON() {
    const paged = this.items && !Array.isArray(this.items) && Array.isArray(this.items.data);
    const list = (paged ? this.items.data : this.items || []).map((x) => new this.Resource(x).resolve(null));
    if (!paged) return { data: list };
    const { data, ...meta } = this.items;
    return { data: list, meta };
  }
}
// leaves out whenLoaded()/when() values that aren't there; resources inside resources become their data
function clean(v) {
  if (v === MISSING) return MISSING;
  if (v instanceof JsonResource) return v.resolve(null);
  if (v instanceof ResourceCollection) return v.toJSON().data;
  if (Array.isArray(v)) return v.map(clean).filter((x) => x !== MISSING);
  if (v && typeof v === 'object' && !(v instanceof Date) && v.constructor === Object) {
    const out = {};
    for (const [k, x] of Object.entries(v)) { const c = clean(x); if (c !== MISSING) out[k] = c; }
    return out;
  }
  return v;
}

module.exports = { FormRequest, JsonResource, ResourceCollection };
