import mongoose from "mongoose";
import StudentEnrollment from "../models/StudentEnrollment.js";
import Student from "../models/Student.js";
import Course from "../models/Course.js";
import Teacher from "../models/Teacher.js";
import { gradeToRevenue } from "../utils/municipalityPricing.js";

const DROPOUT_STATUSES = ["dropped", "suspended"];

/**
 * Shared helper: turn free-text filters coming from the query string into a
 * Mongo-safe object. Every report accepts the same filter shape so the
 * frontend can reuse one filter bar for all tabs.
 */
const buildDateRange = (startDate, endDate) => {
    const range = {};
    if (startDate) range.$gte = new Date(startDate);
    if (endDate) range.$lte = new Date(endDate);
    return Object.keys(range).length ? range : null;
};

const toObjectId = (id) =>
    id && mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(id) : null;

/**
 * Base pipeline shared by every report: joins StudentEnrollment to the
 * student (for municipality) and the main course (for course name), then
 * applies the common filters. `dateField` lets callers pick which date the
 * range filter should apply to (gradeDate for revenue/grades, enrollmentDate
 * for enrollment/dropout based reports).
 */
const buildBasePipeline = (filters, dateField) => {
    const { municipality, courseId, teacherId, startDate, endDate } = filters;
    const match = {};

    const dateRange = buildDateRange(startDate, endDate);
    if (dateRange) match[dateField] = dateRange;

    const courseObjectId = toObjectId(courseId);
    if (courseObjectId) match.mainCourseId = courseObjectId;

    const teacherObjectId = toObjectId(teacherId);
    if (teacherObjectId) match.teacherId = teacherObjectId;

    const pipeline = [
        { $match: match },
        {
            $lookup: {
                from: "students",
                localField: "studentId",
                foreignField: "_id",
                as: "student",
            },
        },
        { $unwind: { path: "$student", preserveNullAndEmptyArrays: true } },
        {
            $lookup: {
                from: "courses",
                localField: "mainCourseId",
                foreignField: "_id",
                as: "course",
            },
        },
        { $unwind: { path: "$course", preserveNullAndEmptyArrays: true } },
    ];

    if (municipality) {
        pipeline.push({
            $match: {
                $or: [
                    { "student.municipality": municipality },
                    { "student.municipality.type": municipality },
                ],
            },
        });
    }

    pipeline.push({
        $addFields: {
            municipalityName: {
                $ifNull: ["$student.municipality.type", "$student.municipality"],
            },
            courseName: { $ifNull: ["$course.courseName", "Okänd kurs"] },
        },
    });

    return pipeline;
};

/**
 * Revenue grouped by municipality and by course, based on graded
 * enrollments in the selected date range (realized) + active/enrolled
 * enrollments in the selected date range (forecasted).
 */
