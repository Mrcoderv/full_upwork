import {
    describe,
    it,
    expect,
    beforeAll,
    afterAll,
    beforeEach,
    afterEach,
    vi,
} from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import app from "../../index.js";
import Teacher from "../../src/models/Teacher.js";
import User from "../../src/models/User.js";
import Student from "../../src/models/Student.js";
import {
    connectTestDatabase,
    disconnectTestDatabase,
} from "../helpers/mongoTest.js";

const TEACHER_COLORS = [
    "#e6194b",
    "#3cb44b",
    "#ffe119",
    "#4363d8",
    "#f58231",
    "#911eb4",
    "#46f0f0",
    "#f032e6",
    "#bcf60c",
    "#fabebe",
    "#008080",
    "#e6beff",
    "#9a6324",
    "#fffac8",
    "#800000",
    "#aaffc3",
    "#808000",
    "#ffd8b1",
    "#000075",
    "#808080",
    "#ffffff",
    "#000000",
];

const buildAuthHeader = (role = "admin") => {
    const token = jwt.sign(
        {
            userId: new mongoose.Types.ObjectId().toString(),
            role,
            roles: [role],
        },
        process.env.JWT_SECRET
    );
    return { Authorization: `Bearer ${token}` };
};

const createUser = async (overrides = {}) => {
    return User.create({
        username: overrides.username || "Teacher User",
        email:
            overrides.email ||
            `teacher_${new mongoose.Types.ObjectId().toString()}@example.com`,
        password: overrides.password,
        roles: overrides.roles || [overrides.role || "teacher"],
        createdAt: overrides.createdAt || new Date(),
        updatedAt: overrides.updatedAt || new Date(),
    });
};

const createTeacher = async (overrides = {}) => {
    const user = overrides.user || (await createUser({ password: overrides.password }));
    const teacher = await Teacher.create({
        userId: user._id,
        subject: overrides.subject || "Math",
        colorCode: overrides.colorCode || TEACHER_COLORS[0],
        phoneNumbers: overrides.phoneNumbers || [],
    });
    return { user, teacher };
};

