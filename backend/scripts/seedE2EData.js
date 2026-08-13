import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config({ path: path.resolve(import.meta.dirname, "../.env.development") });

import mongoose from "mongoose";
import bcrypt from "bcrypt";
import User from "../src/models/User.js";
import Teacher from "../src/models/Teacher.js";
import Student from "../src/models/Student.js";
import Course from "../src/models/Course.js";
import CourseTemplate from "../src/models/CourseTemplate.js";
import CourseInstance from "../src/models/CourseInstance.js";
import StudentEnrollment from "../src/models/StudentEnrollment.js";
import CoursePackage from "../src/models/CoursePackage.js";
import GradeCatalog from "../src/models/GradeCatalog.js";
import Exam from "../src/models/Provning.js";
import GradingScale from "../src/models/GradingScale.js";
import Program from "../src/models/Program.js";
import Notification from "../src/models/Notification.js";
import AssignmentSubmission from "../src/models/AssignmentSubmission.js";
import { buildDefaultModules, cloneModules } from "../src/models/courseModuleSchema.js";

const hash = (pw) => bcrypt.hash(pw, 12);

const upsertUser = async ({ email, username, password, role, mustChangePassword = false }) => {
    await User.deleteMany({ email });
    const user = new User({
        username,
        name: username,
        email,
        password: await hash(password),
        roles: Array.isArray(role) ? role : [role],
        mustChangePassword,
    });
    await user.save();
    return user;
};

const upsertStudent = async ({ name, email, personalNumber, teacherId, aplStatus, municipality = "Stockholm", dropout = false, specialNeeds = "" }) => {
    await Student.deleteMany({ personalNumber });
    const student = new Student({
        name,
        email,
        personalNumber,
        teacherId,
        aplStatus,
        municipality,
        dropout,
        specialNeeds,
        aplStatusHistory: [{ status: aplStatus, changedAt: new Date(), changedBy: "seed" }],
    });
    await student.save();
    return student;
};

