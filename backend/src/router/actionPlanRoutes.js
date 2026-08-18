import { Router } from "express";
import ActionPlan from "../models/ActionPlan.js";
import Notification from "../models/Notification.js";
import FormQuestions from "../models/ActionPlanQuestions.js"
import Student from "../models/Student.js";
import Course from "../models/Course.js";
import { isAuthenticated, hasRole } from "../middleware/auth.js";
import { buildActionPlanPdf } from "../services/actionPlanPdf.js";
import { evaluateActionPlanStatusAndNotify } from "../controllers/notificationController.js";
import logger from "../utils/logger.js";
const router = Router();

const ALLOWED_STAFF_ROLES = ["systemadmin", "admin", "teacher", "coordinator", "syv", "specped"];

router.get("/actionplan/:studentId/pdf", isAuthenticated, hasRole(ALLOWED_STAFF_ROLES), async (req, res) => {
    try {
        const plan = await ActionPlan.findOne({ studentId: req.params.studentId }).sort({ createdAt: -1 });
        if (!plan) {
            return res.status(404).json({ message: "Ingen handlingsplan hittad" });
        }
        let pdf = plan.pdf;
        if (!pdf || pdf.length === 0) {
            const student = await Student.findById(plan.studentId).select("name");
            const formConfig = await FormQuestions.findOne({ type: "ACTION_PLAN" }).lean().catch(() => null);
            let courseName = plan.courseName;
            if (!courseName && plan.courseId) {
                const course = await Course.findById(plan.courseId).select("courseName").lean().catch(() => null);
                if (course) courseName = course.courseName;
            }
            pdf = buildActionPlanPdf({
                plan: plan.toObject(),
                studentName: student?.name || plan.studentName || "",
                courseName,
                questions: formConfig?.questions,
            });
            plan.pdf = pdf;
            await plan.save().catch(() => null);
        }
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="handlingsplan-${plan._id}.pdf"`
        );
        res.send(pdf);
    } catch (error) {
        logger.error({ err: error }, "Error generating action plan PDF");
        res.status(500).json({ message: "Något gick fel", error: error.message });
    }
});

router.get("/actionplan/document/:id/pdf", isAuthenticated, hasRole(ALLOWED_STAFF_ROLES), async (req, res) => {
    try {
        const plan = await ActionPlan.findById(req.params.id);
        if (!plan) {
            return res.status(404).json({ message: "Ingen handlingsplan hittad" });
        }
        let pdf = plan.pdf;
        if (!pdf || pdf.length === 0) {
            const student = await Student.findById(plan.studentId).select("name");
            const formConfig = await FormQuestions.findOne({ type: "ACTION_PLAN" }).lean().catch(() => null);
            let courseName = plan.courseName;
            if (!courseName && plan.courseId) {
                const course = await Course.findById(plan.courseId).select("courseName").lean().catch(() => null);
                if (course) courseName = course.courseName;
            }
            pdf = buildActionPlanPdf({
                plan: plan.toObject(),
                studentName: student?.name || plan.studentName || "",
                courseName,
                questions: formConfig?.questions,
            });
            plan.pdf = pdf;
            await plan.save().catch(() => null);
        }
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="handlingsplan-${plan._id}.pdf"`
        );
        res.send(pdf);
    } catch (error) {
        logger.error({ err: error }, "Error downloading action plan PDF");
        res.status(500).json({ message: "Något gick fel", error: error.message });
    }
});

router.get("/actionplans/:studentId", isAuthenticated, hasRole(ALLOWED_STAFF_ROLES), async (req, res) => {
    try {
        const plans = await ActionPlan.find({ studentId: req.params.studentId })
            .select("-pdf")
            .sort({ createdAt: -1 })
            .lean();
        res.json(plans);
    } catch (error) {
        logger.error({ err: error }, "Error listing action plans");
        res.status(500).json({ message: "Något gick fel", error: error.message });
    }
});

router.get("/actionplan/:studentId", isAuthenticated, hasRole(ALLOWED_STAFF_ROLES), async (req, res) => {
    try {
        const plan = await ActionPlan.findOne({ studentId: req.params.studentId }).sort({ createdAt: -1 });
        if (!plan) {
            return res.status(404).json({ message: "Ingen handlingsplan hittad" });
        }
        const planObj = typeof plan.toObject === "function" ? plan.toObject() : { ...plan };
        delete planObj.pdf;
        res.json(planObj);
    } catch (error) {
        logger.error({ err: error }, "Error fetching action plan");
        res.status(500).json({ message: "Något gick fel", error: error.message });
    }
});

