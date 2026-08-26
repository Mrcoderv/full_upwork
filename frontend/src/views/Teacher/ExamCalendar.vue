<template>
  <div class="scrollable-view">
    <div class="calendar-container">
      <div class="main-calendar">
        <div v-if="canBookEvent" class="admin-controls mb-3">
          <button v-if="isSYVOrSpecped || isAdmin" @click="openAddEventModal('meeting')">
            🗓️ Lägg till möte
          </button>
        </div>

        <FullCalendar ref="fullCalendar" :options="calendarOptions" />

        <AddMeetingModal
          v-if="showAddEventModal && eventType === 'meeting'"
          :booked-by-role="userRole"
          :title="'Boka nytt möte'"
          @close="closeModal"
          @event-added="addEventToCalendar"
        />

        <EventModal
          v-if="selectedEvent && isExamEvent"
          :event="selectedEvent"
          @close="selectedEvent = null"
          @update="handleExamUpdate"
        />

        <MeetingModal
          v-if="selectedEvent && isMeetingEvent"
          :event="selectedEvent"
          @close="selectedEvent = null"
          @deleted="handleExamUpdate"
        />
      </div>
    </div>
  </div>
</template>

<script>
  import FullCalendar from '@fullcalendar/vue3'
  import dayGridPlugin from '@fullcalendar/daygrid'
  import interactionPlugin from '@fullcalendar/interaction'
  import EventModal from '../Modals/EventModal.vue'
  import AddMeetingModal from '../Modals/AddMeetingModal.vue'
  import MeetingModal from '../Modals/MeetingModal.vue'

  export default {
    components: { FullCalendar, EventModal, AddMeetingModal, MeetingModal },

    data() {
      return {
        loadingUser: true,
        selectedEvent: null,
        showAddEventModal: false,
        eventType: null,
        calendarOptions: {
          plugins: [dayGridPlugin, interactionPlugin],
          initialView: 'dayGridMonth',
          editable: true,
          eventStartEditable: true,
          selectable: true,
          events: [],
          eventClick: this.openEventModal,
          eventDrop: this.handleEventDrop,
          locale: 'sv',
          firstDay: 1,
          height: 'auto',
          contentHeight: 'auto',
          aspectRatio: 1.35,
          buttonText: {
            today: 'Idag',
            month: 'Månad',
            week: 'Vecka',
            day: 'Dag',
            list: 'Lista',
          },
          headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,dayGridWeek,dayGridDay',
          },
          displayEventTime: false,
        },
      }
    },
    computed: {
      isExamEvent() {
        // Check if the selected event is an exam event (slutprov type)
        return (
          this.selectedEvent &&
          (this.selectedEvent.extendedProps?.type === 'slutprov' ||
            (this.selectedEvent.extendedProps?.type === undefined &&
              !this.selectedEvent.extendedProps?.isMeeting))
        )
      },
      isMeetingEvent() {
        return this.selectedEvent && this.selectedEvent.extendedProps?.isMeeting === true
      },
      userRole() {
        return this.$store.getters.userRole || 'guest'
      },
      isAdmin() {
        return ['admin', 'systemadmin'].includes(this.userRole)
      },
      isAdminOrTeacher() {
        return ['systemadmin', 'teacher', 'admin'].includes(this.userRole)
      },
      isSYVOrSpecped() {
        return ['syv', 'specped', 'systemadmin', 'admin'].includes(this.userRole)
      },
      canBookEvent() {
        return this.isAdminOrTeacher || this.isSYVOrSpecped
      },
    },
    async mounted() {
      // Get current teacher ID if user is a teacher (for filtering editable events)
      if (this.userRole === 'teacher') {
        try {
          const { default: client } = await import('@/api/client.js')
          const res = await client.get('/me/teacher')
          if (res.data && res.data._id) {
            this.currentTeacherId = res.data._id.toString()
          }
        } catch (err) {
          console.error('❌ Kunde inte hämta lärare:', err)
        }
      }
      await this.fetchEvents()
    },
    methods: {
      openAddEventModal(type) {
        this.selectedEvent = null
        this.eventType = type
        this.showAddEventModal = true
      },
      closeModal() {
        this.showAddEventModal = false
        this.eventType = null
      },
      async addEventToCalendar(meeting) {
        const calendarApi = this.$refs.fullCalendar.getApi()

        // Format the meeting data similar to how it's done in fetchEvents
        const studentName = meeting.student?.name || 'Okänd'
        let displayTitle = meeting.title || 'Möte'

        // Format title based on bookedBy and student name (matching fetchEvents logic)
        if (!displayTitle || displayTitle === 'Möte') {
          const roleLabel =
            meeting.bookedBy === 'syv' ? 'Syv' : meeting.bookedBy === 'specped' ? 'Specped' : ''
          displayTitle = roleLabel ? `${roleLabel}, ${studentName}` : `Möte, ${studentName}`
        } else if (displayTitle.startsWith('Möte,')) {
          // Already in "Möte, Student name" format - keep it
          displayTitle = displayTitle
        } else if (!displayTitle.includes(studentName)) {
          // Title doesn't contain student name, format as "Role, Student name"
          const roleLabel =
            meeting.bookedBy === 'syv' ? 'Syv' : meeting.bookedBy === 'specped' ? 'Specped' : ''
          displayTitle = roleLabel ? `${roleLabel}, ${studentName}` : `Möte, ${studentName}`
        }

        // Extract createdBy username
        const createdByUsername =
          meeting.createdBy?.username ||
          meeting.createdBy?.email ||
          (typeof meeting.createdBy === 'string' ? null : null)

        // Create properly formatted event matching fetchEvents format
        const formattedEvent = {
          id: meeting._id,
          title: displayTitle,
          start: meeting.start,
          end: meeting.end || meeting.start,
          allDay: false,
          editable: true,
          color: '#999999',
          extendedProps: {
            isMeeting: true,
            studentName: studentName,
            studentId: meeting.student?.id || meeting.student?._id || null,
            personalNumber: meeting.student?.personalNumber || '',
            location: meeting.location || '',
            bookedBy: meeting.bookedBy || '',
            createdBy: meeting.createdBy?._id || meeting.createdBy,
            createdByUsername: createdByUsername,
            originalTitle: meeting.title,
            _id: meeting._id, // Ensure _id is available for deletion
          },
        }

        calendarApi.addEvent(formattedEvent)
        this.closeModal()

        // Refresh events to ensure proper formatting and all data is synced
        // This ensures the event has all populated fields (like createdBy) and is immediately deletable
        await this.fetchEvents()
      },
      changeView(view) {
        const calendarApi = this.$refs.fullCalendar.getApi()
        calendarApi.changeView(view)
      },
      async fetchEvents() {
        const { api } = await import('@/store/store.js')
        try {
          const [savedEvents, syncedEvents, meetings] = await Promise.all([
            api.get('/calendar-events'),
            api.get('/calendar-events/syncable'),
            api.get('/meetings'),
          ])

          const allEvents = [
            // Filter out "slutprov" type events - these should come from syncable instead
            ...savedEvents.data
              .filter(
                (event) =>
                  event.extendedProps?.type !== 'slutprov' && event.extendedProps?.type !== 'exam'
              )
              .map((event) => ({
                id: event._id,
                title: event.title,
                start: event.start,
                allDay: true,
                color: event.color || '#999999',
                editable: true, // Saved events should be editable
                extendedProps: { ...(event.extendedProps || {}), saved: true },
              })),
            ...syncedEvents.data.map((event) => {
              // Make synced events editable for admins and the responsible teacher
              const isAdmin = ['admin', 'systemadmin'].includes(this.userRole)
              const eventTeacherId =
                event.extendedProps?.teacherId?._id?.toString() ||
                event.extendedProps?.teacherId?.toString()
              const isResponsibleTeacher =
                eventTeacherId &&
                this.userRole === 'teacher' &&
                this.currentTeacherId === eventTeacherId
              const isEditable = isAdmin || isResponsibleTeacher

              return {
                id: event.id, // comes from /calendar-events/syncable
                title: event.title,
                start: event.start,
                allDay: true,
                color: event.color || '#999999',
                editable: isEditable, // allow drag for admins and responsible teachers
                extendedProps: {
                  ...(event.extendedProps || {}),
                  synced: true,
                  courseInstanceIds: event.extendedProps?.courseInstanceIds || [],
                  teacherId: eventTeacherId,
                },
              }
            }),
            ...(meetings.data?.data || []).map((meeting) => {
              const studentName = meeting.student?.name || 'Okänd'
              let displayTitle = meeting.title // Use the original title from database

              // Debug log
              console.log('📅 Processing meeting:', {
                title: meeting.title,
                bookedBy: meeting.bookedBy,
                createdBy: meeting.createdBy,
                studentName,
              })

              // If title is in "Möte, Student name" format (admin/systemadmin), keep it
              // Otherwise, format as "Role, Student name" for syv/specped
              if (!displayTitle || displayTitle === 'Möte') {
                // Fallback: format based on bookedBy
                const roleLabel =
                  meeting.bookedBy === 'syv'
                    ? 'Syv'
                    : meeting.bookedBy === 'specped'
                    ? 'Specped'
                    : ''
                displayTitle = roleLabel ? `${roleLabel}, ${studentName}` : `Möte, ${studentName}`
              } else if (displayTitle.startsWith('Möte,')) {
                // Already in "Möte, Student name" format - keep it
                displayTitle = displayTitle
              } else if (!displayTitle.includes(studentName)) {
                // Title doesn't contain student name, format as "Role, Student name"
                const roleLabel =
                  meeting.bookedBy === 'syv'
                    ? 'Syv'
                    : meeting.bookedBy === 'specped'
                    ? 'Specped'
                    : ''
                displayTitle = roleLabel ? `${roleLabel}, ${studentName}` : `Möte, ${studentName}`
              }

              // Extract createdBy username
              const createdByUsername =
                meeting.createdBy?.username ||
                meeting.createdBy?.email ||
                (typeof meeting.createdBy === 'string' ? null : null)

              return {
                id: meeting._id,
                title: displayTitle,
                start: meeting.start,
                end: meeting.end || meeting.start,
                allDay: false,
                editable: true,
                color: '#999999',
                extendedProps: {
                  isMeeting: true,
                  studentName: studentName,
                  studentId: meeting.student?.id || meeting.student?._id || null,
                  personalNumber: meeting.student?.personalNumber || '',
                  location: meeting.location || '',
                  bookedBy: meeting.bookedBy || '',
                  createdBy: meeting.createdBy?._id || meeting.createdBy,
                  createdByUsername: createdByUsername,
                  originalTitle: meeting.title, // Keep original title to extract username
                },
              }
            }),
          ]

          // Use FullCalendar API to ensure DnD works immediately without page refresh
          const calendarApi = this.$refs.fullCalendar.getApi()
          calendarApi.removeAllEvents()
          allEvents.forEach((e) => calendarApi.addEvent(e))

          // Debug
          console.log('Alla events som skickas till kalendern:', allEvents)
          allEvents.forEach((e) => {
            if (e.extendedProps && e.extendedProps.type === 'slutprov') {
              console.log('EXAM-EVENT:', e)
            }
          })
        } catch (error) {
          console.error('❌ Kunde inte ladda kalender-events:', error.message)
        }
      },
      openEventModal(info) {
        const fcEvent = info.event

        // Bygg ett plain object för modalen med deep copy
        const eventObj = {
          id: fcEvent.id,
          _id: fcEvent.extendedProps?._id || fcEvent.id,
          title: fcEvent.title,
          start: fcEvent.start,
          end: fcEvent.end,
          allDay: fcEvent.allDay,
          color: fcEvent.backgroundColor || fcEvent.extendedProps?.color || '#999999',
          extendedProps: {
            ...fcEvent.extendedProps,
          },
        }

        console.log('extendedProps on click:', fcEvent.extendedProps)
        this.selectedEvent = JSON.parse(JSON.stringify(eventObj))
        this.eventType = this.selectedEvent.extendedProps?.type === 'slutprov' ? 'exam' : 'meeting'

        console.log('SKICKAR event till modal:', this.selectedEvent)
      },
      handleEventDrop(info) {
        const updatedEvent = {
          start: info.event.start,
        }

        const eventId = info.event.id
        const isMeeting = info.event.extendedProps?.isMeeting
        const isSavedCalendarEvent = info.event.extendedProps?.saved === true
        const isSynced = info.event.extendedProps?.synced === true

        // Handle synced events (from course instances/enrollments)
        if (isSynced && !isMeeting && !isSavedCalendarEvent) {
          const teacherId = info.event.extendedProps?.teacherId
          // Get the original date from oldEvent or calculate from delta
          const oldStart = info.oldEvent?.start || info.event.start
          const newStart = info.event.start

          // Format dates using local date components to avoid timezone shifts
          const formatDateLocal = (date) => {
            if (!date) return null
            const d = new Date(date)
            const year = d.getFullYear()
            const month = String(d.getMonth() + 1).padStart(2, '0')
            const day = String(d.getDate()).padStart(2, '0')
            return `${year}-${month}-${day}`
          }

          const fromDate = formatDateLocal(oldStart)
          const toDate = formatDateLocal(newStart)
          const courseInstanceIds = info.event.extendedProps?.courseInstanceIds || []

          if (!teacherId || !fromDate || !toDate) {
            console.warn('🟠 Synced event missing required data:', { teacherId, fromDate, toDate })
            info.revert()
            return
          }

          import('@/store/store.js').then(({ api }) => {
            api
              .put(
                '/calendar-events/move-group',
                {
                  teacherId,
                  fromDate,
                  toDate,
                  courseInstanceIds,
                }
              )
              .then(() => {
                console.log('✅ Synced event moved successfully!')
                // Don't refresh immediately - the event is already in the correct visual position
                // The backend has been updated, so the data is correct
                // Refreshing immediately can cause the event to reset to its old position
                // if the database query happens before the update is fully committed
                // The event will be in the correct position on the next natural refresh
              })
              .catch((err) => {
                console.error(
                  '❌ Kunde inte flytta synced event:',
                  err.response?.data || err.message
                )
                info.revert()
              })
          })
          return
        }

        // Guard: do not allow dragging of other synced events without a real DB id
        if (!isMeeting && !isSavedCalendarEvent) {
          console.warn('🟠 Dragging is only allowed for sparade kalender-händelser och möten.')
          info.revert()
          return
        }

        import('@/api/client.js').then(({ default: client }) => {
          const endpoint = isMeeting ? `/meetings/${eventId}` : `/calendar-events/${eventId}`
          client
            .put(endpoint, updatedEvent)
            .then(() => {
              console.log(isMeeting ? '✅ Möte uppdaterat!' : '✅ Event uppdaterat!')
            })
            .catch((err) => {
              console.error(
                isMeeting ? '❌ Kunde inte uppdatera möte:' : '❌ Kunde inte uppdatera event:',
                err.response?.data || err.message
              )
              info.revert()
            })
        })
      },
      async handleExamUpdate() {
        console.log('🔄 handleExamUpdate called - refreshing calendar data...')
        await this.fetchEvents()
        this.selectedEvent = null
      },
    },
  }
