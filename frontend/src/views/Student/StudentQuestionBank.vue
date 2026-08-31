<template>
  <div class="student-question-bank pa-4">
    <h3 class="mb-4">Frågebank</h3>

    <v-alert v-if="loading" type="info" outlined dense>
      Laddar...
    </v-alert>

    <v-alert v-else-if="loadError" type="error" variant="tonal">
      {{ loadError }}
    </v-alert>

    <v-alert v-else-if="courses.length === 0" type="info" variant="tonal">
      Du har inga aktiva kurser med frågebank.
    </v-alert>

    <div v-else>
      <v-tabs v-model="activeTab" class="mb-4">
        <v-tab
          v-for="(courseData, index) in courses"
          :key="courseData.course?._id || index"
        >
          {{ courseData.course?.courseName || "Okänd kurs" }}
        </v-tab>
      </v-tabs>

      <v-tabs-items v-model="activeTab">
        <v-tab-item
          v-for="(courseData, index) in courses"
          :key="courseData.course?._id || index"
        >
          <v-card flat>
            <v-card-text>
              <div class="d-flex align-center justify-space-between mb-4">
                <div>
                  <h4>{{ courseData.course?.courseName }}</h4>
                  <span class="text-grey">
                    {{ courseData.course?.courseCode }}
                  </span>
                </div>
                <div class="d-flex ga-2">
                  <v-btn
                    v-if="courseData.pdfs?.questionPdfName"
                    text
                    @click="downloadPdf(courseData.course._id, 'question')"
                  >
                    <v-icon left>mdi-download</v-icon>
                    Fråge-PDF
                  </v-btn>
                  <v-btn
                    v-if="courseData.pdfs?.answerPdfName"
                    text
                    @click="downloadPdf(courseData.course._id, 'answer')"
                  >
                    <v-icon left>mdi-download</v-icon>
                    Svars-PDF
                  </v-btn>
                </div>
              </div>

              <v-alert
                v-if="courseData.questions.length === 0"
                type="info"
                outlined
                dense
              >
                Inga frågor tillgängliga för denna kurs.
              </v-alert>

              <v-table v-else dense>
                <thead>
                  <tr>
                    <th class="text-left">Fråga</th>
                    <th class="text-left">Ämne</th>
                    <th class="text-left">Typ</th>
                    <th class="text-left">Svårighetsgrad</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="question in courseData.questions"
                    :key="question._id"
                  >
                    <td class="px-4 py-2">
                      <v-icon
                        v-if="question.questionType === 'multipleChoice'"
                        left
                      >
                        mdi-checkbox-multiple-blank
                      </v-icon>
                      <v-icon
                        v-if="question.questionType === 'trueFalse'"
                        left
                      >
                        mdi-checkbox-blank-circle-outline
                      </v-icon>
                      <v-icon v-if="question.questionType === 'essay'" left>
                        mdi-file-document-edit
                      </v-icon>
                      <v-icon
                        v-if="question.questionType === 'shortAnswer'"
                        left
                      >
                        mdi-format-align-left
                      </v-icon>
                      <strong>{{ question.questionText }}</strong>
                    </td>
                    <td class="px-4 py-2">
                      {{ question.subject || "Övrig" }}
                    </td>
                    <td class="px-4 py-2">
                      <v-chip
                        :color="typeColor(question.questionType)"
                        small
                        text
                      >
                        {{ typeLabel(question.questionType) }}
                      </v-chip>
                    </td>
                    <td class="px-4 py-2">
                      <v-chip
                        :color="difficultyColor(question.difficulty)"
                        small
                        text
                      >
                        {{ difficultyLabel(question.difficulty) }}
                      </v-chip>
                    </td>
                  </tr>
                </tbody>
              </v-table>
            </v-card-text>
          </v-card>
        </v-tab-item>
      </v-tabs-items>
    </div>
  </div>
</template>

<script>
import { ref } from "vue";
import client from "@/api/client.js";
import { useToast } from "@/composables/useToast.js";

export default {
  name: "StudentQuestionBank",
  setup() {
    const toast = useToast();
    const loading = ref(true);
    const courses = ref([]);
    const loadError = ref('');
    const activeTab = ref(null);

    const availableTypes = [
      { value: "multipleChoice", label: "Multiple Choice" },
      { value: "trueFalse", label: "Sant/Falskt" },
      { value: "essay", label: "Essayfråga" },
      { value: "shortAnswer", label: "Kort svar" },
      { value: "matching", label: "Matchning" },
      { value: "ordering", label: "Ordning" },
    ];

    const typeColor = (type) => {
      const colors = {
        multipleChoice: "primary",
        trueFalse: "success",
        essay: "warning",
        shortAnswer: "info",
        matching: "secondary",
        ordering: "secondary",
      };
      return colors[type] || "secondary";
    };

    const typeLabel = (type) => {
      const found = availableTypes.find((t) => t.value === type);
      return found ? found.label : type;
    };

    const difficultyLabel = (level) => {
      const labels = { easy: "Enkel", medium: "Medel", hard: "Svår" };
      return labels[level] || level;
    };

    const difficultyColor = (level) => {
      const colors = { easy: "green", medium: "amber", hard: "red" };
      return colors[level] || "gray";
    };

    const loadCourses = async () => {
      loadError.value = '';
      try {
        const { data } = await client.get("/question-bank/student/courses");
        courses.value = Array.isArray(data.courses) ? data.courses : [];
        if (courses.value.length > 0) {
          activeTab.value = 0;
        }
      } catch (error) {
        loadError.value = 'Kunde inte hämta frågebanken.';
        toast.error(loadError.value);
      } finally {
        loading.value = false;
      }
    };

    const downloadPdf = async (courseId, type) => {
      try {
        const response = await client.get(
          `/question-bank/pdfs/${type}/download`,
          { params: { course: courseId }, responseType: 'blob' }
        );
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `fragebank-${type}.pdf`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
      } catch (error) {
        toast.error('Kunde inte ladda ner PDF-filen.');
      }
    };

    loadCourses();

    return {
      loading,
      loadError,
      courses,
      activeTab,
      typeColor,
      typeLabel,
      difficultyLabel,
      difficultyColor,
      downloadPdf,
    };
  },
};
</script>