router.post("/form-questions", isAuthenticated, hasRole(ALLOWED_STAFF_ROLES), async (req, res) => {
    try {

        const { type, questions} = req.body

        await FormQuestions.deleteMany({type})

        const newFormConfig = new FormQuestions({
            type,
            questions,
        })

        await newFormConfig.save();
        res.status(201).json({ message: "Form questions saved successfully" });



    } catch (error) {
        logger.error({ err: error }, "Error fetching form questions");
        res.status(500).json({ error: "Internal Server Error" });
    }
})

router.get('/form-questions/:type', isAuthenticated, hasRole(ALLOWED_STAFF_ROLES), async (req, res) => {
    try {
      const formConfig = await FormQuestions.findOne({ type: req.params.type })
      
      if (!formConfig) {

        const defaultConfig = new FormQuestions({
            type: req.params.type,
            questions: [
                {
                    key: 'teacherName',
                    label: 'Ansvarig lärare',
                    type: 'text',
                    required: true
                  },
                  {
                    key: 'date',
                    label: 'Datum',
                    type: 'date',
                    required: true
                  },
                  {
                    key: 'reason',
                    label: 'Orsak till handlingsplan',
                    type: 'textarea',
                    required: true
                  },
                  {
                    key: 'schoolEfforts',
                    label: 'Skolans/lärarens insatser (Välj nedan alternativ som du önskar ska stå med som dina/skolans insatser',
                    type: 'select',
                    options: [
                        'Tydliggöra lektionsmål och förväntningar', 
                        'Erbjuda extra handledning och stöd vid behov',
                        'Implementera olika undervisningsmetoder för att möta elevens inlärningsstil',
                        'Regelbunden uppföljning av elevens framgång',
                        'Anpassa undervisningen för att inkludera visualisering eller interaktiva verktyg',
                        'Erbjuda möjligheter till grupparbete och samarbete för ökad engagemang.',
                        'Inga insatser vidtagna',
                    ],
                    required: true,
                  },
                  {
                    key: 'studentEfforts',
                    label: 'Elevens insatser: (Välj nedan alternativ som du önskar ska stå med som elevens insatser, ta med delar i parentesten som stämmer överens med de överskrifter du önskar att lämna för eleven)',
                    type: 'select',
                    options: [
                        'Förkunskaper: (Exempel: Identifiera och arbeta med eventuella kunskapsluckor.)',
                        'Närvaro: (Exempel: Sträva efter att förbättra närvaron på lektionerna.)',
                        'Fokusera på uppgifter: (Exempel: Träna på att behålla fokus under arbetspass.)',
                        'Starta upp nya arbetsmoment: (Exempel: Utveckla strategier för att komma igång med nya ämnen.)',
                        'Avsluta/lämna in uppgifter: (Exempel: Arbeta på att organisera och slutföra uppgifter i tid.)',
                        'Struktur/planering/organisation: (Exempel: Utveckla en personlig studieplan.)',
                        'Be om hjälp: (Exempel: Aktivt söka stöd från lärare vid behov.)',
                        'Arbeta koncentrerat längre stunder: (Exempel: Gradvis öka arbetsperioderna med ökad koncentration.)',
                        'Läs- och skrivförmåga: (Exempel: Träna på att förbättra läs- och skrivfärdigheter.)',
                        'Övrigt: (Exempel: Identifiera och arbeta med eventuella specifika utmaningar. T.ex., stresshantering, tidsstyrning, etc.)',
                        'Inga insatser vidtagna',
                    ],
                    required: true,
                  },
                  {
                    key: 'studyTime',
                    label: 'Avsatt tid för studier som rekommenderas (Exempel: 2 timmar per dag på vardagar, 4 timmar per dag på helger',
                    type: 'text',
                    required: true,
                  },
                  {
                    key: 'specialPedagogMeeting',
                    label: 'Möte med specialpedagog',
                    type: 'radio',
                    options: ['Ja', 'Nej'],
                    required: true
                },
                {
                    key: 'studyCareerCounselorMeeting',
                    label: 'Möte med studie- och yrkesvägledare',
                    type: 'radio',
                    options: ['Ja', 'Nej'],
                    required: true
                },
                {
                    key: 'studentHealthTeamMeeting',
                    label: 'Möte med elevhälsoteam',
                    type: 'radio',
                    options: ['Ja', 'Nej'],
                    required: true
                },
                {
                    key: 'studentNotifiedWritten',
                    label: 'Eleven har meddelats handlingsplan skriftligt',
                    type: 'radio',
                    options: ['Ja', 'Nej'],
                    required: true
                },
                {
                    key: 'studentNotifiedVerbal',
                    label: 'Eleven har meddelats handlingsplan muntligt',
                    type: 'radio',
                    options: ['Ja', 'Nej'],
                    required: true
                },
                {
                    key: 'studentName',
                    label: 'Elevens fullständiga namn',
                    type: 'text',
                    required: true
                }
            ]
        })

        const savedConfig = await defaultConfig.save()
        return res.json(savedConfig.toObject())

    }


    logger.debug({ formConfig }, "Form config fetched");
  
      res.json(formConfig.toObject())
    } catch (error) {
      res.status(500).json({ message: 'Något gick fel', error: error.message })
    }
  })
  
  router.put('/form-questions/:type', isAuthenticated, async (req, res) => {
    try {
      if (req.user.role !== 'systemadmin') {
        return res.status(403).json({ message: 'Ej behörig' })
      }
  
      const { type } = req.params
      const { questions } = req.body
  
      const updatedConfig = await FormQuestions.findOneAndUpdate(
        { type },
        { 
          questions, 
          createdBy: req.user._id 
        },
        { new: true, upsert: true }
      )
  
      res.json(updatedConfig)
    } catch (error) {
      res.status(500).json({ message: 'Något gick fel', error: error.message })
    }
  })

