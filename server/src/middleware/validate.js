const validate = (schema) => async (req, res, next) => {
  try {
    req.body = await schema.validateAsync(req.body, { abortEarly: false });
    next();
  } catch (err) {
    return res.status(400).json({
      error: 'Validation error',
      details: err.details.map((d) => d.message),
    });
  }
};

module.exports = validate;
