<template>
  <div class="question-bank-page">
    <div class="card">
      <div class="card-header">
        <h3>Frågebank</h3>
        <v-row>
          <v-col cols="12" sm="4">
            <v-select
              v-model="filterSubject"
              :items="availableSubjects"
              label="Ämne"
              dense
              outlined
              @update:modelValue="applyFilters"
            />
          </v-col>
          <v-col cols="12" sm="4">
            <v-select
              v-model="filterType"
              :items="availableTypes"
              label="Frågetyp"
              dense
              outlined
              @update:modelValue="applyFilters"
            />
          </v-col>
          <v-col cols="12" sm="4">
            <v-switch
              v-model="filterActive"
              label="Endast aktiva"
              dense
              outlined
              @change="applyFilters"
            />
          </v-col>
        </v-row>
      </div>

      <div class="card-body p-0">
        <v-table dense>
          <thead>
            <tr>
              <th class="text-left">Fråga</th>
              <th class="text-left">Ämne</th>
              <th class="text-left">Typ</th>
              <th class="text-left">Svårighetsnivå</th>
              <th class="text-left">Skapad</th>
              <th class="text-right">Åtgärder</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="question in filteredQuestions" :key="question._id">
              <td class="px-4 py-2">
                <v-icon left v-if="question.questionType === 'multipleChoice'">mdi-checkbox-multiple-blank</v-if>
                <v-icon left v-if="question.questionType === 'trueFalse'">mdi-checkbox-blank-circle-outline</v-if>
                <v-icon left v-if="question.questionType === 'essay'">mdi-file-document-edit</v-if>
                <v-icon left v-if="question.questionType === 'shortAnswer'">mdi-format-align-left</v-if>
                <strong>{{ question.questionText.substring(0, 50) }}{{
                  question.questionText.length > 50 ? "..." : ""
                }}</strong>
              </td>
              <td class="px-4 py-2">{{ question.subject || "Övrig" }}</td>
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
              <td class="px-4 py-2">{{ formatDate(question.createdAt) }}</td>
              <td class="px-4 py-2 text-right">
                <v-icon small @click="editQuestion(question)" title="Redigera">
                  mdi-pencil
                </v-icon>
                <v-icon
                  small
                  @click="deleteQuestion(question)"
                  title="Ta bort"
                  color="red"
                >
                  mdi-delete
                </v-icon>
              </td>
            </tr>
            <tr v-if="filteredQuestions.length === 0">
              <td colspan="6" class="text-center text-grey">
                Inga frågor hittades
              </td>
            </tr>
          </tbody>
        </v-table>
      </div>
    </div>

    <div class="modal-overlay" v-if="showCreateModal">
      <div class="modal-card">
        <v-card>
          <v-card-title>
            <span class="headline">Skapa ny fråga</span>
            <v-btn
              class="ma-2"
              text
              @click="showCreateModal = false"
            >
              Avbryt
            </v-btn>
            <v-btn
              class="ma-2"
              color="primary"
              @click="createQuestion"
            >
              Spara
            </v-btn>
          </v-card-title>

          <v-card-text>
            <v-container>
              <v-row>
                <v-col cols="12">
                  <v-text-field
                    v-model="newQuestion.questionText"
                    label="Frågetext *"
                    required
                    dense
                  />
                </v-col>
                <v-col cols="6">
                  <v-select
                    v-model="newQuestion.subject"
                    :items="availableSubjects"
                    label="Ämne"
                    dense
                  />
                </v-col>
                <v-col cols="6">
                  <v-select
                    v-model="newQuestion.questionType"
                    :items="availableTypes"
                    label="Frågetyp"
                    dense
                  />
                </v-col>
              </v-row>

              <v-row v-if="newQuestion.questionType !== 'essay' && newQuestion.questionType !== 'shortAnswer'" class="mb-4">
                <v-col cols="12">
                  <v-text-field
                    v-model="newQuestion.options"
                    label="Alternativ (komma separerade)"
                    dense
                    append-icon="mdi-format-list-numbers"
                  />
                </v-col>
              </v-row>

              <v-row v-if="newQuestion.questionType !== 'essay' && newQuestion.questionType !== 'shortAnswer'" class="mb-4">
                <v-col cols="12">
                  <v-text-field
                    v-model="newQuestion.correctAnswer"
                    label="Rät svar"
                    dense
                  />
                </v-col>
              </vRow>

              <v-row>
                <v-col cols="6">
                  <v-select
                    v-model="newQuestion.moduleNumber"
                    :items="[1, 2, 3, 4, 5]"
                    label="Modul"
                    dense
                  />
                </v-col>
                <v-col cols="6">
                  <v-select
                    v-model="newQuestion.difficulty"
                    :items="['easy', 'medium', 'hard']"
                    label="Svårighetsnivå"
                    dense
                  />
                </v-col>
              </v-row>
            </v-container>
          </v-card-text>
        </v-card>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed } from "vue";
