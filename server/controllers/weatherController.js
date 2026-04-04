const { asyncHandler } = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/responseHandler");
const { getCityWeatherForUser } = require("../services/weatherService");

const getCityWeather = asyncHandler(async (req, res) => {
  try {
    const data = await getCityWeatherForUser(req.user, req.params.city);
    return sendSuccess(res, data, "Weather fetched successfully");
  } catch (err) {
    if (err?.response?.status === 404) {
      const notFoundError = new Error("City not found");
      notFoundError.statusCode = 404;
      throw notFoundError;
    }
    throw err;
  }
});

module.exports = { getCityWeather };


