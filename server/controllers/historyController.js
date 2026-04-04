const SearchHistory = require("../models/SearchHistory");

async function getHistory(req, res, next) {
  try {
    const limit = Math.min(Number(req.query.limit || 20), 100);

    const history = await SearchHistory.find({ userId: req.user._id })
      .sort({ date: -1 })
      .limit(limit)
      .select("city date");

    res.json({ items: history });
  } catch (err) {
    next(err);
  }
}

module.exports = { getHistory };

