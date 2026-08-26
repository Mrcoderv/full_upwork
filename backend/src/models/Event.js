import mongoose from "mongoose";

const studentAttendedSchema = new mongoose.Schema(
    {
      _id: { type: mongoose.Schema.Types.ObjectId, auto: false },
      name: String,
      personalNumber: String,
      attended: { type: Boolean, default: false },
    },
    { _id: false }
  );

  const extendedPropsSchema = new mongoose.Schema(
    {
      teacher: String,
      teacherId: mongoose.Schema.Types.ObjectId,
      type: String,
      examMunicipality: String,
      examLocation: String,
      examTime: String,
      examRoom: { type: String, default: "" },  // Configurable room
      students: [studentAttendedSchema],
      accommodations: {
        extraTime: { type: Number, default: 0 },   // Extra writing time in minutes
        computer: { type: Boolean, default: false },
        separateRoom: { type: Boolean, default: false },
      },
    },
    { _id: false }
  );
  
  const eventSchema = new mongoose.Schema({
    title: String,
    start: Date,
    color: String,
    extendedProps: extendedPropsSchema,
  });

export default mongoose.model("CalendarEvent", eventSchema, "calendar_events");
