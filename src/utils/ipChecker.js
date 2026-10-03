const requestIp = require('request-ip');
const ipRangeCheck = require('ip-range-check');

function normalizeIp(ip) {
  if (!ip) return '127.0.0.1';
  // Handle IPv6 mapped IPv4 address
  if (ip.startsWith('::ffff:')) {
    return ip.replace('::ffff:', '');
  }
  if (ip === '::1') return '127.0.0.1';
  return ip;
}

function getClientIp(req) {
  const rawIp = requestIp.getClientIp(req) || req.ip || req.connection.remoteAddress;
  return normalizeIp(rawIp);
}

function isIpAllowed(ip, allowedRanges = [], allowAnyIpForDemo = false) {
  if (allowAnyIpForDemo) return true;
  const cleanIp = normalizeIp(ip);

  // Localhost always allowed for local development & testing convenience
  if (cleanIp === '127.0.0.1' || cleanIp === 'localhost') return true;

  // Add default ranges if empty
  const rangesToTest = allowedRanges.length > 0 ? allowedRanges : ['192.168.0.0/24', '10.0.0.0/8', '127.0.0.1'];

  try {
    return ipRangeCheck(cleanIp, rangesToTest);
  } catch (err) {
    console.error('IP range check error:', err);
    return false;
  }
}

module.exports = {
  normalizeIp,
  getClientIp,
  isIpAllowed
};