export const getRevenueReport = async (filters) => {
    const realizedPipeline = [
        ...buildBasePipeline(filters, "gradeDate"),
        { $match: { grade: { $nin: [null, ""] } } },
        {
            $project: {
                _id: 0,
                municipalityName: 1,
                courseName: 1,
                grade: 1,
            },
        },
    ];

    const forecastedPipeline = [
        ...buildBasePipeline(filters, "endDate"),
        {
            $match: {
                grade: { $in: [null, ""] },
                status: { $in: ["active", "enrolled", "reviderad"] },
            },
        },
        {
            $project: {
                _id: 0,
                municipalityName: 1,
                courseName: 1,
            },
        },
    ];

    const [realizedRows, forecastedRows] = await Promise.all([
        StudentEnrollment.aggregate(realizedPipeline),
        StudentEnrollment.aggregate(forecastedPipeline),
    ]);

    const byMunicipality = {};
    const byCourse = {};
    let totalRealized = 0;
    let totalForecasted = 0;

    for (const row of realizedRows) {
        const revenue = gradeToRevenue(row.municipalityName, row.grade);
        if (!revenue) continue;

        totalRealized += revenue;

        const muniKey = row.municipalityName || "Okänd kommun";
        if (!byMunicipality[muniKey]) {
            byMunicipality[muniKey] = { realized: 0, forecasted: 0, total: 0 };
        }
        byMunicipality[muniKey].realized += revenue;
        byMunicipality[muniKey].total += revenue;

        const courseKey = row.courseName || "Okänd kurs";
        if (!byCourse[courseKey]) {
            byCourse[courseKey] = { realized: 0, forecasted: 0, total: 0 };
        }
        byCourse[courseKey].realized += revenue;
        byCourse[courseKey].total += revenue;
    }

    for (const row of forecastedRows) {
        // Forecast uses AtoE price as default
        const revenue = gradeToRevenue(row.municipalityName, "A");
        if (!revenue) continue;

        totalForecasted += revenue;

        const muniKey = row.municipalityName || "Okänd kommun";
        if (!byMunicipality[muniKey]) {
            byMunicipality[muniKey] = { realized: 0, forecasted: 0, total: 0 };
        }
        byMunicipality[muniKey].forecasted += revenue;
        byMunicipality[muniKey].total += revenue;

        const courseKey = row.courseName || "Okänd kurs";
        if (!byCourse[courseKey]) {
            byCourse[courseKey] = { realized: 0, forecasted: 0, total: 0 };
        }
        byCourse[courseKey].forecasted += revenue;
        byCourse[courseKey].total += revenue;
    }

    return {
        totalRevenue: totalRealized + totalForecasted,
        totalRealized,
        totalForecasted,
        byMunicipality: Object.entries(byMunicipality)
            .map(([municipality, data]) => ({
                municipality,
                revenue: data.total,
                realized: data.realized,
                forecasted: data.forecasted,
            }))
            .sort((a, b) => b.revenue - a.revenue),
        byCourse: Object.entries(byCourse)
            .map(([course, data]) => ({
                course,
                revenue: data.total,
                realized: data.realized,
                forecasted: data.forecasted,
            }))
            .sort((a, b) => b.revenue - a.revenue),
    };
};

/**
 * Monthly income for the trailing months plus a simple forecast for the
 * next `forecastMonths` months, based on the average of the last 3
 * observed months. This is an estimate, not an accounting figure - there
 * is no invoicing/pricing model in the system yet, so it is derived from
 * graded enrollments x municipality pricing, same as the revenue report.
 */
export const getMonthlyIncomeForecast = async (filters) => {
    const forecastMonths = Math.min(Math.max(Number(filters.forecastMonths) || 3, 1), 12);

    const pipeline = [
        ...buildBasePipeline(filters, "gradeDate"),
        { $match: { grade: { $nin: [null, ""] } } },
        {
            $project: {
                _id: 0,
                municipalityName: 1,
                grade: 1,
                year: { $year: "$gradeDate" },
                month: { $month: "$gradeDate" },
            },
        },
    ];

    const rows = await StudentEnrollment.aggregate(pipeline);

    const monthly = {};
    for (const row of rows) {
        const revenue = gradeToRevenue(row.municipalityName, row.grade);
        if (!revenue) continue;
        const key = `${row.year}-${String(row.month).padStart(2, "0")}`;
        monthly[key] = (monthly[key] || 0) + revenue;
    }

    const history = Object.entries(monthly)
        .map(([month, revenue]) => ({ month, revenue }))
        .sort((a, b) => (a.month > b.month ? 1 : -1));

    // Forecast via the average of the trailing 3 observed months (falls
    // back to fewer months if there isn't enough history yet).
    const trailing = history.slice(-3);
    const avg = trailing.length
        ? trailing.reduce((sum, m) => sum + m.revenue, 0) / trailing.length
        : 0;

    const forecast = [];
    if (history.length) {
        const [lastYear, lastMonth] = history[history.length - 1].month.split("-").map(Number);
        for (let i = 1; i <= forecastMonths; i++) {
            const date = new Date(lastYear, lastMonth - 1 + i, 1);
            forecast.push({
                month: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
                revenue: Math.round(avg),
                projected: true,
            });
        }
    }

    return { history, forecast };
};

