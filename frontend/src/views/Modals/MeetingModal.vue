<template>
  <div class="modal-overlay">
    <div class="modal-content">
      <div class="modal-header">
        <h3>Mötesdetaljer</h3>
        <button 
          v-if="canDelete" 
          class="delete-btn" 
          title="Radera möte"
          @click="deleteMeeting"
        >
          🗑️
        </button>
      </div>
      <div class="scrollable-view">
        <p>
          <strong>Elev:</strong> 
          <router-link 
            v-if="event.extendedProps.studentId" 
            :to="`/student/${event.extendedProps.studentId}`"
            class="student-link"
          >
            {{ event.extendedProps.studentName }}
          </router-link>
          <span v-else>{{ event.extendedProps.studentName }}</span>
        </p>
        <p><strong>Datum:</strong> {{ formatDate(event.start) }}</p>
        <p><strong>Tid:</strong> {{ formatTimeRange(event.start, event.end) }}</p>
        <p><strong>Plats:</strong> {{ event.extendedProps.location }}</p>
        <p v-if="event.extendedProps.info"><strong>Information:</strong> {{ event.extendedProps.info }}</p>
        <p><strong>Bokad av:</strong> {{ bookedByName }}</p>
      </div>

      <div class="buttons">
        <button @click="$emit('close')">Stäng</button>
      </div>
    </div>
  </div>
</template>

<script>
import client from '@/api/client.js'
import { useToast } from '@/composables/useToast.js'

let toast;
export default {
  props: {
    event: Object // från kalendern, ex: event.extendedProps
  },
  emits: ['close', 'deleted'],
  setup() {
    toast = useToast();
  },
  computed: {
    userRole() {
      return this.$store.getters.userRole || 'guest';
    },
    currentUserId() {
      return this.$store.state.user?.userId || this.$store.state.user?._id;
    },
    currentUsername() {
      return this.$store.state.user?.username || this.$store.state.user?.email;
    },
    canDelete() {
      // Admins and systemadmins can always delete
      if (this.userRole === 'admin' || this.userRole === 'systemadmin') {
        return true;
      }
      // Creator can delete - check if createdBy matches current user
      const createdBy = this.event.extendedProps?.createdBy;
      if (createdBy) {
        const createdById = typeof createdBy === 'object' ? createdBy._id || createdBy.toString() : createdBy.toString();
        const currentId = this.currentUserId?.toString();
        return createdById === currentId;
      }
      // Fallback: check if username matches (from title or createdByUsername)
      const createdByUsername = this.event.extendedProps?.createdByUsername;
      if (createdByUsername && this.currentUsername) {
        return createdByUsername === this.currentUsername;
      }
      return false;
    },
    bookedByName() {
      // Debug: log what we have
      console.log('🔍 MeetingModal - event data:', {
        createdByUsername: this.event.extendedProps?.createdByUsername,
        createdBy: this.event.extendedProps?.createdBy,
        originalTitle: this.event.extendedProps?.originalTitle,
        title: this.event.title,
        bookedBy: this.event.extendedProps?.bookedBy
      });
      
      // First, try to get username from createdBy (populated from backend)
      if (this.event.extendedProps?.createdByUsername) {
        return this.event.extendedProps.createdByUsername;
      }
      
      // Check if createdBy is an object with username
      const createdBy = this.event.extendedProps?.createdBy;
      if (createdBy && typeof createdBy === 'object' && createdBy.username) {
        return createdBy.username;
      }
      if (createdBy && typeof createdBy === 'object' && createdBy.email) {
        return createdBy.email;
      }
      
      // Fallback: Extract username from original title
      // Title formats:
      // - "Username, Syv" or "Username, Special Pedagog" for syv/specped
      // - "Möte, Student name" for admin/systemadmin
      const originalTitle = this.event.extendedProps?.originalTitle || this.event.title || '';
      
      // If title contains a comma, extract the part before it
      if (originalTitle.includes(',')) {
        const parts = originalTitle.split(',');
        // If it's "Möte, Student name" format, we don't have the creator name in title
        if (parts[0].trim() === 'Möte') {
          // For admin-created meetings, we need to get from createdBy
          // If we still don't have it, return a generic message
          return 'Okänd användare';
        }
        // Otherwise, return the username part (for syv/specped)
        return parts[0].trim();
      }
      
      // Final fallback: return a generic message instead of role
      return 'Okänd användare';
    }
  },
  methods: {
    formatDate(date) {
      return new Date(date).toLocaleDateString('sv-SE', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    },
    formatTime(date) {
      return new Date(date).toLocaleTimeString('sv-SE', {
        hour: '2-digit',
        minute: '2-digit'
      });
    },
    formatTimeRange(start, end) {
      if (!start) return '';
      const startTime = this.formatTime(start);
      if (!end) return startTime;
      const endTime = this.formatTime(end);
      return `${startTime} - ${endTime}`;
    },
    async deleteMeeting() {
      if (!confirm('Är du säker på att du vill radera detta möte?')) {
        return;
      }
      
      try {
        await client.delete(`/meetings/${this.event.id}`);
        this.$emit('deleted');
        this.$emit('close');
      } catch (error) {
        console.error('❌ Kunde inte radera mötet:', error);
        toast.error('Kunde inte radera mötet.');
      }
    }
  }
};
</script>

<style scoped>
.meeting-info {
  padding: 1rem;
}
.meeting-info p {
  margin: 0.3rem 0;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.modal-content {
  background: white;
  padding: 20px;
  width: 400px;
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
  position: relative;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid #eee;
}

.modal-header h3 {
  margin: 0;
}

.delete-btn {
  background: #dc3545;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  font-size: 1.2rem;
  transition: background-color 0.2s;
}

.delete-btn:hover {
  background: #c82333;
}

.scrollable-view {
  max-height: 400px;
  overflow-y: auto;
}

.scrollable-view p {
  margin: 0.5rem 0;
}

.student-link {
  color: #007bff;
  text-decoration: none;
  font-weight: 500;
}

.student-link:hover {
  text-decoration: underline;
  color: #0056b3;
}

.buttons {
  margin-top: 1rem;
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.buttons button {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  background: #007bff;
  color: white;
  cursor: pointer;
}

.buttons button:hover {
  background: #0056b3;
}
</style>
