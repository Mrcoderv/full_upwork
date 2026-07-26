<!-- frontend/src/views/Syv/SyvAppointments.vue -->
<template>
  <div>
    <h1>{{ pageTitle }}</h1>
    <button @click="isModalOpen = true">Boka nytt samtal</button>

    <!-- Meeting List -->
    <table>
      <thead>
        <tr>
          <th>Elev</th>
          <th>Tid</th>
          <th>Information</th>
          <th>Åtgärder</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="meeting in meetings" :key="meeting._id">
          <td>
            <router-link :to="`/student/${meeting.student.id}`">{{ meeting.student.name }}</router-link>
          </td>
          <td>{{ formatMeetingTime(meeting) }}</td>
          <td>{{ meeting.info }}</td>
          <td>
            <button @click="deleteMeeting(meeting._id)">Radera</button>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Pagination -->
    <div v-if="pagination.totalPages > 1">
      <button @click="changePage(pagination.page - 1)" :disabled="pagination.page <= 1">Föregående</button>
      <span>Sida {{ pagination.page }} av {{ pagination.totalPages }}</span>
      <button @click="changePage(pagination.page + 1)" :disabled="pagination.page >= pagination.totalPages">Nästa</button>
    </div>

    <!-- Modal -->
    <AddMeetingModal
      v-if="isModalOpen"
      @close="isModalOpen = false"
      @event-added="fetchMeetings"
      :title="'Boka nytt ' + activeRole + '-samtal'"
      :booked-by-role="activeRole"
    />
  </div>
</template>

<script>
import client from '@/api/client.js'
import { useToast } from '@/composables/useToast.js'
import AddMeetingModal from '@/views/Modals/AddMeetingModal.vue';

let toast;
export default {
  components: { AddMeetingModal },
  setup() {
    toast = useToast();
  },
  data() {
    return {
      meetings: [],
      isModalOpen: false,
      pagination: {
        page: 1,
        limit: 100,
        total: 0,
        totalPages: 1
      },
    };
  },
  computed: {
    activeRole() {
      // Get role from route meta, fallback to route name if needed
      const role = this.$route.meta.role;
      if (role) return role;
      
      // Fallback: extract from route name
      if (this.$route.name === 'SyvAppointments') return 'syv';
      if (this.$route.name === 'SpecpedAppointments') return 'specped';
      
      return null;
    },
    pageTitle() {
      return this.$route.meta.title || 'Samtal';
    }
  },
  created() {
    this.fetchMeetings();
  },
  watch: {
    // Refetch when route changes (e.g., navigating between syv and specped)
    '$route'(to, from) {
      if (to.path !== from.path) {
        this.fetchMeetings();
      }
    },
    // Also watch activeRole in case route meta changes
    activeRole() {
      this.fetchMeetings();
    }
  },
  methods: {
    formatMeetingTime(meeting) {
      if (!meeting?.start) return '';
      const start = new Date(meeting.start);
      const end = meeting.end ? new Date(meeting.end) : null;
      const dateLabel = start.toLocaleDateString('sv-SE');
      const startTime = start.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
      if (end && !isNaN(end.getTime())) {
        const endTime = end.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
        return `${dateLabel} ${startTime} - ${endTime}`;
      }
      return `${dateLabel} ${startTime}`;
    },
    async fetchMeetings() {
      try {
        if (!this.activeRole) {
          console.error('❌ No active role found for appointments view');
          return;
        }
        
        const { page, limit } = this.pagination;
        const url = `/meetings?bookedBy=${this.activeRole}&sort=start:desc&page=${page}&limit=${limit}`;
        
        console.log(`🔍 Fetching ${this.activeRole} appointments from:`, url);
        console.log(`📍 Current route:`, this.$route.path, '| Active role:', this.activeRole);
        
        // Explicitly filter by bookedBy to ensure separate lists for syv and specped
        const response = await client.get(url);
        
        const meetings = response.data.data || [];
        console.log(`📋 Fetched ${meetings.length} ${this.activeRole} appointments`);
        console.log(`📋 Meeting bookedBy values:`, meetings.map(m => ({ 
          id: m._id, 
          student: m.student?.name, 
          bookedBy: m.bookedBy 
        })));
        
        // Double-check: filter out any meetings that don't match the active role (safety check)
        const filteredMeetings = meetings.filter(m => m.bookedBy === this.activeRole);
        if (filteredMeetings.length !== meetings.length) {
          console.warn(`⚠️ Backend returned ${meetings.length} meetings but only ${filteredMeetings.length} match bookedBy=${this.activeRole}`);
        }
        
        this.meetings = filteredMeetings;
        this.pagination = response.data.pagination || this.pagination;
        this.isModalOpen = false; // Close modal on success
      } catch (error) {
        console.error(`❌ Kunde inte hämta ${this.activeRole}-samtal:`, error);
        this.meetings = [];
      }
    },
    async deleteMeeting(id) {
      if (confirm('Är du säker på att du vill radera detta möte?')) {
        try {
          await client.delete(`/meetings/${id}`);
          this.fetchMeetings(); // Refresh list
        } catch (error) {
          console.error("Kunde inte radera mötet:", error);
          toast.error('Kunde inte radera mötet.');
        }
      }
    },
    changePage(newPage) {
      if (newPage > 0 && newPage <= this.pagination.totalPages) {
        this.pagination.page = newPage;
        this.fetchMeetings();
      }
    }
  }
};
</script>

<style scoped>
table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 1rem;
}
th, td {
  border: 1px solid #ddd;
  padding: 8px;
}
th {
  background-color: #f2f2f2;
  text-align: left;
}
td a, td button {
  margin-right: 10px;
}
button {
  cursor: pointer;
}
</style>
