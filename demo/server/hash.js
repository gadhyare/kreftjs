// POST /api/hash { text, algorithm } — Node's crypto package, with the same rules as the forms
const crypto = require('crypto')

exports.post = (ctx) => {
  const { text, algorithm } = ctx.validate(ctx.body, {
    text: 'required|max:500',
    algorithm: 'required|in:sha256,sha1,md5',
  })
  return { algorithm, hash: crypto.createHash(algorithm).update(text).digest('hex') }
}
