// Small helpers shared across every routes/*.js module.
'use strict';
const PH = require('./session');

function requirePhAuth(req) { return PH.get(req); }

function fail(send, res, status, message) { return send(res, status, { ok: false, error: message }); }

function pagination(searchParams, allowedSizes) {
  const page = Math.max(1, parseInt(searchParams.get('page'), 10) || 1);
  const requested = parseInt(searchParams.get('pageSize'), 10);
  const sizes = allowedSizes || [10, 25, 50, 100];
  const pageSize = sizes.includes(requested) ? requested : sizes[0];
  return { page, pageSize, offset: (page - 1) * pageSize };
}

module.exports = { requirePhAuth, fail, pagination };
