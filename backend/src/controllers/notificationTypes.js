// constants/notificationTypes.js

const NOTIFICATION_TYPES = {
    // 📚 Betyg
    GRADES_PENDING: "grades_pending", // Global – saknas betyg
    ACTION_PLAN_REQUIRED: "action_plan_required", // Per elev/kurs – F kräver åtgärdsplan
    GLOBAL_ACTION_PLAN_REQUIRED: "global_action_plan_required", // Global – någon har F utan handlingsplan
  
    // 📄 Dokument
    DOCUMENT_UPLOADED: "document_uploaded", // Någon laddade upp ett dokument
  
    // 💬 Kommentarer
    COMMENT_ADDED: "comment_added", // Kommentar tillagd på elevkort
  
    // 🧪 Prövningar
    EXAM_REQUEST: "exam_request", // Prövningselev vill boka prövning
  
    // 🛑 Avbrott
    DROPOUT: "dropout", // Elev har avbrutit kurs eller paket
  
    // 📆 Slutprov
    FINAL_EXAM_SOON: "final_exam_soon", // Elev har slutprov inom 14 dagar
  
    // ✍️ Signering
    SIGNING_REQUIRED: "signing_required", // Läraren behöver signera betygskatalog

    // 🔒 Betyg lås/upplås
    GRADE_LOCKED: "grade_locked", // Betyg låst — admin meddelas så de kan betygsätta i kommunernas system
    GRADE_UNLOCKED: "grade_unlocked", // Betyg upplåst (admin/systemadmin)
  
    // 🗓️ Möten
    MEETING_BOOKED: "meeting_booked", // SYV/specped bokat möte med elev
  
    // 👷 APL-status
    APL_WARNING: "apl_warning", // T.ex. röd varning – praktik snart slut
    APL_COMPLETE: "apl_complete", // Praktik avslutad
  
    // 🧹 Annat/metodiskt
    SYSTEM_ALERT: "system_alert", // För generella systemmeddelanden
  
    // Lägg till fler vid behov...
  };
  
  export default NOTIFICATION_TYPES;
  