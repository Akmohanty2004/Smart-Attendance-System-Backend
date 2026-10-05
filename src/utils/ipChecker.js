const requestIp = require('request-ip');
const ipRangeCheck = require('ip-range-check');

function normalizeIp(ip) {
  if (!ip) return '127.0.0.1';
  let clean = String(ip).trim();

  // If multiple IPs in X-Forwarded-For header, take the first client IP
  if (clean.includes(',')) {
    clean = clean.split(',')[0].trim();
  }

  // Strip port if present (e.g. 192.168.1.1:5000)
  if (clean.includes(':') && !clean.includes('::')) {
    clean = clean.split(':')[0].trim();
  }

  // Handle IPv6 mapped IPv4 address (e.g. ::ffff:49.42.176.70)
  if (clean.startsWith('::ffff:')) {
    clean = clean.replace('::ffff:', '');
  }

  if (clean === '::1') return '127.0.0.1';
  return clean;
}

function getClientIp(req) {
  let rawIp = '';
  // Prioritize headers used by Vercel and reverse proxies
  if (req.headers && req.headers['x-real-ip']) {
    rawIp = req.headers['x-real-ip'];
  } else if (req.headers && req.headers['x-forwarded-for']) {
    rawIp = req.headers['x-forwarded-for'].split(',')[0].trim();
  } else {
    rawIp = requestIp.getClientIp(req) || req.ip || req.connection?.remoteAddress || '127.0.0.1';
  }
  return normalizeIp(rawIp);
}

function ipToLong(ip) {
  return ip.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct, 10), 0) >>> 0;
}

function checkSingleMatch(clientIp, range) {
  const cleanRange = range.trim();
  if (!cleanRange) return false;

  // 1. Direct exact IP match
  if (clientIp === cleanRange) return true;

  // 2. Hyphen range: e.g. 192.168.0.0 - 192.168.0.255
  if (cleanRange.includes('-')) {
    const [start, end] = cleanRange.split('-').map(s => s.trim());
    if (start && end) {
      try {
        const ipNum = ipToLong(clientIp);
        const startNum = ipToLong(start);
        const endNum = ipToLong(end);
        if (ipNum >= startNum && ipNum <= endNum) return true;
      } catch (e) {}
    }
  }

  // 3. Wildcard: e.g. 49.42.176.* or 192.168.*
  if (cleanRange.includes('*')) {
    const prefix = cleanRange.replace('*', '').trim();
    if (clientIp.startsWith(prefix)) return true;
  }

  // 4. Standard CIDR subnet match via ip-range-check (e.g. 192.168.0.0/24)
  try {
    if (ipRangeCheck(clientIp, cleanRange)) return true;
  } catch (err) {}

  return false;
}

function isIpAllowed(ip, allowedRanges = [], allowAnyIpForDemo = false) {
  if (allowAnyIpForDemo) return true;
  const cleanIp = normalizeIp(ip);

  // Localhost always allowed for local development convenience
  if (cleanIp === '127.0.0.1' || cleanIp === 'localhost') return true;

  // Add default ranges if empty
  const rangesToTest = (allowedRanges && allowedRanges.length > 0)
    ? allowedRanges
    : ['192.168.0.0/24', '10.0.0.0/8', '127.0.0.1'];

  for (const r of rangesToTest) {
    if (typeof r === 'string' && checkSingleMatch(cleanIp, r)) {
      return true;
    }
  }

  return false;
}

module.exports = {
  normalizeIp,
  getClientIp,
  isIpAllowed
};
