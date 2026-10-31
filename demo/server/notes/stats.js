// GET /api/notes/stats — your own SQL next to the automatic /api/notes table API
// (a file in server/ wins over a table with the same address)
exports.get = async (ctx) => {
  if (!ctx.db) ctx.fail(503, 'Start the dev server with --db to use the database here.')
  const [row] = await ctx.db.query('SELECT COUNT(*) AS total, MAX(id) AS newest FROM notes')
  return { total: Number(row.total), newest: row.newest }
}
