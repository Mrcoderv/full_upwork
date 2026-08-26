import mongoose from 'mongoose';
import { generateGradeReport } from '../services/gradeReportService.js';
import logger from '../utils/logger.js';

export const getGradeReport = async (req, res) => {
    try {
        const { municipality, courseId, startDate, endDate } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({ message: 'startDate and endDate are required' });
        }

        const start = new Date(startDate);
        const end = new Date(endDate);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return res.status(400).json({ message: 'Invalid date format for startDate or endDate' });
        }

        if (start > end) {
            return res.status(400).json({ message: 'startDate must be before or equal to endDate' });
        }

        if (courseId && !mongoose.isValidObjectId(courseId)) {
            return res.status(400).json({ message: 'Invalid courseId' });
        }

        const report = await generateGradeReport({ municipality, courseId, startDate, endDate });
        res.status(200).json(report);
    } catch (err) {
        logger.error({ err }, 'Error generating grade report');
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

