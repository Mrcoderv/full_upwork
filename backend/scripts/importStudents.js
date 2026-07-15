import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import ExcelJS from "exceljs";
import Student from "../src/models/Student.js";
import Course from "../src/models/Course.js";
import CourseInstance from "../src/models/CourseInstance.js";
import StudentEnrollment from "../src/models/StudentEnrollment.js";
import Teacher from "../src/models/Teacher.js";
import User from "../src/models/User.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env.development") });

const filePath = process.argv[2] || "../docs/test_mindful.xlsx";

const MUNI_MAP = {
    "Uppl Väsby": "Upplands Väsby",
    "Uppl. Väsby": "Upplands Väsby",
    "Upplands Bro": "Upplands Bro",
};

function parseDate(val) {
    if (!val) return null;
    if (val instanceof Date) return val;
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
}

function parsePersonalNumber(raw) {
    if (!raw) return null;
    const cleaned = String(raw).replace(/[^0-9Xx-]/g, "").trim();
    return cleaned || null;
}

async function importStudents() {
    const mongoUri = process.env.MONGODB_URI;
    console.log("Connecting to MongoDB:", mongoUri);
    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB");

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path.resolve(__dirname, filePath));

    const sheet = wb.getWorksheet("Elever");
    if (!sheet) {
        console.error("No 'Elever' sheet found in", filePath);
        await mongoose.disconnect();
        process.exit(1);
    }

    console.log(`Found 'Elever' sheet with ${sheet.rowCount} rows`);

    // Index courses by code for fast lookup
    const courses = await Course.find({}).lean();
    const coursesByCode = {};
    for (const c of courses) {
        if (c.courseCode) coursesByCode[c.courseCode.toUpperCase()] = c;
    }

    // Index teachers by name (from userId.name or teacher name)
    const teachers = await Teacher.find({}).populate("userId", "name").lean();
    const teachersByName = {};
    for (const t of teachers) {
        const name = (t.userId?.name || "").trim().toLowerCase();
        if (name) teachersByName[name] = t;
    }

    let created = 0;
    let skipped = 0;

    for (let i = 2; i <= sheet.rowCount; i++) {
        const row = sheet.getRow(i);
        const name = row.getCell(2).text.trim();
        const personalNumber = parsePersonalNumber(row.getCell(3).text);
        const startDate = parseDate(row.getCell(4).text);
        const endDate = parseDate(row.getCell(5).text);
        const courseCode = row.getCell(6).text.trim().toUpperCase();
        const municipality = MUNI_MAP[row.getCell(7).text.trim()] || row.getCell(7).text.trim();
        const phone = row.getCell(8).text.trim() || undefined;
        const email = row.getCell(9).text.trim();
        const additionalInfo = row.getCell(10).text.trim() || undefined;
        const teacherName = row.getCell(11).text.trim().toLowerCase();

        if (!name || !email) {
            console.log(`  Row ${i}: skipped (no name or email)`);
            skipped++;
            continue;
        }

        // Upsert student
        let student = await Student.findOne({ email });
        if (!student) {
            student = await Student.create({
                name,
                personalNumber: personalNumber || `PENDING-${i}`,
                email,
                phone,
                startDate,
                endDate,
                municipality: municipality ? { type: municipality } : undefined,
                specialNeeds: additionalInfo || undefined,
            });
        }

        // Find teacher
        const teacher = teachersByName[teacherName] || null;

        // Find or create course + instance
        let course = coursesByCode[courseCode] || null;
        let courseInstance = null;

        const sDate = startDate || new Date();
        const eDate = endDate || new Date(sDate.getTime() + 30 * 24 * 60 * 60 * 1000);

        if (!course) {
            // Create placeholder course for missing codes
            course = await Course.create({
                courseName: courseCode,
                courseCode,
            });
            coursesByCode[courseCode] = course;
        }

        // Find or create an instance overlapping the student's dates
        courseInstance = await CourseInstance.findOne({
            mainCourseId: course._id,
            startDate: { $lte: eDate },
            endDate: { $gte: sDate },
        });

        if (!courseInstance) {
            courseInstance = await CourseInstance.create({
                mainCourseId: course._id,
                courseName: course.courseName,
                courseCode: course.courseCode,
                startDate: sDate,
                endDate: eDate,
                responsibleTeacher: teacher?._id,
            });
        }

        // Upsert enrollment
        const existingEnrollment = await StudentEnrollment.findOne({
            studentId: student._id,
            ...(courseInstance ? { courseInstanceId: courseInstance._id } : {}),
        });

        if (!existingEnrollment) {
            const now = new Date();
            const isPast = endDate && endDate < now;
            const isActive = startDate && startDate <= now && (!endDate || endDate >= now);
            const status = isPast ? "completed" : isActive ? "active" : "enrolled";

            await StudentEnrollment.create({
                studentId: student._id,
                courseInstanceId: courseInstance?._id || null,
                mainCourseId: course?._id || null,
                startDate: startDate || new Date(),
                endDate: endDate || new Date(),
                enrollmentDate: startDate || new Date(),
                status,
                teacherId: teacher?._id || null,
                gradeDate: isPast ? endDate : null,
            });
        }

        created++;
        if (created % 10 === 0) console.log(`  Processed ${created} students...`);
    }

    console.log(`\nDone! Created/updated: ${created}, Skipped: ${skipped}`);

    const studentCount = await Student.countDocuments();
    const enrollmentCount = await StudentEnrollment.countDocuments();
    console.log(`Total students in DB: ${studentCount}`);
    console.log(`Total enrollments in DB: ${enrollmentCount}`);

    await mongoose.disconnect();
}

importStudents().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
