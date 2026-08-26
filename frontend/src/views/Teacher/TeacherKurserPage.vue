<template>
  <v-container fluid>
    <v-card>
      <v-card-title>
        <h1>Kurser</h1>
      </v-card-title>
      <v-card-text>
        <v-tabs v-model="tab" background-color="primary" dark>
          <v-tab value="overview">Kursöversikt</v-tab>
          <!-- <v-tab value="single">Kurs (enskild)</v-tab> -->
        </v-tabs>

        <v-window v-model="tab">
          <v-window-item value="overview">
            <CourseOverview />
          </v-window-item>
          <!-- <v-window-item value="single">
            <EnrollSingleCourse />
          </v-window-item> -->
        </v-window>
      </v-card-text>
    </v-card>
  </v-container>
</template>

<script>
import CourseOverview from '@/components/Teacher/CourseOverview.vue';

export default {
  name: 'TeacherKurserPage',
  components: {
    CourseOverview,
  },
  data() {
    return {
      tab: 'overview',
    };
  },
};
</script>

<style scoped>
.v-container {
  padding: 24px;
}
</style>