import client from "@/api/client.js";
import { useToast } from "@/composables/useToast.js";

export default {
  name: "QuestionBank",
  setup() {
    const toast = useToast();

    // State
    const questions = ref([]);
    const filterSubject = ref("");
    const filterType = ref("");
    const filterActive = ref(true);
    const showCreateModal = ref(false);
    const newQuestion = ref({
      questionText: "",
      subject: "Övrig",
      questionType: "multipleChoice",
      options: "",
      correctAnswer: "",
      moduleNumber: 3,
      difficulty: "medium",
    });

    // Computed
    const availableSubjects = ref([
      "Matematik",
      "Svenska",
      "Engelska",
      "Naturkunskap",
      "Samhällskunskap",
      "Histori",
      "Geografi",
      "Idrott",
      "Kemi",
      "Fysik",
      "Biologi",
      "Teknik",
      "Musik",
      "Slöjd",
      "Konst",
      "Övrig",
    ]);

    const availableTypes = ref([
      { value: "multipleChoice", label: "Multiple Choice" },
      { value: "trueFalse", label: "Sant/Falskt" },
      { value: "essay", label: "Essayfråga" },
      { value: "shortAnswer", label: "Kort svar" },
      { value: "matching", label: "Matchning" },
      { value: "ordering", label: "Ordning" },
    ]);

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

    const difficultyLabel = (level) => {
      const labels = { easy: "Enkel", medium: "Medel", hard: "Svår" };
      return labels[level] || level;
    };

    const difficultyColor = (level) => {
      const colors = { easy: "green", medium: "amber", hard: "red" };
      return colors[level] || "gray";
    };

    const filteredQuestions = computed(() => {
      return questions.value.filter((question) => {
        const matchesSubject =
          !filterSubject || question.subject === filterSubject;
        const matchesType = !filterType || question.questionType === filterType;
        const matchesActive = filterActive
          ? question.active
          : !question.active;
        return matchesSubject && matchesType && matchesActive;
      });
    });

    // Methods
    const loadQuestions = async () => {
      try {
        const { data } = await client.get("/question-bank");
        questions.value = data.questions || [];
      } catch (error) {
        toast.error("Kunde inte ladda frågor");
        console.error("Error loading questions:", error);
      }
    };

    const applyFilters = () => {
      // Filter is computed, just triggers re-evaluation
    };

    const editQuestion = (question) => {
      // Pre-fill the form for editing
      newQuestion.value = {
        ...question,
        options: question.options ? question.options.join(", ") : "",
      };
      showCreateModal.value = true;
    };

    const deleteQuestion = async (question) {
      try {
        await client.delete(`/question-bank/${question._id}`);
        loadQuestions();
        toast.success("Fråga tagits bort");
      } catch (error) {
        toast.error("Kunde inte ta bort fråga");
      }
    };

    const createQuestion = async () => {
      try {
        const optionsArray = newQuestion.options
          ? newQuestion.options.split(",").map((o) => o.trim())
          : [];

        await client.post("/question-bank", {
          questionText: newQuestion.questionText,
          course: "", // Course will be set by admin
          subject: newQuestion.subject,
          questionType: newQuestion.questionType,
          options: optionsArray.length > 0 ? optionsArray : undefined,
          correctAnswer: newQuestion.correctAnswer || undefined,
          answerGuidelines: "",
          moduleNumber: newQuestion.moduleNumber,
          difficulty: newQuestion.difficulty,
        });

        loadQuestions();
        showCreateModal.value = false;
        newQuestion.value = {
          questionText: "",
          subject: "Övrig",
          questionType: "multipleChoice",
          options: "",
          correctAnswer: "",
          moduleNumber: 3,
          difficulty: "medium",
        };
        toast.success("Fråga skapad");
      } catch (error) {
        toast.error("Kunde inte skapa fråga");
        console.error("Error creating question:", error);
      }
    };

    // Initial load
    loadQuestions();

    return {
      questions,
      filterSubject,
      filterType,
      filterActive,
      showCreateModal,
      newQuestion,
      availableSubjects,
      availableTypes,
      filteredQuestions,
      typeColor,
      difficultyLabel,
      difficultyColor,
      loadQuestions,
      applyFilters,
      editQuestion,
      deleteQuestion,
      createQuestion,
    };
  },
};
</script>

<style scoped>
.question-bank-page .v-chip {
  margin: 2px;
}

.type-badge {
  font-size: 0.8rem;
}

.difficulty-badge {
  font-size: 0.75rem;
}
</style>
