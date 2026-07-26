import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
dotenv.config({ path: path.resolve(import.meta.dirname, "../.env.development") });

import mongoose from "mongoose";
import ExcelJS from "exceljs";

await mongoose.connect(process.env.MONGODB_URI);
console.log("Connected to MongoDB");

const Program = (await import("../src/models/Program.js")).default;
const Course = (await import("../src/models/Course.js")).default;
const CoursePackage = (await import("../src/models/CoursePackage.js")).default;

// === dropData ===
console.log("--- Dropping programs, courses, course packages ---");
const p = await Program.deleteMany({});
const c = await Course.deleteMany({});
const cp = await CoursePackage.deleteMany({});
console.log(`  Programs: ${p.deletedCount}, Courses: ${c.deletedCount}, Packages: ${cp.deletedCount}`);

// === updateEducation ===
console.log("\n--- Running updateEducation from EducationData.xlsx ---");
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile("./scripts/EducationData.xlsx");

const [coursesSheet, coursePackagesSheet] = workbook.worksheets;
console.log(`  Courses sheet: ${coursesSheet.rowCount} rows`);
console.log(`  Packages sheet: ${coursePackagesSheet.rowCount} rows`);

let currentProgram;
for (const row of coursesSheet.getRows(2, coursesSheet.rowCount - 1)) {
  const programName = row.getCell(1).text.trim().toUpperCase();
  const courseName = row.getCell(2).text.trim().toUpperCase();
  const courseCode = row.getCell(3).text.trim().toUpperCase();
  const coursePoints = row.getCell(4).text.trim();
  const courseExtent = row.getCell(5).text.trim();

  if (programName) {
    currentProgram = await Program.findOneAndUpdate(
      { programName },
      { programName },
      { new: true, upsert: true }
    );
    console.log(`  Program: ${programName}`);
  }

  if (!courseName || !currentProgram) continue;

  const course = await Course.findOneAndUpdate(
    { courseName, courseCode },
    { courseName, courseCode, coursePoints, courseExtent },
    { new: true, upsert: true }
  );

  await Program.findByIdAndUpdate(currentProgram._id, {
    $addToSet: { programCourses: course._id },
  });
}
console.log(`  Courses processed OK`);

currentProgram = null;
let currentPackage = null;

for (const row of coursePackagesSheet.getRows(2, coursePackagesSheet.rowCount - 1)) {
  const programName = row.getCell(1).text.trim().toUpperCase();
  const cellB = row.getCell(2);
  const isBold = cellB.font?.bold;
  const itemName = cellB.text.trim().toUpperCase();
  const itemCode = row.getCell(3).text.trim().toUpperCase();
  const itemPoints = row.getCell(4).text.trim();
  const itemExtent = row.getCell(5).text.trim();

  if (programName) {
    currentProgram = await Program.findOneAndUpdate(
      { programName },
      { programName },
      { new: true, upsert: true }
    );
  }

  if (isBold) {
    currentPackage = await CoursePackage.findOneAndUpdate(
      { coursePackageName: itemName },
      {
        coursePackageName: itemName,
        coursePackageCode: itemCode,
        coursePackagePoints: itemPoints,
        coursePackageExtent: itemExtent,
      },
      { new: true, upsert: true }
    );
    await Program.findByIdAndUpdate(currentProgram._id, {
      $addToSet: { programCoursePackages: currentPackage._id },
    });
    console.log(`  Package: ${itemName}`);
  } else if (currentPackage) {
    const course = await Course.findOneAndUpdate(
      { courseName: itemName, courseCode: itemCode },
      { courseName: itemName, courseCode: itemCode, courseExtent: itemExtent },
      { new: true, upsert: true }
    );
    await CoursePackage.findByIdAndUpdate(currentPackage._id, {
      $addToSet: { coursePackageCourses: course._id },
    });
  }
}
console.log(`  Packages processed OK`);

const totalPrograms = await Program.countDocuments();
const totalCourses = await Course.countDocuments();
const totalPackages = await CoursePackage.countDocuments();
console.log(`\n=== FINAL COUNTS ===`);
console.log(`  Programs: ${totalPrograms}`);
console.log(`  Courses: ${totalCourses}`);
console.log(`  Packages: ${totalPackages}`);

await mongoose.disconnect();
console.log("Done.");
process.exit(0);