async function main() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    // ── 1. Clean up everything ─────────────────────────────
    await User.deleteMany({});
    await Teacher.deleteMany({});
    await Student.deleteMany({});
    await Course.deleteMany({});
    await CourseTemplate.deleteMany({});
    await CourseInstance.deleteMany({});
    await StudentEnrollment.deleteMany({});
    await CoursePackage.deleteMany({});
    await GradeCatalog.deleteMany({});
    await Exam.deleteMany({});
    await GradingScale.deleteMany({});
    await Program.deleteMany({});
    await Notification.deleteMany({});
    await AssignmentSubmission.deleteMany({});
    await mongoose.connection.db.collection("fs.files").deleteMany({});
    await mongoose.connection.db.collection("fs.chunks").deleteMany({});

    // ── 2. Users & Roles ───────────────────────────────────
    const adminUser = await upsertUser({ email: "admin@mindful.se", username: "Mindful Admin", password: "Admin123!", role: "admin" });
    const systemAdminUser = await upsertUser({ email: "sysadmin@mindful.se", username: "System Admin", password: "Admin123!", role: "systemadmin" });
    const teacherUser = await upsertUser({ email: "teacher@mindful.se", username: "Eva Nahi", password: "Teacher123!", role: "teacher" });
    const syvUser = await upsertUser({ email: "syv@mindful.se", username: "SYV Sara", password: "Teacher123!", role: "syv" });
    const specpedUser = await upsertUser({ email: "specped@mindful.se", username: "Specped Sven", password: "Teacher123!", role: "specped" });
    const coordinatorUser = await upsertUser({ email: "coordinator@mindful.se", username: "Samordnare Sten", password: "Teacher123!", role: "coordinator" });
    
    // Students as login accounts
    const studentUserAnna = await upsertUser({ email: "student@mindful.se", username: "Anna Andersson", password: "Student123!", role: "student" });
    const studentUserBerta = await upsertUser({ email: "student2@mindful.se", username: "Berta Berg", password: "Student123!", role: "student" });
    const studentUserCalle = await upsertUser({ email: "student3@mindful.se", username: "Calle Carlsson", password: "Student123!", role: "student" });
    const studentUserDoris = await upsertUser({ email: "student4@mindful.se", username: "Doris Dahl", password: "Student123!", role: "student" });
    const studentUserErik = await upsertUser({ email: "student5@mindful.se", username: "Erik Ek", password: "Student123!", role: "student" });

    // ── 3. Teacher Profile ─────────────────────────────────
    const teacher = new Teacher({
        userId: teacherUser._id,
        subject: "Matematik",
        colorCode: "#1F77B4",
        name: "Eva Nahi"
    });
    await teacher.save();

    // ── 4. Students ────────────────────────────────────────
    const anna = await upsertStudent({ name: "Anna Andersson", email: "student@mindful.se", personalNumber: "19900101-1234", teacherId: teacher._id, aplStatus: "YELLOW", specialNeeds: "Extra skrivtid" });
    const berta = await upsertStudent({ name: "Berta Berg", email: "student2@mindful.se", personalNumber: "19920202-2345", teacherId: teacher._id, aplStatus: "RED" });
    const calle = await upsertStudent({ name: "Calle Carlsson", email: "student3@mindful.se", personalNumber: "19940303-3456", teacherId: teacher._id, aplStatus: "GREEN" });
    const doris = await upsertStudent({ name: "Doris Dahl", email: "student4@mindful.se", personalNumber: "19960404-4567", teacherId: teacher._id, aplStatus: "GRAY", municipality: "Upplands Bro" });
    const erik = await upsertStudent({ name: "Erik Ek", email: "student5@mindful.se", personalNumber: "19980505-5678", teacherId: teacher._id, aplStatus: "BLUE", dropout: true });

    // Add some comments for Anna
    anna.commentHistory.push({
        text: "Anna behöver extra stöd i matematik.",
        authorId: teacherUser._id,
        authorName: "Eva Nahi",
        authorRole: "teacher",
        createdAt: new Date()
    });
    await anna.save();

    // ── 5. Courses & Templates ─────────────────────────────
    const svasve01 = await new Course({ courseName: "Svenska som andraspråk 1", courseCode: "SVASVE01", coursePoints: "100", courseExtent: "5", isActive: true }).save();
    const matmat01 = await new Course({ courseName: "Matematik 1a", courseCode: "MATMAT01a", coursePoints: "100", courseExtent: "10", isActive: true }).save();

    const seededModules = buildDefaultModules().map((module) => ({
        ...module,
        sections: module.sections.map((section, si) => ({
            ...section,
            instructions:
                section.instructions ||
                `Lektionsinnehåll modul ${module.moduleNumber}, sektion ${si + 1}: läs avsnittet i läroboken och arbeta med övningarna innan nästa lektion.`,
        })),
        assignment:
            module.moduleNumber === 1
                ? {
                      title: "Inlämningsuppgift 1 – Reflektion",
                      description:
                          "Skriv en reflektion (minst 150 ord) över vad du har lärt dig i modulen. Klistra in texten eller ladda upp ett dokument.",
                  }
                : module.assignment,
    }));

    const template = await new CourseTemplate({
        templateName: "Svenska som andraspråk 1 - mall",
        courseId: svasve01._id,
        modules: seededModules,
        createdBy: adminUser._id,
        isActive: true,
    }).save();

    // ── 6. Course Instances ────────────────────────────────
    const instanceSva = await new CourseInstance({
        mainCourseId: svasve01._id,
        courseName: "Svenska som andraspråk 1",
        courseCode: "SVASVE01",
        coursePoints: "100",
        courseExtent: "5",
        startDate: new Date("2026-07-06"),
        endDate: new Date("2026-09-28"),
        responsibleTeacher: teacher._id,
        createdBy: adminUser._id,
        isActive: true,
        modules: cloneModules(template.modules),
    }).save();

    const instanceMat = await new CourseInstance({
        mainCourseId: matmat01._id,
        courseName: "Matematik 1a",
        courseCode: "MATMAT01a",
        coursePoints: "100",
        courseExtent: "10",
        startDate: new Date("2026-08-10"),
        endDate: new Date("2026-10-19"),
        responsibleTeacher: teacher._id,
        createdBy: adminUser._id,
        isActive: true,
        modules: [],
    }).save();

    // ── 7. Enrollments ─────────────────────────────────────
    const enroll = async (studentDoc, instanceDoc, status = "active", grade = null, isGradeLocked = false) => {
        const e = new StudentEnrollment({
            studentId: studentDoc._id,
            courseInstanceId: instanceDoc._id,
            mainCourseId: instanceDoc.mainCourseId,
            teacherId: teacher._id,
            startDate: instanceDoc.startDate,
            endDate: instanceDoc.endDate,
            status: status,
            enrollmentDate: new Date(),
            slutprovDate: instanceDoc.slutprovDate,
            grade: grade,
            isGradeLocked: isGradeLocked,
            gradeDate: grade ? new Date() : null,
            gradeBy: grade ? teacherUser._id : null,
            motivation: grade ? "Studenten har uppfyllt alla mål." : "",
            nationalTestPoints: (instanceDoc.courseCode === "MATMAT01a" && grade) ? 85 : null
        });
        await e.save();
        return e;
    };

    await enroll(anna, instanceSva, "active");
    await enroll(berta, instanceSva, "active", "B", true); // Locked grade
    await enroll(calle, instanceSva, "active", "C", false); // Unlocked grade
    await enroll(doris, instanceMat, "enrolled");
    await enroll(erik, instanceSva, "dropped");

    // ── 7b. Past instances (Etapp 1 e2e) ───────────────────
    // Past MAT instance so teachers have students-to-grade (endDate < now).
    const instanceMatPast = await new CourseInstance({
        mainCourseId: matmat01._id,
        courseName: "Matematik 1a",
        courseCode: "MATMAT01a",
        coursePoints: "100",
        courseExtent: "10",
        startDate: new Date("2026-02-23"),
        endDate: new Date("2026-04-24"),
        responsibleTeacher: teacher._id,
        createdBy: adminUser._id,
        isActive: true,
        modules: [],
    }).save();
    // Ungraded enrollments (Berta → grade F flow, Doris → NP-poäng flow).
    await enroll(berta, instanceMatPast, "active");
    await enroll(doris, instanceMatPast, "enrolled");

    // Past completed SVA enrollment → "Lästa kurser" + "Ny antagning" (item 14).
    const instanceSvaPast = await new CourseInstance({
        mainCourseId: svasve01._id,
        courseName: "Svenska som andraspråk 1",
        courseCode: "SVASVE01",
        coursePoints: "100",
        courseExtent: "5",
        startDate: new Date("2025-10-27"),
        endDate: new Date("2026-01-30"),
        responsibleTeacher: teacher._id,
        createdBy: adminUser._id,
        isActive: true,
        modules: [],
    }).save();
    await enroll(doris, instanceSvaPast, "completed", "C", false);

    // ── 8. Course Package & APL ────────────────────────────
    const pkg = await new CoursePackage({ coursePackageName: "APL-paket e2e", coursePackageCode: "APLE2E01", coursePackagePoints: "100", coursePackageExtent: "5", coursePackageCourses: [svasve01._id, matmat01._id] }).save();
    const program = await new Program({
        programName: "Komvux-profil",
        programCourses: [{ courseId: svasve01._id, order: 1 }],
        programCoursePackages: [pkg._id],
    }).save();
    const pkgInstance = await new CourseInstance({
        mainCourseId: svasve01._id,
        courseName: "APL-paket e2e",
        courseCode: "APLE2E01",
        coursePoints: "100",
        courseExtent: "5",
        startDate: new Date("2026-01-12"),
        endDate: new Date("2026-12-31"),
        responsibleTeacher: teacher._id,
        createdBy: adminUser._id,
        isActive: true,
        modules: [],
    }).save();

    const pkgEnroll = async (studentDoc, endDate) => {
        const e = new StudentEnrollment({
            studentId: studentDoc._id,
            courseInstanceId: pkgInstance._id,
            coursePackageId: pkg._id,
            startDate: new Date("2026-01-12"),
            endDate,
            status: "active",
            enrollmentDate: new Date(),
        });
        await e.save();
    };
    await pkgEnroll(anna, new Date("2026-12-31"));
    await pkgEnroll(calle, new Date("2026-08-21")); // Ends soon → auto-RED

    // ── 9. Exams (Prövningar) ──────────────────────────────
    const createExam = async (studentDoc, month, decision = "", status = "intresse") => {
        const exam = new Exam({
            name: studentDoc.name,
            personalNumber: studentDoc.personalNumber,
            email: studentDoc.email,
            course: "MATMAT01a",
            municipality: "Sollentuna",
            teacherId: teacher._id,
            requestedMonth: month,
            decision: decision,
            status: status,
            studentId: studentDoc._id
        });
        await exam.save();
        return exam;
    };

    await createExam(anna, "September", "", "intresse");
    await createExam(berta, "September", "accept", "scheduled");
    await createExam(calle, "Augusti", "move", "moved");
    await createExam(doris, "Augusti", "deny", "denied");

    // ── 10. Grade Catalog (Scrive) ─────────────────────────
    const catalog = new GradeCatalog({
        title: "Betygskatalog SVASVE01",
        filename: "betygskatalog_e2e.pdf",
        pdf: Buffer.from("%PDF-1.4 test catalog", "utf-8"),
        pdfContentType: "application/pdf",
        studentId: anna._id,
        studentName: "Anna Andersson",
        courseId: svasve01._id,
        courseName: "Svenska som andraspråk 1",
        teacherId: teacher._id,
        teacherName: "Eva Nahi",
        teacherEmail: "teacher@mindful.se",
        status: "uploaded",
        uploadedById: adminUser._id,
        uploadedByRole: "admin",
    });
    await catalog.save();

    // ── 11. Grading Scale ──────────────────────────────────
    const scale = new GradingScale({
        subject: "Matematik",
        term: "HT26",
        scales: [
            { grade: "A", minPoints: 90 },
            { grade: "B", minPoints: 80 },
            { grade: "C", minPoints: 70 },
            { grade: "D", minPoints: 60 },
            { grade: "E", minPoints: 50 },
            { grade: "F", minPoints: 0 }
        ],
        createdBy: systemAdminUser._id
    });
    await scale.save();

    // VT26 scale for the past Matematik instance (endDate 2026-04-24 → VT26).
    const scaleVT26 = new GradingScale({
        subject: "Matematik",
        term: "VT26",
        scales: [
            { grade: "A", minPoints: 90 },
            { grade: "B", minPoints: 80 },
            { grade: "C", minPoints: 70 },
            { grade: "D", minPoints: 60 },
            { grade: "E", minPoints: 50 },
            { grade: "F", minPoints: 0 }
        ],
        createdBy: systemAdminUser._id
    });
    await scaleVT26.save();

    await mongoose.disconnect();
    console.log("✅ Seed complete.");
    console.log("   Admin:      admin@mindful.se / Admin123!");
    console.log("   SysAdmin:   sysadmin@mindful.se / Admin123!");
    console.log("   Teacher:    teacher@mindful.se / Teacher123!");
    console.log("   SYV:        syv@mindful.se / Teacher123!");
    console.log("   Specped:    specped@mindful.se / Teacher123!");
    console.log("   Coordinator:coordinator@mindful.se / Teacher123!");
}

main().catch(err => {
    console.error("❌ Seed error:", err);
    process.exit(1);
});
