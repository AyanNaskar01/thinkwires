/**
 * Sanitizes input objects in-place to prevent NoSQL query selector injection and prototype pollution.
 * Compatible with Express 5 where req.query is a getter-only property.
 * Recursively deletes any keys starting with '$' or containing '.' across req.body, req.query, and req.params.
 */
export const sanitizeInputs = (req, res, next) => {
  const sanitizeInPlace = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    for (const key of Object.keys(obj)) {
      if (key.startsWith('$') || key.includes('.')) {
        delete obj[key];
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        sanitizeInPlace(obj[key]);
      }
    }
  };

  if (req.body && typeof req.body === 'object') {
    sanitizeInPlace(req.body);
  }
  if (req.query && typeof req.query === 'object') {
    sanitizeInPlace(req.query);
  }
  if (req.params && typeof req.params === 'object') {
    sanitizeInPlace(req.params);
  }

  next();
};

export default sanitizeInputs;
