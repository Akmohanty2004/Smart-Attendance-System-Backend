const express = require('express');
const router = express.Router();

const studentController = require('../controllers/studentController');
const attendanceController = require('../controllers/attendanceController');
const systemController = require('../controllers/systemController');

// Student endpoints
router.post('/students/register', studentController.registerStudent);
router.post('/students/login', studentController.studentLogin);
router.get('/students', studentController.getAllStudents);
router.delete('/students/:id', studentController.deleteStudent);

// Attendance endpoints
router.post('/attendance/mark', attendanceController.markAttendance);
router.get('/attendance/daily', attendanceController.getDailyAttendance);
router.get('/attendance/student/:studentId', attendanceController.getStudentHistory);
router.get('/attendance/stats', attendanceController.getStats);
router.get('/attendance/export', attendanceController.exportAttendanceCSV);

// System endpoints
router.get('/system/network-status', systemController.getNetworkStatus);
router.post('/system/settings', systemController.updateSettings);
router.post('/system/admin-login', systemController.adminLogin);
router.post('/system/trigger-cron', systemController.triggerAbsentCronManual);

module.exports = router;