/**
 * Student counts grouped by month, teacher, course, or semester (vt/ht).
 * Includes statistics on active, new, completions, and drop-outs.
 */
export const getStudentReport = async (filters) => {
    const groupBy = ["month", "teacher", "course", "semester"].includes(filters.groupBy)
        ? filters.groupBy
        : "month";

    const pipeline = [...buildBasePipeline(filters, "enrollmentDate")];

    if (groupBy === "teacher") {
        pipeline.push(
            {
                $lookup: {
                    from: "teachers",
                    localField: "teacherId",
                    foreignField: "_id",
                    as: "teacher",
                },
            },
            { $unwind: { path: "$teacher", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "users",
                    localField: "teacher.userId",
                    foreignField: "_id",
                    as: "teacherUser",
                },
            },
            { $unwind: { path: "$teacherUser", preserveNullAndEmptyArrays: true } },
            {
                $group: {
                    _id: { $ifNull: ["$teacherUser.name", "Ej tilldelad"] },
                    studentCount: { $sum: 1 },
                    uniqueStudents: { $addToSet: "$studentId" },
                    active: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
                    new: { $sum: { $cond: [{ $eq: ["$status", "enrolled"] }, 1, 0] } },
                    completions: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
                    dropouts: { $sum: { $cond: [{ $in: ["$status", DROPOUT_STATUSES] }, 1, 0] } },
                },
            }
        );
    } else if (groupBy === "course") {
        pipeline.push({
            $group: {
                _id: "$courseName",
                studentCount: { $sum: 1 },
                uniqueStudents: { $addToSet: "$studentId" },
                active: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
                new: { $sum: { $cond: [{ $eq: ["$status", "enrolled"] }, 1, 0] } },
                completions: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
                dropouts: { $sum: { $cond: [{ $in: ["$status", DROPOUT_STATUSES] }, 1, 0] } },
            },
        });
    } else if (groupBy === "semester") {
        pipeline.push(
            {
                $addFields: {
                    semester: {
                        $concat: [
                            { $cond: [{ $lte: [{ $month: "$enrollmentDate" }, 6] }, "VT", "HT"] },
                            { $toString: { $year: "$enrollmentDate" } },
                        ],
                    },
                },
            },
            {
                $group: {
                    _id: "$semester",
                    studentCount: { $sum: 1 },
                    uniqueStudents: { $addToSet: "$studentId" },
                    active: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
                    new: { $sum: { $cond: [{ $eq: ["$status", "enrolled"] }, 1, 0] } },
                    completions: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
                    dropouts: { $sum: { $cond: [{ $in: ["$status", DROPOUT_STATUSES] }, 1, 0] } },
                },
            }
        );
    } else {
        pipeline.push(
            {
                $addFields: {
                    monthKey: {
                        $dateToString: { format: "%Y-%m", date: "$enrollmentDate" },
                    },
                },
            },
            {
                $group: {
                    _id: "$monthKey",
                    studentCount: { $sum: 1 },
                    uniqueStudents: { $addToSet: "$studentId" },
                    active: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
                    new: { $sum: { $cond: [{ $eq: ["$status", "enrolled"] }, 1, 0] } },
                    completions: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
                    dropouts: { $sum: { $cond: [{ $in: ["$status", DROPOUT_STATUSES] }, 1, 0] } },
                },
            }
        );
    }

    pipeline.push(
        {
            $project: {
                _id: 0,
                label: { $ifNull: ["$_id", "Okänd"] },
                enrollments: "$studentCount",
                uniqueStudents: { $size: "$uniqueStudents" },
                active: 1,
                new: 1,
                completions: 1,
                dropouts: 1,
            },
        },
        { $sort: { label: 1 } }
    );

    return StudentEnrollment.aggregate(pipeline);
};

