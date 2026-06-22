function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  const statusCode = error.statusCode || 500;

  return res.status(statusCode).json({
    error: error.message || "Something went wrong",
    statusCode,
  });
}

module.exports = { errorHandler };