router.post("/save-actionplan", isAuthenticated, hasRole(ALLOWED_STAFF_ROLES), async (req, res) => {
  try {
    const allowedActionPlanFields = [
      'studentId', 'educationId', 'teacherName', 'teacherId', 'studentName', 'courseName',
      'date', 'reason', 'schoolEfforts', 'studentEfforts', 'studyTime', 'meetings',
      'notified', 'courseId', 'answers'
    ];
    const plan = {};
    for (const field of allowedActionPlanFields) {
      if (req.body[field] !== undefined) plan[field] = req.body[field];
    }
    // Also capture any extra dynamic answers into plan.answers
    const extraAnswers = {};
    for (const [key, val] of Object.entries(req.body)) {
      if (!allowedActionPlanFields.includes(key) && key !== '_id') {
        extraAnswers[key] = val;
      }
    }
    if (Object.keys(extraAnswers).length > 0) {
      plan.answers = { ...(plan.answers || {}), ...extraAnswers };
    }

    if (!plan.studentId) {
      return res.status(400).json({ error: "studentId krävs" });
    }

    let studentName = plan.studentName;
    if (!studentName && plan.studentId) {
      const student = await Student.findById(plan.studentId).select("name").lean().catch(() => null);
      if (student?.name) {
        studentName = student.name;
        plan.studentName = student.name;
      }
    }

    let courseName = plan.courseName;
    if (!courseName && plan.courseId) {
      const course = await Course.findById(plan.courseId).select("courseName").lean().catch(() => null);
      if (course?.courseName) {
        courseName = course.courseName;
        plan.courseName = course.courseName;
      }
    }

    const formConfig = await FormQuestions.findOne({ type: "ACTION_PLAN" }).lean().catch(() => null);
    const pdfBuffer = buildActionPlanPdf({
      plan,
      studentName: studentName || "",
      courseName,
      questions: formConfig?.questions,
    });
    plan.pdf = pdfBuffer;

    await ActionPlan.create(plan);

    // Markera notification för eleven/kursen som klar
    await Notification.updateOne(
      {
        studentId: plan.studentId ? String(plan.studentId) : undefined,
        courseId: plan.courseId ? String(plan.courseId) : undefined,
        type: "action_plan_required",
        resolved: false,
      },
      { $set: { resolved: true } }
    );
    if (plan.studentId) {
      await Notification.updateMany(
        { studentId: plan.studentId, type: "action_plan_required", resolved: false },
        { $set: { resolved: true } }
      ).catch(() => null);
    }

    await evaluateActionPlanStatusAndNotify();

    res.status(200).send("Handlingsplan sparad!");
  } catch (error) {
    logger.error({ err: error }, "Error saving action plan");
    res.status(500).json({ message: "Serverfel vid sparning av handlingsplan", error: error.message });
  }
});




router.post('/update-actionplan', isAuthenticated, hasRole(ALLOWED_STAFF_ROLES), async (req, res) => {
    const {
      teacherName,
      date,
      reason,
      schoolEfforts,
      studentEfforts,
      studyTime,
      meetings,
      notified
    } = req.body;
  
    try {
      // Uppdatera/infoga inställningarna
      await ActionPlan.updateOne(
        { type: 'settings' },
        {
          teacherName,
          date,
          reason,
          schoolEfforts,
          studentEfforts,
          studyTime,
          meetings,
          notified
        },
        { upsert: true }
      );
      res.send('Inställningar uppdaterade!');
    } catch (error) {
      logger.error({ err: error }, "Error updating action plan settings");
      res.status(500).send('Serverfel vid uppdatering av inställningar.');
    }
  });

export default router;