const GRADE_ORDER = ["A", "B", "C", "D", "E", "F", "STRECK", "AVBROTT"];
const sortGrades = (gradesList) => {
    return [...gradesList].sort((a, b) => {
        const idxA = GRADE_ORDER.indexOf(String(a.grade).toUpperCase());
        const idxB = GRADE_ORDER.indexOf(String(b.grade).toUpperCase());
        if (idxA === -1 && idxB === -1) return 0;
        if (idxA === -1) return 1;
        if (idxB === -1) return -1;
        return idxA - idxB;
    });
};

/**
 * Grade distribution overall, and grouped by course, teacher, and municipality.
 * Sorted in standard grade order (A-E, F, STRECK) to construct proper grade curves.
 */
export const getGradeDistribution = async (filters) => {
    const coursePipeline = [
        ...buildBasePipeline(filters, "gradeDate"),
        { $match: { grade: { $nin: [null, ""] } } },
        {
            $group: {
                _id: { course: "$courseName", grade: "$grade" },
                count: { $sum: 1 },
            },
        },
        {
            $group: {
                _id: "$_id.course",
                grades: { $push: { grade: "$_id.grade", count: "$count" } },
                total: { $sum: "$count" },
            },
        },
        {
            $project: {
                _id: 0,
                course: "$_id",
                grades: 1,
                total: 1,
            },
        },
        { $sort: { course: 1 } },
    ];

    const teacherPipeline = [
        ...buildBasePipeline(filters, "gradeDate"),
        { $match: { grade: { $nin: [null, ""] } } },
        {
            $lookup: {
                from: "teachers",
                localField: "teacherId",
                foreignField: "_id",
                as: "teacher",
            },
        },
        { $unwind: { path: "$teacher", preserveNullAndEmptyArrays: true } },
        {
            $lookup: {
                from: "users",
                localField: "teacher.userId",
                foreignField: "_id",
                as: "teacherUser",
            },
        },
        { $unwind: { path: "$teacherUser", preserveNullAndEmptyArrays: true } },
        {
            $group: {
                _id: {
                    teacher: { $ifNull: ["$teacherUser.name", "Ej tilldelad"] },
                    grade: "$grade",
                },
                count: { $sum: 1 },
            },
        },
        {
            $group: {
                _id: "$_id.teacher",
                grades: { $push: { grade: "$_id.grade", count: "$count" } },
                total: { $sum: "$count" },
            },
        },
        {
            $project: {
                _id: 0,
                teacher: "$_id",
                grades: 1,
                total: 1,
            },
        },
        { $sort: { teacher: 1 } },
    ];

    const municipalityPipeline = [
        ...buildBasePipeline(filters, "gradeDate"),
        { $match: { grade: { $nin: [null, ""] } } },
        {
            $group: {
                _id: {
                    municipality: "$municipalityName",
                    grade: "$grade",
                },
                count: { $sum: 1 },
            },
        },
        {
            $group: {
                _id: "$_id.municipality",
                grades: { $push: { grade: "$_id.grade", count: "$count" } },
                total: { $sum: "$count" },
            },
        },
        {
            $project: {
                _id: 0,
                municipality: "$_id",
                grades: 1,
                total: 1,
            },
        },
        { $sort: { municipality: 1 } },
    ];

    const [perCourse, perTeacher, perMunicipality] = await Promise.all([
        StudentEnrollment.aggregate(coursePipeline),
        StudentEnrollment.aggregate(teacherPipeline),
        StudentEnrollment.aggregate(municipalityPipeline),
    ]);

    const overall = {};
    for (const row of perCourse) {
        for (const g of row.grades) {
            overall[g.grade] = (overall[g.grade] || 0) + g.count;
        }
    }

    const sortedOverall = sortGrades(
        Object.entries(overall).map(([grade, count]) => ({ grade, count }))
    );

    return {
        overall: sortedOverall,
        perCourse: perCourse.map((row) => ({ ...row, grades: sortGrades(row.grades) })),
        perTeacher: perTeacher.map((row) => ({ ...row, grades: sortGrades(row.grades) })),
        perMunicipality: perMunicipality.map((row) => ({ ...row, grades: sortGrades(row.grades) })),
    };
};

