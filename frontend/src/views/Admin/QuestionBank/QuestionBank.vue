<template>
  <div class="question-bank-page">
    <div class="card">
      <div class="card-header">
        <div class="d-flex align-center justify-space-between">
          <h3>Frågebank</h3>
          <v-btn color="primary" @click="openCreateModal">
            <v-icon left>mdi-plus</v-icon>
            Ny fråga
          </v-btn>
        </div>
        <v-row>
          <v-col cols="12" sm="3">
            <v-select
              v-model="filterCourse"
              :items="[{ _id: null, courseName: 'Alla kurser' }, ...availableCourses]"
              item-title="courseName"
              item-value="_id"
              label="Kurs"
              dense
              outlined
              clearable
            />
          </v-col>
          <v-col cols="12" sm="3">
            <v-select
              v-model="filterSubject"
              :items="availableSubjects"
              label="Ämne"
              dense
              outlined
              clearable
            />
          </v-col>
          <v-col cols="12" sm="3">
            <v-select
              v-model="filterType"
              :items="availableTypes"
              item-title="label"
              item-value="value"
              label="Frågetyp"
              dense
              outlined
              clearable
            />
          </v-col>
          <v-col cols="12" sm="3">
            <v-switch
              v-model="filterActive"
              label="Endast aktiva"
              dense
              outlined
            />
          </v-col>
        </v-row>
      </div>

      <div class="pa-4">
        <h4 class="mb-2">PDF-uppladdning</h4>
        <v-row>
          <v-col cols="12" sm="4">
            <v-select
              v-model="pdfCourse"
              :items="availableCourses"
              item-title="courseName"
              item-value="_id"
              label="Kurs *"
              dense
              outlined
              @update:modelValue="loadPdfMeta"
            />
          </v-col>
          <v-col cols="12" sm="4">
            <v-file-input
              v-model="questionPdfFile"
              label="Fråge-PDF"
              accept="application/pdf"
              prepend-icon="mdi-file-document"
              dense
              outlined
              show-size
            />
          </v-col>
          <v-col cols="12" sm="4">
            <v-file-input
              v-model="answerPdfFile"
              label="Svars-PDF"
              accept="application/pdf"
              prepend-icon="mdi-file-check"
              dense
              outlined
              show-size
            />
          </v-col>
        </v-row>
        <div class="d-flex align-center ga-2 mb-2">
          <v-btn
            color="primary"
            :loading="pdfUploading"
            :disabled="(!questionPdfFile && !answerPdfFile) || !pdfCourse"
            @click="uploadPdfs"
          >
            <v-icon left>mdi-upload</v-icon>
            Ladda upp
          </v-btn>
          <v-btn
            v-if="pdfMeta.questionPdfName"
            text
            @click="downloadPdf('question')"
          >
            <v-icon left>mdi-download</v-icon>
            Hämta fråge-PDF ({{ pdfMeta.questionPdfName }})
          </v-btn>
          <v-btn
            v-if="pdfMeta.questionPdfName"
            icon
            small
            color="red"
            @click="deletePdf('question')"
          >
            <v-icon small>mdi-delete</v-icon>
          </v-btn>
          <v-btn
            v-if="pdfMeta.answerPdfName"
            text
            @click="downloadPdf('answer')"
          >
            <v-icon left>mdi-download</v-icon>
            Hämta svars-PDF ({{ pdfMeta.answerPdfName }})
          </v-btn>
          <v-btn
            v-if="pdfMeta.answerPdfName"
            icon
            small
            color="red"
            @click="deletePdf('answer')"
          >
            <v-icon small>mdi-delete</v-icon>
          </v-btn>
        </div>
      </div>

      <div class="card-body p-0">
        <v-table dense>
          <thead>
            <tr>
              <th class="text-left">Fråga</th>
              <th class="text-left">Kurs</th>
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
                <v-icon left v-if="question.questionType === 'multipleChoice'">mdi-checkbox-multiple-blank</v-icon>
                <v-icon left v-if="question.questionType === 'trueFalse'">mdi-checkbox-blank-circle-outline</v-icon>
                <v-icon left v-if="question.questionType === 'essay'">mdi-file-document-edit</v-icon>
                <v-icon left v-if="question.questionType === 'shortAnswer'">mdi-format-align-left</v-icon>
                <strong>{{ question.questionText.substring(0, 50) }}{{
                  question.questionText.length > 50 ? "..." : ""
                }}</strong>
              </td>
              <td class="px-4 py-2">{{ getCourseName(question.course) }}</td>
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
              <td colspan="7" class="text-center text-grey">
                Inga frågor hittades
              </td>
            </tr>
          </tbody>
        </v-table>
      </div>
    </div>

    <div class="card mt-4" v-if="allCoursePdfs.length > 0">
      <div class="card-header">
        <h4>PDF-filer per kurs</h4>
      </div>
      <div class="card-body p-0">
        <v-table dense>
          <thead>
            <tr>
              <th class="text-left">Kurs</th>
              <th class="text-left">Fråge-PDF</th>
              <th class="text-left">Svars-PDF</th>
              <th class="text-right">Åtgärder</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in allCoursePdfs" :key="item.course._id">
              <td class="px-4 py-2">
                {{ item.course.courseName }}
                <span class="text-grey">({{ item.course.courseCode }})</span>
              </td>
              <td class="px-4 py-2">
                <v-icon v-if="item.pdfs.questionPdfName" small color="green" class="mr-1">mdi-file-document</v-icon>
                {{ item.pdfs.questionPdfName || "—" }}
              </td>
              <td class="px-4 py-2">
                <v-icon v-if="item.pdfs.answerPdfName" small color="green" class="mr-1">mdi-file-check</v-icon>
                {{ item.pdfs.answerPdfName || "—" }}
              </td>
              <td class="px-4 py-2 text-right">
                <v-btn
                  v-if="item.pdfs.questionPdfName"
                  icon
                  small
                  text
                  @click="downloadCoursePdf(item.course._id, 'question')"
                  title="Hämta fråge-PDF"
                >
                  <v-icon small>mdi-download</v-icon>
                </v-btn>
                <v-btn
                  v-if="item.pdfs.answerPdfName"
                  icon
                  small
                  text
                  @click="downloadCoursePdf(item.course._id, 'answer')"
                  title="Hämta svars-PDF"
                >
                  <v-icon small>mdi-download</v-icon>
                </v-btn>
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
              </v-row>

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
    const filterCourse = ref(null);
    const filterActive = ref(true);
    const showCreateModal = ref(false);
    const questionPdfFile = ref(null);
    const answerPdfFile = ref(null);
    const pdfUploading = ref(false);
    const pdfCourse = ref(null);
    const availableCourses = ref([]);
    const allCoursePdfs = ref([]);
    const pdfMeta = ref({
      questionPdfName: null,
      answerPdfName: null,
      questionPdfFileId: null,
      answerPdfFileId: null,
    });
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

    const typeLabel = (type) => {
      const found = availableTypes.value.find((t) => t.value === type);
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

    const filteredQuestions = computed(() => {
      return questions.value.filter((question) => {
        const matchesCourse =
          !filterCourse.value || question.course === filterCourse.value;
        const matchesSubject =
          !filterSubject.value || question.subject === filterSubject.value;
        const matchesType = !filterType.value || question.questionType === filterType.value;
        const matchesActive = filterActive.value
          ? question.active
          : !question.active;
        return matchesCourse && matchesSubject && matchesType && matchesActive;
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

    const loadCourses = async () => {
      try {
        const { data } = await client.get("/course-bank/courses");
        availableCourses.value = data.courses || [];
      } catch (error) {
        console.error("Error loading courses:", error);
      }
    };

    const loadPdfMeta = async () => {
      if (!pdfCourse.value) {
        pdfMeta.value = {
          questionPdfName: null,
          answerPdfName: null,
          questionPdfFileId: null,
          answerPdfFileId: null,
        };
        return;
      }
      try {
        const { data } = await client.get("/question-bank/pdfs", {
          params: { course: pdfCourse.value },
        });
        pdfMeta.value = data;
      } catch (error) {
        console.error("Error loading PDF metadata:", error);
      }
    };

    const uploadPdfs = async () => {
      if (!questionPdfFile.value && !answerPdfFile.value) return;
      if (!pdfCourse.value) return;
      pdfUploading.value = true;
      try {
        const formData = new FormData();
        formData.append("course", pdfCourse.value);
        if (questionPdfFile.value) {
          formData.append("questionPdf", questionPdfFile.value[0] || questionPdfFile.value);
        }
        if (answerPdfFile.value) {
          formData.append("answerPdf", answerPdfFile.value[0] || answerPdfFile.value);
        }
        await client.post("/question-bank/pdfs", formData);
        questionPdfFile.value = null;
        answerPdfFile.value = null;
        await loadPdfMeta();
        toast.success("PDF-uppladdning lyckades");
      } catch (error) {
        const msg = error?.response?.data?.message || error?.message || "Okänt fel";
        toast.error("Kunde inte ladda upp PDF: " + msg);
        console.error("Error uploading PDFs:", error);
      } finally {
        pdfUploading.value = false;
      }
    };

    const downloadPdf = (type) => {
      window.open(
        `/api/question-bank/pdfs/${type}/download?course=${pdfCourse.value}`,
        "_blank"
      );
    };

    const deletePdf = async (type) => {
      try {
        await client.delete(`/question-bank/pdfs/${type}`, {
          params: { course: pdfCourse.value },
        });
        await loadPdfMeta();
        await loadAllCoursePdfs();
        toast.success("PDF borttagen");
      } catch (error) {
        toast.error("Kunde inte ta bort PDF");
      }
    };

    const getCourseName = (courseId) => {
      const course = availableCourses.value.find((c) => c._id === courseId);
      return course ? course.courseName : courseId;
    };

    const loadAllCoursePdfs = async () => {
      try {
        const results = await Promise.all(
          availableCourses.value.map(async (course) => {
            const { data } = await client.get("/question-bank/pdfs", {
              params: { course: course._id },
            });
            return { course, pdfs: data };
          })
        );
        allCoursePdfs.value = results.filter(
          (r) => r.pdfs.questionPdfName || r.pdfs.answerPdfName
        );
      } catch (error) {
        console.error("Error loading all course PDFs:", error);
      }
    };

    const downloadCoursePdf = (courseId, type) => {
      window.open(
        `/api/question-bank/pdfs/${type}/download?course=${courseId}`,
        "_blank"
      );
    };

    const openCreateModal = () => {
      newQuestion.value = {
        questionText: "",
        subject: "Övrig",
        questionType: "multipleChoice",
        options: "",
        correctAnswer: "",
        moduleNumber: 3,
        difficulty: "medium",
      };
      showCreateModal.value = true;
    };

    const editQuestion = (question) => {
      // Pre-fill the form for editing
      newQuestion.value = {
        ...question,
        options: question.options ? question.options.join(", ") : "",
      };
      showCreateModal.value = true;
    };

    const deleteQuestion = async (question) => {
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
    loadCourses().then(() => loadAllCoursePdfs()).catch(() => {});

    return {
      questions,
      filterSubject,
      filterType,
      filterCourse,
      filterActive,
      showCreateModal,
      newQuestion,
      questionPdfFile,
      answerPdfFile,
      pdfUploading,
      pdfCourse,
      availableCourses,
      allCoursePdfs,
      pdfMeta,
      availableSubjects,
      availableTypes,
      filteredQuestions,
      typeColor,
      typeLabel,
      difficultyLabel,
      difficultyColor,
      getCourseName,
      loadQuestions,
      applyFilters,
      openCreateModal,
      editQuestion,
      deleteQuestion,
      createQuestion,
      loadPdfMeta,
      uploadPdfs,
      downloadPdf,
      downloadCoursePdf,
      deletePdf,
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
