import ExcelJS from 'exceljs';
import mongoose from 'mongoose';
import Program from '../models/Program.js';
import CoursePackage from '../models/CoursePackage.js';
import Course from '../models/Course.js';
import logger from "./logger.js";

async function parseEducation(filePath) {
  logger.info("Connecting to MongoDB...");
  const mongoUri = process.env.MONGODB_URI;
  await mongoose.connect(mongoUri);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  try {
    const [coursesSheet, coursePackagesSheet] = workbook.worksheets;

    if (!coursesSheet || !coursePackagesSheet) {
      throw new Error('Missing worksheets "Kurser" and/or "Kurspaket".');
    }


  // Parse Courses and Programs
  let currentProgram = null, orderCounter = 1;

  for (let i = 2; i <= coursesSheet.rowCount; i++) {
    const row = coursesSheet.getRow(i);
    const programName = row.getCell(1).text.trim().toUpperCase();
    const courseName = row.getCell(2).text.trim().toUpperCase();
    const courseCode = row.getCell(3).text.trim().toUpperCase();
    const coursePoints = row.getCell(4).text.trim();
    const courseExtent = row.getCell(5).text.trim();

    if (programName) {
      currentProgram = await Program.findOneAndUpdate(
        { programName },
        { programName, programCourses: [] }, 
        { new: true, upsert: true }
      );
      orderCounter = 1;
      logger.info({ programName }, "Program processed");
    }

    if (!courseName || !currentProgram) continue;

    // Crucial: Ensure Course has a valid ObjectId
    let course = await Course.findOne({ courseName, courseCode });
    if (!course) {
      course = await Course.create({ courseName, courseCode, coursePoints, courseExtent });
      logger.info({ courseName }, "Created new course");
    } else {
      await Course.findByIdAndUpdate(course._id, { coursePoints, courseExtent });
      logger.info({ courseName }, "Updated existing course");
    }

    await Program.findByIdAndUpdate(currentProgram._id, {
      $push: {
        programCourses: { courseId: course._id, order: orderCounter++ }
      }
    });

    logger.info({ courseName, order: orderCounter - 1 }, "Course linked to program");
  }


    // Parse Course Packages
    currentProgram = null;
    let currentPackage = null;

    for (let i = 2; i <= coursePackagesSheet.rowCount; i++) {
      const row = coursePackagesSheet.getRow(i);
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
        logger.info({ programName }, "Program updated");
      }

      if (isBold) {
        currentPackage = await CoursePackage.findOneAndUpdate(
          { coursePackageName: itemName },
          {
            coursePackageName: itemName,
            coursePackageCode: itemCode,
            coursePackagePoints: itemPoints,
            coursePackageExtent: itemExtent,
            coursePackageCourses: []
          },
          { new: true, upsert: true }
        );

        await Program.findByIdAndUpdate(currentProgram._id, {
          $addToSet: { programCoursePackages: currentPackage._id },
        });

        logger.info({ itemName }, "Course Package processed");
      } else if (currentPackage) {
        const course = await Course.findOneAndUpdate(
          { courseName: itemName, courseCode: itemCode },
          { courseName: itemName, courseCode: itemCode, courseExtent: itemExtent },
          { new: true, upsert: true }
        );

        await CoursePackage.findByIdAndUpdate(currentPackage._id, {
          $addToSet: { coursePackageCourses: course._id },
        });

        logger.info({ itemName, packageName: currentPackage.coursePackageName }, "Added course to package");
      }
    }

    logger.info("Education data processed successfully");
  } catch (error) {
    logger.error({ err: error }, "Error processing education data");
  } finally {
    await mongoose.disconnect();
    logger.info("Disconnected from MongoDB");
  }
}

export default parseEducation;

// Allow direct execution
if (process.argv[2]) {
  parseEducation(process.argv[2]);
}
