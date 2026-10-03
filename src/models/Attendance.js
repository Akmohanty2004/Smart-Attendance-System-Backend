const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  studentId: { type: String, required: true },
  studentName: { type: String, required: true },
  course: { type: String, required: true },
  batch: { type: String, default: '2024-2028' },
  date: { type: String, required: true },
  time: { type: String, required: true },
  status: { type: String, enum: ['Present', 'Late', 'Absent'], required: true },
  timestamp: { type: Date, default: Date.now },
  ipAddress: { type: String, default: '' }
});

module.exports = mongoose.models.Attendance || mongoose.model('Attendance', attendanceSchema);