describe("Teacher Routes", () => {
    let hashedPassword;

    beforeAll(async () => {
        await connectTestDatabase();
        process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
        hashedPassword = await bcrypt.hash("Password123!", 10);
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        await Promise.all([
            Teacher.deleteMany({}),
            User.deleteMany({}),
            Student.deleteMany({}),
        ]);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("GET /api/debug-teachers", () => {
        it("returns populated teacher data", async () => {
            const { user, teacher } = await createTeacher({ password: hashedPassword });

            const response = await request(app)
                .get("/api/debug-teachers")
                .set(buildAuthHeader("admin"))
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.count).toBe(1);
            expect(response.body.teachers[0]).toMatchObject({
                teacherId: teacher._id.toString(),
                subject: teacher.subject,
                colorCode: teacher.colorCode,
                user: {
                    id: user._id.toString(),
                    username: user.username,
                    email: user.email,
                    roles: user.roles,
                },
            });
        });

        it("returns null user when teacher has no linked user", async () => {
            await Teacher.create({
                userId: new mongoose.Types.ObjectId(),
                subject: "No User",
                colorCode: TEACHER_COLORS[0],
                phoneNumbers: [],
            });

            const response = await request(app)
                .get("/api/debug-teachers")
                .set(buildAuthHeader("admin"))
                .expect(200);

            expect(response.body.count).toBe(1);
            expect(response.body.teachers[0].user).toBeNull();
        });

        it("returns 500 when populate fails", async () => {
            vi.spyOn(Teacher, "find").mockRejectedValueOnce(
                new Error("populate failed")
            );

            const response = await request(app)
                .get("/api/debug-teachers")
                .set(buildAuthHeader("admin"))
                .expect(500);

            expect(response.body).toEqual({ error: "Debug route failed." });
        });
    });

    describe("GET /api/teachers", () => {
        it("returns teachers for admins", async () => {
            await createTeacher({ password: hashedPassword });
            await createTeacher({ password: hashedPassword, subject: "Science" });

            const response = await request(app)
                .get("/api/teachers")
                .set(buildAuthHeader("admin"))
                .expect(200);

            expect(response.body).toHaveLength(2);
            expect(response.body[0]).toHaveProperty("userId");
        });

        it("returns 500 when fetching teachers fails", async () => {
            vi.spyOn(Teacher, "find").mockImplementationOnce(() => {
                throw new Error("find failed");
            });

            const response = await request(app)
                .get("/api/teachers")
                .set(buildAuthHeader("admin"))
                .expect(500);

            expect(response.body).toEqual({ error: "Failed to fetch teachers." });
        });
    });

    describe("POST /api/admin/teacher", () => {
        it("returns 400 when required fields are missing", async () => {
            const response = await request(app)
                .post("/api/admin/teacher")
                .set(buildAuthHeader("admin"))
                .send({ username: "Missing" })
                .expect(400);

            expect(response.body).toEqual({
                error: "Username, email, and subject are required.",
            });
        });

        it("returns 409 when user already exists", async () => {
            const email = "existing@example.com";
            await createUser({ email, password: hashedPassword });

            const response = await request(app)
                .post("/api/admin/teacher")
                .set(buildAuthHeader("admin"))
                .send({
                    username: "Existing",
                    email,
                    subject: "Math",
                })
                .expect(409);

            expect(response.body).toEqual({
                error: "A user with this email already exists.",
            });
        });

        it("creates a teacher with a generated password", async () => {
            const response = await request(app)
                .post("/api/admin/teacher")
                .set(buildAuthHeader("admin"))
                .send({
                    username: "Generated",
                    email: "generated@example.com",
                    subject: "  English  ",
                    generatePassword: true,
                    phoneNumbers: [" 123 ", "", 42],
                })
                .expect(201);

            expect(response.body.success).toBe(true);
            expect(response.body.password).toBeTruthy();

            const savedUser = await User.findOne({
                email: "generated@example.com",
            });
            const savedTeacher = await Teacher.findOne({
                userId: savedUser._id,
            });

            expect(await bcrypt.compare(response.body.password, savedUser.password)).toBe(true);
            expect(savedTeacher.subject).toBe("English");
            expect(savedTeacher.colorCode).toBe(TEACHER_COLORS[0]);
            expect(savedTeacher.phoneNumbers).toEqual(["123"]);
        });

        it("creates a teacher with a default password when generation is disabled", async () => {
            const response = await request(app)
                .post("/api/admin/teacher")
                .set(buildAuthHeader("admin"))
                .send({
                    username: "DefaultPassword",
                    email: "default@example.com",
                    subject: "History",
                    colorCode: "#123456",
                    generatePassword: false,
                })
                .expect(201);

            expect(response.body.password).toBeUndefined();

            const savedUser = await User.findOne({
                email: "default@example.com",
            });
            const savedTeacher = await Teacher.findOne({
                userId: savedUser._id,
            });

            expect(await bcrypt.compare("ChangeMe123!", savedUser.password)).toBe(true);
            expect(savedTeacher.colorCode).toBe("#123456");
        });

        it("returns 500 when teacher creation fails", async () => {
            vi.spyOn(User, "findOne").mockRejectedValueOnce(
                new Error("db error")
            );

            const response = await request(app)
                .post("/api/admin/teacher")
                .set(buildAuthHeader("admin"))
                .send({
                    username: "Error",
                    email: "error@example.com",
                    subject: "Math",
                })
                .expect(500);

            expect(response.body).toEqual({ error: "Internal server error." });
        });
    });

    describe("POST /api/teacher", () => {
        it("returns 400 when required fields are missing", async () => {
            const response = await request(app)
                .post("/api/teacher")
                .set(buildAuthHeader("admin"))
                .send({ username: "Missing" })
                .expect(400);

            expect(response.body).toEqual({
                error: "Username and email are required.",
            });
        });

        it("returns 409 when user already exists", async () => {
            const email = "duplicate@example.com";
            await createUser({ email, password: hashedPassword });

            const response = await request(app)
                .post("/api/teacher")
                .set(buildAuthHeader("admin"))
                .send({ username: "Dup", email })
                .expect(409);

            expect(response.body).toEqual({
                error: "A user with this email already exists.",
            });
        });

        it("creates a teacher with default subject and cycled color", async () => {
            const userSaveSpy = vi
                .spyOn(User.prototype, "save")
                .mockImplementationOnce(function mockSave() {
                    return Promise.resolve({
                        _id: this._id,
                        username: this.username,
                        email: this.email,
                        role: this.role,
                    });
                });
            const allColors = TEACHER_COLORS.map((color) => ({ colorCode: color }));
            allColors.push({ colorCode: TEACHER_COLORS[0] });
            vi.spyOn(Teacher, "find").mockResolvedValueOnce(allColors);

            const response = await request(app)
                .post("/api/teacher")
                .set(buildAuthHeader("admin"))
                .send({
                    username: "Legacy",
                    email: "legacy@example.com",
                    phoneNumbers: [" 555 ", ""],
                })
                .expect(201);

            expect(response.body.message).toBe("Teacher created successfully.");
            expect(userSaveSpy).toHaveBeenCalled();

            const savedTeacher = await Teacher.findOne({
                subject: "Övrigt",
            });
            expect(savedTeacher.colorCode).toBe(TEACHER_COLORS[1]);
            expect(savedTeacher.phoneNumbers).toEqual(["555"]);
        });

        it("uses fallback color when color lookup fails", async () => {
            vi.spyOn(User.prototype, "save").mockImplementationOnce(function mockSave() {
                return Promise.resolve({
                    _id: this._id,
                    username: this.username,
                    email: this.email,
                    role: this.role,
                });
            });
            vi.spyOn(Teacher, "find").mockRejectedValueOnce(
                new Error("color error")
            );

            await request(app)
                .post("/api/teacher")
                .set(buildAuthHeader("admin"))
                .send({
                    username: "Fallback",
                    email: "fallback@example.com",
                })
                .expect(201);

            const savedTeacher = await Teacher.findOne({
                subject: "Övrigt",
                userId: { $exists: true },
            });
            expect(savedTeacher.colorCode).toBe(TEACHER_COLORS[0]);
        });

        it("returns 500 when creation fails", async () => {
            vi.spyOn(User, "findOne").mockRejectedValueOnce(
                new Error("create error")
            );

            const response = await request(app)
                .post("/api/teacher")
                .set(buildAuthHeader("admin"))
                .send({ username: "Error", email: "err@example.com" })
                .expect(500);

            expect(response.body).toEqual({ error: "Internal server error." });
        });
    });

    describe("PUT /api/teachers/:id", () => {
        it("returns 404 when teacher is missing", async () => {
            const response = await request(app)
                .put(`/api/teachers/${new mongoose.Types.ObjectId()}`)
                .set(buildAuthHeader("admin"))
                .send({ subject: "Math" })
                .expect(404);

            expect(response.body).toEqual({ error: "Teacher not found." });
        });

        it("updates teacher and user data", async () => {
            const { user, teacher } = await createTeacher({
                password: hashedPassword,
                subject: "Math",
                colorCode: "#111111",
                phoneNumbers: ["111"],
            });

            const response = await request(app)
                .put(`/api/teachers/${teacher._id}`)
                .set(buildAuthHeader("admin"))
                .send({
                    username: "Updated",
                    email: "updated@example.com",
                    subject: "Physics",
                    colorCode: "#222222",
                    phoneNumbers: [" 222 ", ""],
                })
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.teacher.subject).toBe("Physics");
            expect(response.body.teacher.colorCode).toBe("#222222");
            expect(response.body.teacher.phoneNumbers).toEqual(["222"]);

            const updatedUser = await User.findById(user._id);
            expect(updatedUser.username).toBe("Updated");
            expect(updatedUser.email).toBe("updated@example.com");
        });

        it("updates teacher without user changes", async () => {
            const { user, teacher } = await createTeacher({
                password: hashedPassword,
                subject: "Math",
                colorCode: "#111111",
            });

            const response = await request(app)
                .put(`/api/teachers/${teacher._id}`)
                .set(buildAuthHeader("admin"))
                .send({ subject: "Biology" })
                .expect(200);

            expect(response.body.teacher.subject).toBe("Biology");

            const unchangedUser = await User.findById(user._id);
            expect(unchangedUser.username).toBe(user.username);
        });

        it("updates only the username when email is omitted", async () => {
            const { teacher } = await createTeacher({
                password: hashedPassword,
                subject: "Math",
                colorCode: "#111111",
            });

            const response = await request(app)
                .put(`/api/teachers/${teacher._id}`)
                .set(buildAuthHeader("admin"))
                .send({ username: "UserOnly" })
                .expect(200);

            expect(response.body.teacher.subject).toBe("Math");

            const updatedUser = await User.findById(teacher.userId);
            expect(updatedUser.username).toBe("UserOnly");
        });

        it("updates only the email when username is omitted", async () => {
            const { teacher } = await createTeacher({
                password: hashedPassword,
                subject: "Math",
                colorCode: "#111111",
            });

            const response = await request(app)
                .put(`/api/teachers/${teacher._id}`)
                .set(buildAuthHeader("admin"))
                .send({ email: "useronly@example.com" })
                .expect(200);

            const updatedUser = await User.findById(teacher.userId);
            expect(updatedUser.email).toBe("useronly@example.com");
        });

        it("returns 500 when update fails", async () => {
            vi.spyOn(Teacher, "findById").mockImplementationOnce(() => {
                throw new Error("update failed");
            });

            const response = await request(app)
                .put(`/api/teachers/${new mongoose.Types.ObjectId()}`)
                .set(buildAuthHeader("admin"))
                .send({ subject: "Chemistry" })
                .expect(500);

            expect(response.body).toEqual({ error: "Internal server error." });
        });
    });

    describe("PUT /api/teachers/:id/password", () => {
        it("returns 400 when password is missing", async () => {
            const response = await request(app)
                .put(`/api/teachers/${new mongoose.Types.ObjectId()}/password`)
                .set(buildAuthHeader("admin"))
                .send({})
                .expect(400);

            expect(response.body).toEqual({ error: "Password is required." });
        });

        it("returns 404 when teacher is missing", async () => {
            const response = await request(app)
                .put(`/api/teachers/${new mongoose.Types.ObjectId()}/password`)
                .set(buildAuthHeader("admin"))
                .send({ password: "NewPassword123!" })
                .expect(404);

            expect(response.body).toEqual({ error: "Teacher not found." });
        });

        it("updates the teacher password", async () => {
            const { user, teacher } = await createTeacher({
                password: hashedPassword,
            });
            const oldPassword = user.password;

            await request(app)
                .put(`/api/teachers/${teacher._id}/password`)
                .set(buildAuthHeader("admin"))
                .send({ password: "NewPassword123!" })
                .expect(200);

            const updatedUser = await User.findById(user._id);
            expect(updatedUser.password).not.toBe(oldPassword);
            expect(await bcrypt.compare("NewPassword123!", updatedUser.password)).toBe(
                true
            );
        });

        it("returns 500 when password update fails", async () => {
            vi.spyOn(Teacher, "findById").mockImplementationOnce(() => {
                throw new Error("password update failed");
            });

            const response = await request(app)
                .put(`/api/teachers/${new mongoose.Types.ObjectId()}/password`)
                .set(buildAuthHeader("admin"))
                .send({ password: "NewPassword123!" })
                .expect(500);

            expect(response.body).toEqual({ error: "Internal server error." });
        });
    });

    describe("DELETE /api/teachers/:id", () => {
        it("returns 404 when teacher is missing", async () => {
            const response = await request(app)
                .delete(`/api/teachers/${new mongoose.Types.ObjectId()}`)
                .set(buildAuthHeader("admin"))
                .expect(404);

            expect(response.body).toEqual({ error: "Teacher not found." });
        });

        it("returns 400 when students are assigned", async () => {
            const { teacher } = await createTeacher({ password: hashedPassword });
            await Student.create({
                name: "Student One",
                email: "student1@example.com",
                personalNumber: "19900101-1234",
                teacherId: teacher._id,
            });

            const response = await request(app)
                .delete(`/api/teachers/${teacher._id}`)
                .set(buildAuthHeader("admin"))
                .expect(400);

            expect(response.body.error).toContain("Cannot delete teacher.");
        });

        it("deletes a teacher and user", async () => {
            const { teacher, user } = await createTeacher({ password: hashedPassword });

            const response = await request(app)
                .delete(`/api/teachers/${teacher._id}`)
                .set(buildAuthHeader("admin"))
                .expect(200);

            expect(response.body).toEqual({
                success: true,
                message: "Teacher deleted successfully",
            });

            const removedTeacher = await Teacher.findById(teacher._id);
            const removedUser = await User.findById(user._id);
            expect(removedTeacher).toBeNull();
            expect(removedUser).toBeNull();
        });

        it("returns 500 when delete fails", async () => {
            vi.spyOn(Teacher, "findById").mockImplementationOnce(() => {
                throw new Error("delete failed");
            });

            const response = await request(app)
                .delete(`/api/teachers/${new mongoose.Types.ObjectId()}`)
                .set(buildAuthHeader("admin"))
                .expect(500);

            expect(response.body).toEqual({ error: "Internal server error." });
        });
    });

    describe("PUT /api/teachers/:id/unassign-all-students", () => {
        it("unassigns all students for a teacher", async () => {
            const { teacher } = await createTeacher({ password: hashedPassword });
            await Student.create([
                {
                    name: "Student One",
                    email: "student1@example.com",
                    personalNumber: "19900101-1234",
                    teacherId: teacher._id,
                },
                {
                    name: "Student Two",
                    email: "student2@example.com",
                    personalNumber: "19900202-2345",
                    teacherId: teacher._id,
                },
            ]);

            const response = await request(app)
                .put(`/api/teachers/${teacher._id}/unassign-all-students`)
                .set(buildAuthHeader("admin"))
                .expect(200);

            expect(response.body).toEqual({
                success: true,
                message: "Unassigned 2 students from teacher.",
            });

            const remaining = await Student.find({ teacherId: teacher._id });
            expect(remaining).toHaveLength(0);
        });

        it("returns 500 when unassign fails", async () => {
            vi.spyOn(Student, "updateMany").mockRejectedValueOnce(
                new Error("unassign failed")
            );

            const response = await request(app)
                .put(`/api/teachers/${new mongoose.Types.ObjectId()}/unassign-all-students`)
                .set(buildAuthHeader("admin"))
                .expect(500);

            expect(response.body).toEqual({ error: "Internal server error." });
        });
    });
});
