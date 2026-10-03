const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  allowedIpRanges: { type: [String], default: ['192.168.0.0/24', '10.0.0.0/8', '127.0.0.1', '::1', '::ffff:127.0.0.1'] },
  allowAnyIpForDemo: { type: Boolean, default: false },
  presentCutoff: { type: String, default: '09:30' },
  lateCutoff: { type: String, default: '10:00' },
  autoAbsentTime: { type: String, default: '10:30' },
  simulatedTime: { type: String, default: '' },
  adminEmail: { type: String, default: 'ashiskumarmohanty738@gmail.com' },
  adminPassword: { type: String, default: 'Ashis@2004' },
  adminName: { type: String, default: 'Ashis Kumar Mohanty (System Administrator)' }
});

module.exports = mongoose.models.Settings || mongoose.model('Settings', settingsSchema);
