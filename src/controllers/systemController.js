const { getDb, saveDb } = require('../config/db');
const { getClientIp, isIpAllowed } = require('../utils/ipChecker');
const { triggerAutoAbsentProcess } = require('../services/cronService');

exports.getNetworkStatus = (req, res) => {
  try {
    const db = getDb();
    const clientIp = getClientIp(req);
    const allowed = isIpAllowed(clientIp, db.settings.allowedIpRanges, db.settings.allowAnyIpForDemo);

    return res.status(200).json({
      success: true,
      clientIp,
      isAllowed: allowed,
      allowedIpRanges: db.settings.allowedIpRanges,
      allowAnyIpForDemo: db.settings.allowAnyIpForDemo,
      presentCutoff: db.settings.presentCutoff,
      lateCutoff: db.settings.lateCutoff,
      autoAbsentTime: db.settings.autoAbsentTime,
      simulatedTime: db.settings.simulatedTime || '',
      livenessRequired: db.settings.livenessRequired
    });
  } catch (err) {
    console.error('Error checking network status:', err);
    return res.status(500).json({ success: false, message: 'Network status check failed.' });
  }
};

exports.updateSettings = (req, res) => {
  try {
    const { allowedIpRanges, allowAnyIpForDemo, presentCutoff, lateCutoff, autoAbsentTime, simulatedTime, livenessRequired } = req.body;
    const db = getDb();

    if (Array.isArray(allowedIpRanges)) {
      db.settings.allowedIpRanges = allowedIpRanges;
    }
    if (typeof allowAnyIpForDemo === 'boolean') {
      db.settings.allowAnyIpForDemo = allowAnyIpForDemo;
    }
    if (presentCutoff) db.settings.presentCutoff = presentCutoff;
    if (lateCutoff) db.settings.lateCutoff = lateCutoff;
    if (autoAbsentTime) db.settings.autoAbsentTime = autoAbsentTime;
    if (simulatedTime !== undefined) db.settings.simulatedTime = simulatedTime;
    if (typeof livenessRequired === 'boolean') db.settings.livenessRequired = livenessRequired;

    saveDb(db);

    const io = req.app.get('io');
    if (io) {
      io.emit('settings_updated', db.settings);
    }

    return res.status(200).json({
      success: true,
      message: 'System settings & evaluation time machine updated successfully.',
      settings: db.settings
    });
  } catch (err) {
    console.error('Error updating settings:', err);
    return res.status(500).json({ success: false, message: 'Failed to update system settings.' });
  }
};

exports.adminLogin = (req, res) => {
  try {
    const { email, password } = req.body;
    const db = getDb();

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please enter admin email and password.' });
    }

    const cleanEmail = email.trim().toLowerCase();

    if (cleanEmail === db.admin.email.toLowerCase() && password === db.admin.password) {
      return res.status(200).json({
        success: true,
        message: 'Admin Authentication Successful!',
        token: 'smart-attend-admin-token-' + Date.now(),
        admin: {
          name: db.admin.name,
          email: db.admin.email
        }
      });
    } else {
      return res.status(401).json({
        success: false,
        message: 'Invalid Admin Credentials. Please verify email and password.'
      });
    }
  } catch (err) {
    console.error('Admin login error:', err);
    return res.status(500).json({ success: false, message: 'Server error during admin authentication.' });
  }
};

exports.triggerAbsentCronManual = (req, res) => {
  try {
    const io = req.app.get('io');
    const result = triggerAutoAbsentProcess(io);
    return res.status(200).json({
      success: true,
      message: `Auto-Absent process executed manually. Marked ${result.markedAbsentCount} students as Absent.`,
      result
    });
  } catch (err) {
    console.error('Error running manual absent cron:', err);
    return res.status(500).json({ success: false, message: 'Failed to run auto-absent process.' });
  }
};