</script>

<style>
  .calendar-container {
    display: flex;
    width: 100%;
    height: 100%;
  }
  .main-calendar {
    width: 100%;
    padding: 5px;
    display: flex;
    flex-direction: column;
    height: calc(100vh - 80px);
    overflow: hidden;
  }
  .main-calendar :deep(.fc) {
    height: 100% !important;
    flex: 1;
    overflow: hidden;
  }
  .main-calendar :deep(.fc-view-harness) {
    height: 100% !important;
  }
  .main-calendar :deep(.fc-daygrid) {
    height: 100% !important;
  }
  .main-calendar :deep(.fc-scroller) {
    overflow: visible !important;
    height: 100% !important;
  }
  .main-calendar :deep(.fc-scroller-liquid-absolute) {
    position: relative !important;
    height: 100% !important;
  }

  /* Force calendar to fit viewport - override FullCalendar defaults */
  .main-calendar :deep(.fc-daygrid-body) {
    height: auto !important;
  }

  .main-calendar :deep(.fc-daygrid-table) {
    height: auto !important;
  }

  /* Make sure empty cells have zero height */
  .main-calendar :deep(.fc-daygrid-day:not(:has(.fc-daygrid-event)) .fc-daygrid-day-frame) {
    height: auto !important;
    min-height: 0 !important;
    display: flex;
    flex-direction: column;
  }

  /* Remove any default min-height from FullCalendar */
  .main-calendar :deep(.fc-daygrid-day) {
    min-height: 0 !important;
  }

  /* Override any aspect ratio or height calculations */
  .main-calendar :deep(.fc-daygrid-body > table) {
    table-layout: auto !important;
  }

  /* Make calendar more compact */
  .main-calendar :deep(.fc-header-toolbar) {
    margin-bottom: 0.5em;
    padding: 0.3em 0;
  }

  .main-calendar :deep(.fc-toolbar-title) {
    font-size: 1.1em;
  }

  .main-calendar :deep(.fc-button) {
    padding: 0.25em 0.5em;
    font-size: 0.8em;
  }

  /* Remove ALL padding from day cells - be very aggressive */
  .main-calendar :deep(.fc-daygrid-day) {
    padding: 0 !important;
    border: 1px solid #ddd;
    height: auto !important;
  }

  .main-calendar :deep(.fc-daygrid-day-frame) {
    min-height: 0 !important;
    max-height: none !important;
    height: auto !important;
    padding: 0 !important;
    margin: 0 !important;
  }

  .main-calendar :deep(.fc-daygrid-day-number) {
    padding: 1px 2px !important;
    font-size: 0.8em;
    line-height: 1;
    margin: 0 !important;
  }

  /* Make empty days single line - only show day number */
  .main-calendar :deep(.fc-daygrid-day-top) {
    padding: 0 !important;
    min-height: 0 !important;
    margin: 0 !important;
    height: auto !important;
    line-height: 1.2;
  }

  /* Remove extra spacing in day cells */
  .main-calendar :deep(.fc-daygrid-day-events) {
    margin: 0 !important;
    padding: 0 !important;
    min-height: 0 !important;
  }

  /* Ensure day body has no padding when empty */
  .main-calendar :deep(.fc-daygrid-day-bg) {
    padding: 0 !important;
    margin: 0 !important;
  }

  .main-calendar :deep(.fc-daygrid-day > *) {
    padding: 0 !important;
    margin: 0 !important;
  }

  /* Force table cells to have no height when empty */
  .main-calendar :deep(.fc-daygrid-body tr) {
    height: auto !important;
  }

  .main-calendar :deep(.fc-daygrid-body td) {
    padding: 0 !important;
    height: auto !important;
    vertical-align: top;
    line-height: 1;
  }

  /* Remove any default cell height */
  .main-calendar :deep(.fc-daygrid-day:empty),
  .main-calendar :deep(.fc-daygrid-day:not(:has(.fc-daygrid-event))) {
    height: auto !important;
    min-height: 0 !important;
  }

  /* Make events very compact */
  .main-calendar :deep(.fc-daygrid-event) {
    margin: 0 1px !important;
    padding: 0 2px !important;
    font-size: 0.7em;
    line-height: 1.1;
    min-height: 0;
  }

  .main-calendar :deep(.fc-event-title) {
    padding: 0 1px !important;
    font-size: 0.7em;
    line-height: 1.1;
  }

  /* Remove row spacing completely */
  .main-calendar :deep(.fc-daygrid-body) {
    border-spacing: 0 !important;
    border-collapse: collapse;
  }

  .main-calendar :deep(.fc-daygrid-body tr) {
    height: auto !important;
    min-height: 0 !important;
  }

  .main-calendar :deep(.fc-daygrid-body td) {
    padding: 0 !important;
    height: auto !important;
    min-height: 0 !important;
    vertical-align: top;
    line-height: 1;
  }

  .main-calendar :deep(.fc-daygrid-event) {
    margin: 1px 2px;
    padding: 1px 3px;
    font-size: 0.75em;
    line-height: 1.2;
  }

  .main-calendar :deep(.fc-event-title) {
    padding: 0 2px;
    font-size: 0.75em;
  }

  .main-calendar :deep(.fc-col-header-cell) {
    padding: 2px 0 !important;
  }

  .main-calendar :deep(.fc-col-header-cell-cushion) {
    font-size: 0.8em;
    font-weight: 600;
    padding: 0 2px;
  }

  .admin-controls {
    margin: 10px 0;
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
  }
  .admin-controls button {
    padding: 8px 14px;
    font-size: 13px;
    font-weight: 500;
    border: none;
    background-color: #007bff;
    color: white;
    border-radius: 6px;
    transition: background-color 0.3s ease;
  }
  .admin-controls button:hover {
    background-color: #0056b3;
  }
  @media (max-width: 768px) {
    .admin-controls {
      flex-direction: column;
      align-items: stretch;
    }
    .admin-controls button {
      width: 100%;
    }
    .main-calendar :deep(.fc) {
      height: calc(100vh - 150px);
      min-height: 500px;
    }
    .main-calendar :deep(.fc-daygrid-day-frame) {
      min-height: 0;
    }
    .main-calendar :deep(.fc-daygrid-event) {
      font-size: 0.7em;
    }
  }
</style>
