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
      <button :disabled="pagination.page <= 1" @click="changePage(pagination.page - 1)">Föregående</button>
      <span>Sida {{ pagination.page }} av {{ pagination.totalPages }}</span>
      <button :disabled="pagination.page >= pagination.totalPages" @click="changePage(pagination.page + 1)">Nästa</button>
    </div>

    <!-- Student Profile Section -->
    <v-card v-if="selectedStudent" class="mt-4">
      <v-card-title>
        <v-card-text>Studentprofil: {{ selectedStudent.name }}</v-card-text>
      </v-card-title>
      <v-card-text>
        <v-row>
          <v-col cols="12" sm="6">
            <v-textarea
              v-model="profileForm.additionalInfo"
              label="Övrig information"
              outlined
              dense
              hide-details
              rows="3"
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-select
              v-model="profileForm.aplStatus"
              :items="[ 'GRAY', 'BLUE', 'YELLOW', 'PURPLE', 'RED', 'GREEN' ]"
              label="APL-status"
              outlined
              dense
              hide-details
            />
          </v-col>
        </v-row>
        <v-row class="mt-3">
          <v-col cols="12">
            <v-textarea
              v-model="profileForm.specialNeeds"
              label="Särskilda behov"
              outlined
              dense
              hide-details
              rows="3"
            />
          </v-col>
        </v-row>
        <v-row class="mt-3">
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="profileForm.supportContactName"
              label="Kontaktperson namn"
              outlined
              dense
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="profileForm.supportContactPhone"
              label="Telefon"
              outlined
              dense
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="profileForm.supportContactEmail"
              label="E-post"
              outlined
              dense
            />
          </v-col>
        </v-row>
      </v-card-text>
      <v-card-actions>
        <v-btn color="primary" @click="saveProfile">Spara profil</v-btn>
        <v-btn text @click="closeProfile">Avbryt</v-btn>
      </v-card-actions>
    </v-card>

    <!-- Study Plan Revision Section -->
    <v-card v-if="selectedStudent" class="mt-4">
      <v-card-title>
        <v-card-text>Studieplanjustering</v-card-text>
      </v-card-title>
      <v-card-text>
        <v-row>
          <v-col cols="12" sm="6">
            <v-select
              v-model="studyPlan.aplStatus"
              :items="[ 'GRAY', 'BLUE', 'YELLOW', 'PURPLE', 'RED', 'GREEN' ]"
              label="Ny APL-status"
              outlined
              dense
              hide-details
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="studyPlan.notes"
              label="Motivering"
              outlined
              dense
            />
          </v-col>
        </v-row>
      </v-card-text>
      <v-card-actions>
        <v-btn color="primary" @click="saveStudyPlan">Spara justering</v-btn>
        <v-btn text @click="closeStudyPlan">Avbryt</v-btn>
      </v-card-actions>
    </v-card>

    <!-- Modal -->
    <AddMeetingModal
      v-if="isModalOpen"
      :title="'Boka nytt ' + activeRole + '-samtal'"
      :booked-by-role="activeRole"
      @close="isModalOpen = false"
      @event-added="fetchMeetings"
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
      selectedStudent: null,
      profileForm: {
        additionalInfo: '',
        aplStatus: 'GRAY',
        specialNeeds: '',
        supportContactName: '',
        supportContactPhone: '',
        supportContactEmail: ''
      },
      studyPlan: {
        aplStatus: 'GRAY',
        notes: ''
      }
    };
  },
  computed: {
    activeRole() {
      const role = this.$route.meta.role;
      if (role) return role;
      
      if (this.$route.name === 'SyvAppointments') return 'syv';
      if (this.$route.name === 'SpecpedAppointments') return 'specped';
      
      return null;
    },
    pageTitle() {
      return this.$route.meta.title || 'Samtal';
    }
  },
  watch: {
    '$route'(to, from) {
      if (to.path !== from.path) {
        this.fetchMeetings();
        this.selectedStudent = null;
        this.profileForm = {
          additionalInfo: '',
          aplStatus: 'GRAY',
          specialNeeds: '',
          supportContactName: '',
          supportContactPhone: '',
          supportContactEmail: ''
        };
        this.studyPlan = {
          aplStatus: 'GRAY',
          notes: ''
        };
      }
    },
    activeRole() {
      this.fetchMeetings();
      this.selectedStudent = null;
      this.profileForm = {
        additionalInfo: '',
        aplStatus: 'GRAY',
        specialNeeds: '',
        supportContactName: '',
        supportContactPhone: '',
        supportContactEmail: ''
      };
      this.studyPlan = {
        aplStatus: 'GRAY',
        notes: ''
      };
    }
  },
  created() {
    this.fetchMeetings();
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
        
        const response = await client.get(url);
        
        const meetings = response.data.data || [];
        console.log(`📋 Fetched ${meetings.length} ${this.activeRole} appointments`);
        console.log(`📋 Meeting bookedBy values:`, meetings.map(m => ({ 
          id: m._id, 
          student: m.student?.name, 
          bookedBy: m.bookedBy 
        })));
        
        const filteredMeetings = meetings.filter(m => m.bookedBy === this.activeRole);
        if (filteredMeetings.length !== meetings.length) {
          console.warn(`⚠️ Backend returned ${meetings.length} meetings but only ${filteredMeetings.length} match bookedBy=${this.activeRole}`);
        }
        
        this.meetings = filteredMeetings;
        this.pagination = response.data.pagination || this.pagination;
        this.isModalOpen = false;
      } catch (error) {
        console.error(`❌ Kunde inte hämta ${this.activeRole}-samtal:`, error);
        this.meetings = [];
      }
    },
    async deleteMeeting(id) {
      if (confirm('Är du säker på att du vill radera detta möte?')) {
        try {
          await client.delete(`/meetings/${id}`);
          this.fetchMeetings();
        } catch (error) {
          console.error("Kunde inte radera mötet:", error);
          toast.error('Kunde inte radera mötet.');
        }
      }
    },
    async saveProfile() {
      if (!this.selectedStudent) return;
      
      try {
        await client.put(`/students/${this.selectedStudent._id}/profile`, {
          additionalInfo: this.profileForm.additionalInfo,
          specialNeeds: this.profileForm.specialNeeds,
          supportContactName: this.profileForm.supportContactName,
          supportContactPhone: this.profileForm.supportContactPhone,
          supportContactEmail: this.profileForm.supportContactEmail
        });
        
        toast.success('Profil uppdaterad.');
        this.fetchMeetings();
        this.closeProfile();
      } catch (error) {
        console.error('Kunde inte spara profil:', error);
        toast.error('Kunde inte spara profil, försök igen.');
      }
    },
    closeProfile() {
      this.selectedStudent = null;
      this.profileForm = {
        additionalInfo: '',
        aplStatus: 'GRAY',
        specialNeeds: '',
        supportContactName: '',
        supportContactPhone: '',
        supportContactEmail: ''
      };
    },
    async saveStudyPlan() {
      if (!this.selectedStudent) return;
      
      try {
        await client.put(`/students/${this.selectedStudent._id}/study-plan`, {
          aplStatus: this.studyPlan.aplStatus,
          notes: this.studyPlan.notes
        });
        
        toast.success('Studieplan justerad.');
        this.fetchMeetings();
        this.closeStudyPlan();
      } catch (error) {
        console.error('Kunde inte spara studieplan:', error);
        toast.error('Kunde inte spara studieplan, försök igen.');
      }
    },
    closeStudyPlan() {
      this.studyPlan = {
        aplStatus: 'GRAY',
        notes: ''
      };
    }
  }
};
</script>