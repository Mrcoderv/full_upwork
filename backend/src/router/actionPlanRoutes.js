import { Router } from "express";
import ActionPlan from "../models/ActionPlan.js";
import Notification from "../models/Notification.js";
import FormQuestions from "../models/ActionPlanQuestions.js"
import { isAuthenticated } from "../middleware/auth.js";
const router = Router();

router.post("/form-questions", isAuthenticated, async (req, res) => {
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
        console.error("Error fetching form questions:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
})

router.get('/form-questions/:type', isAuthenticated, async (req, res) => {
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


    console.log(formConfig)
  
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

router.post("/save-actionplan", isAuthenticated, async (req, res) => {
  const plan = req.body;
  await ActionPlan.create(plan);
  // Markera notification för eleven/kursen som klar
  await Notification.updateOne(
    { studentId: plan.studentId, courseId: plan.courseId, type: "action_plan_required", resolved: false },
    { $set: { resolved: true } }
  );
  res.send("Handlingsplan sparad!");
});




router.post('/update-actionplan', isAuthenticated, async (req, res) => {
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
      console.error('Fel vid uppdatering av inställningar:', error);
      res.status(500).send('Serverfel vid uppdatering av inställningar.');
    }
  });

export default router;