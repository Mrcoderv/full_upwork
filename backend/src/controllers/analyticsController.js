import {
    getRevenueReport,
    getMonthlyIncomeForecast,
    getStudentReport,
    getGradeDistribution,
    getPopularCourses,
    getDropoutReport,
    getFilterOptions,
} from "../services/analyticsService.js";

const extractFilters = (req) => ({
    municipality: req.query.municipality || null,
    courseId: req.query.courseId || null,
    teacherId: req.query.teacherId || null,
    startDate: req.query.startDate || null,
    endDate: req.query.endDate || null,
    groupBy: req.query.groupBy || null,
    forecastMonths: req.query.forecastMonths || null,
});

const handle = (fn) => async (req, res) => {
    try {
        const result = await fn(extractFilters(req));
        res.status(200).json(result);
    } catch (err) {
        console.error(`❌ Analytics error (${fn.name}):`, err);
        res.status(500).json({ message: "Failed to generate report" });
    }
};

export const getRevenue = handle(getRevenueReport);
export const getForecast = handle(getMonthlyIncomeForecast);
export const getStudents = handle(getStudentReport);
export const getGrades = handle(getGradeDistribution);
export const getPopular = handle(getPopularCourses);
export const getDropouts = handle(getDropoutReport);

export const getFilters = async (_req, res) => {
    try {
        const options = await getFilterOptions();
        res.status(200).json(options);
    } catch (err) {
        console.error("❌ Analytics error (getFilters):", err);
        res.status(500).json({ message: "Failed to load filter options" });
    }
};
