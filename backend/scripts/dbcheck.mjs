import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(import.meta.dirname, "../.env.development") });
import mongoose from "mongoose";
import User from "../src/models/User.js";
import Student from "../src/models/Student.js";
import CourseInstance from "../src/models/CourseInstance.js";
import StudentEnrollment from "../src/models/StudentEnrollment.js";
import Exam from "../src/models/Provning.js";
import GradingScale from "../src/models/GradingScale.js";
import GradeCatalog from "../src/models/GradeCatalog.js";
import CoursePackage from "../src/models/CoursePackage.js";
import Course from "../src/models/Course.js";

async function main() {
    await mongoose.connect(process.env.MONGODB_URI);
    const counts = {
        users: await User.countDocuments(),
        students: await Student.countDocuments(),
        courses: await Course.countDocuments(),
        instances: await CourseInstance.countDocuments(),
        enrolls: await StudentEnrollment.countDocuments(),
        exams: await Exam.countDocuments(),
        scales: await GradingScale.countDocuments(),
        catalogs: await GradeCatalog.countDocuments(),
        packages: await CoursePackage.countDocuments(),
    };
    console.log(JSON.stringify(counts, null, 2));
    const users = await User.find({}).select("username email roles").lean();
    console.log("USERS:", JSON.stringify(users, null, 1));
    const students = await Student.find({}).select("name personalNumber municipality aplStatus dropout").lean();
    console.log("STUDENTS:", JSON.stringify(students, null, 1));
    await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
