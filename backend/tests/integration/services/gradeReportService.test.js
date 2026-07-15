import mongoose from 'mongoose';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { connectTestDatabase, disconnectTestDatabase } from '../../helpers/mongoTest.js';
import { generateGradeReport } from '../../../src/services/gradeReportService';
import Student from '../../../src/models/Student';
import Course from '../../../src/models/Course';
import CourseInstance from '../../../src/models/CourseInstance';
import StudentEnrollment from '../../../src/models/StudentEnrollment';

const clearDatabase = async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany();
  }
};

describe('generateGradeReport', () => {
  beforeAll(async () => {
    await connectTestDatabase();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await clearDatabase();
    
    // Create test data
    const student1 = await Student.create({ name: 'Alice A', personalNumber: '111', email: 'a@a.com', municipality: { type: 'Stockholm' } });
    const student2 = await Student.create({ name: 'Bob B', personalNumber: '222', email: 'b@b.com', municipality: { type: 'Göteborg' } });

    const course1 = await Course.create({ courseName: 'Math', courseCode: 'MAT101' });
    const course2 = await Course.create({ courseName: 'History', courseCode: 'HIS101' });

    const instance1 = await CourseInstance.create({ mainCourseId: course1._id, startDate: new Date('2023-01-01'), endDate: new Date('2023-03-01'), courseName: course1.courseName, courseCode: course1.courseCode });
    const instance2 = await CourseInstance.create({ mainCourseId: course2._id, startDate: new Date('2023-02-01'), endDate: new Date('2023-04-01'), courseName: course2.courseName, courseCode: course2.courseCode });

    await StudentEnrollment.create({
      studentId: student1._id,
      courseInstanceId: instance1._id,
      grade: 'A',
      gradeDate: new Date('2023-01-15'),
      startDate: new Date('2023-01-01'),
      endDate: new Date('2023-03-01')
    });
    await StudentEnrollment.create({
      studentId: student1._id,
      courseInstanceId: instance1._id,
      grade: 'B',
      gradeDate: new Date('2023-02-15'),
      startDate: new Date('2023-01-01'),
      endDate: new Date('2023-03-01')
    });
     await StudentEnrollment.create({
      studentId: student2._id,
      courseInstanceId: instance2._id,
      grade: 'C',
      gradeDate: new Date('2023-02-20'),
      startDate: new Date('2023-02-01'),
      endDate: new Date('2023-04-01')
    });
  });

  it('should generate a grade report', async () => {
    const filters = {
      startDate: '2023-01-01',
      endDate: '2023-03-01',
    };
    const report = await generateGradeReport(filters);
    
    expect(report.total).toBe(3);
    expect(report.monthlyTrend).toHaveLength(2);
    expect(report.monthlyTrend[0].averageGrade).toBe(5); // Jan: A=5
    expect(report.monthlyTrend[1].averageGrade).toBe(3.5); // Feb: (B=4 + C=3)/2 = 3.5
  });

  it('should filter by municipality', async () => {
    const filters = {
      startDate: '2023-01-01',
      endDate: '2023-03-01',
      municipality: 'Stockholm',
    };
    const report = await generateGradeReport(filters);
    
    expect(report.total).toBe(2);
    expect(report.monthlyTrend).toHaveLength(2);
    expect(report.monthlyTrend[0].averageGrade).toBe(5); // Jan: A=5
    expect(report.monthlyTrend[1].averageGrade).toBe(4); // Feb: B=4
  });

});