/**
 * Enrollment count per course, sorted by popularity.
 */
export const getPopularCourses = async (filters) => {
    const pipeline = [
        ...buildBasePipeline(filters, "enrollmentDate"),
        {
            $group: {
                _id: "$courseName",
                enrollments: { $sum: 1 },
                completed: {
                    $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
                },
                graded: {
                    $sum: { $cond: [{ $not: [{ $in: ["$grade", [null, ""]] }] }, 1, 0] },
                },
            },
        },
        {
            $project: {
                _id: 0,
                course: "$_id",
                enrollments: 1,
                completed: 1,
                graded: 1,
            },
        },
        { $sort: { enrollments: -1 } },
    ];

    return StudentEnrollment.aggregate(pipeline);
};

/**
 * Drop-out / interruption rate grouped by month and by course.
 * "Drop-out" = enrollments whose status is dropped/suspended.
 */
export const getDropoutReport = async (filters) => {
    const basePipeline = buildBasePipeline(filters, "enrollmentDate");

    const byMonthPipeline = [
        ...basePipeline,
        {
            $addFields: {
                monthKey: { $dateToString: { format: "%Y-%m", date: "$enrollmentDate" } },
                isDropout: { $in: ["$status", DROPOUT_STATUSES] },
            },
        },
        {
            $group: {
                _id: "$monthKey",
                total: { $sum: 1 },
                dropouts: { $sum: { $cond: ["$isDropout", 1, 0] } },
            },
        },
        {
            $project: {
                _id: 0,
                month: "$_id",
                total: 1,
                dropouts: 1,
                rate: {
                    $cond: [
                        { $eq: ["$total", 0] },
                        0,
                        { $round: [{ $multiply: [{ $divide: ["$dropouts", "$total"] }, 100] }, 1] },
                    ],
                },
            },
        },
        { $sort: { month: 1 } },
    ];

    const byCoursePipeline = [
        ...basePipeline,
        {
            $addFields: { isDropout: { $in: ["$status", DROPOUT_STATUSES] } },
        },
        {
            $group: {
                _id: "$courseName",
                total: { $sum: 1 },
                dropouts: { $sum: { $cond: ["$isDropout", 1, 0] } },
            },
        },
        {
            $project: {
                _id: 0,
                course: "$_id",
                total: 1,
                dropouts: 1,
                rate: {
                    $cond: [
                        { $eq: ["$total", 0] },
                        0,
                        { $round: [{ $multiply: [{ $divide: ["$dropouts", "$total"] }, 100] }, 1] },
                    ],
                },
            },
        },
        { $sort: { rate: -1 } },
    ];

    const [byMonth, byCourse] = await Promise.all([
        StudentEnrollment.aggregate(byMonthPipeline),
        StudentEnrollment.aggregate(byCoursePipeline),
    ]);

    return { byMonth, byCourse };
};

/**
 * Distinct values used to populate the filter bar on the analytics
 * dashboard (municipalities, courses, teachers).
 */
export const getFilterOptions = async () => {
    const [municipalitiesRaw, courses, teachers] = await Promise.all([
        Student.distinct("municipality.type"),
        Course.find({}, { courseName: 1, courseCode: 1 }).sort({ courseName: 1 }).lean(),
        Teacher.find({}, { subject: 1, userId: 1 })
            .populate({ path: "userId", select: "name" })
            .lean(),
    ]);

    return {
        municipalities: municipalitiesRaw.filter(Boolean).sort(),
        courses: courses.map((c) => ({ id: c._id, name: c.courseName, code: c.courseCode })),
        teachers: teachers
            .filter((t) => t.userId)
            .map((t) => ({ id: t._id, name: t.userId?.name || "Okänd lärare", subject: t.subject })),
    };
};
