function sendSuccess(res, data = null, message = "", statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
    message
  });
}

function sendError(res, statusCode = 500, message = "Server error", details) {
  return res.status(statusCode).json({
    success: false,
    data: null,
    message,
    details
  });
}

module.exports = { sendSuccess, sendError };

