import { Router } from "express";
import taskRoutes from "./taskRoutes.js";
import authRoutes from "./authRoutes.js";
import studentRoutes from "./studentRoutes.js";
import userRoutes from "./userRoutes.js";
import teacherRoutes from "./teacherRoutes.js";
import uploadRoutes from "./uploadRoutes.js";
import programRoutes from "./programRoutes.js";
import gradeRoutes from "./gradeRoutes.js";
import courseRoutes from "./courseRoutes.js";
import coursePackageRoutes from "./coursePackageRoutes.js";
import searchRoutes from "./searchRoutes.js";
import examRoutes from "./examRoutes.js";
import meetingroutes from "./meetingroutes.js";
import notificationRoutes from "./notificationRoutes.js";
import documentRoutes from "./documentRoutes.js";
import statsRoutes from "./statsRoutes.js";
import actionPlanRoutes from "./actionPlanRoutes.js";
import courseMatchingRoutes from "./courseMatchingRoutes.js";
import studentDetailsRoutes from "./studentDetailsRoutes.js";
import gradeReportRoutes from "./gradeReportRoutes.js";
import analyticsRoutes from "./analyticsRoutes.js";

const router = Router();

console.log(" Registering API routes...");

//  Log before mounting each route
router.use("/api", examRoutes);
router.use("/api", taskRoutes);
router.use("/api", authRoutes);
router.use("/api", studentRoutes);
router.use("/api", userRoutes);
router.use("/api", teacherRoutes);
router.use("/api/uploads", uploadRoutes);
router.use("/api", programRoutes);
router.use("/api", gradeRoutes);
router.use("/api", courseRoutes);
router.use("/api", coursePackageRoutes);
router.use("/api", searchRoutes);
router.use("/api", meetingroutes);
router.use("/api", notificationRoutes);
router.use("/api", documentRoutes);
router.use("/api/stats", statsRoutes);
router.use("/api", actionPlanRoutes);
router.use("/api", courseMatchingRoutes);
router.use("/api", studentDetailsRoutes);
router.use("/api", gradeReportRoutes);
router.use("/api/analytics", analyticsRoutes);

export default router;
