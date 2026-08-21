<template>
  <div class="scrollable-view">
    <section class="container py-4">
      <v-card class="pa-5">
        <v-card-title class="d-flex align-center text-h5">Chatbot – Vanliga frågor</v-card-title>
        <v-card-subtitle class="pb-2">
          Hantera verifierade frågor och svar som studenternas studieassistent
          svarar med. Inaktiva och borttagna frågor visas aldrig för studenterna.
        </v-card-subtitle>

        <v-tabs v-model="tab" class="mb-4">
          <v-tab value="faqs">Vanliga frågor</v-tab>
          <v-tab value="categories">Kategorier</v-tab>
        </v-tabs>

        <v-alert v-if="error" type="error" class="mb-4" dense>{{ error }}</v-alert>

        <!-- ─── FAQs tab ─────────────────────────────────────────────────── -->
        <v-window v-model="tab">
          <v-window-item value="faqs">
            <div class="d-flex flex-wrap ga-3 align-center mb-4">
              <v-text-field
                v-model="faqSearch"
                label="Sök fråga, svar eller nyckelord"
                variant="outlined"
                density="compact"
                clearable
                hide-details
                class="flex-grow-1 min-w-220"
                @keyup.enter="applyFaqFilters"
                @click:clear="clearFaqSearch"
              />
              <v-select
                v-model="faqCategoryFilter"
                :items="categoryFilterItems"
                item-title="name"
                item-value="_id"
                label="Kategori"
                variant="outlined"
                density="compact"
                hide-details
                clearable
                class="min-w-200"
              />
              <v-select
                v-model="faqStatusFilter"
                :items="statusFilterItems"
                label="Status"
                variant="outlined"
                density="compact"
                hide-details
                class="min-w-160"
              />
              <v-checkbox
                v-model="onlyMine"
                label="Endast mina"
                density="compact"
                hide-details
              />
              <v-btn color="primary" prepend-icon="mdi-plus" @click="openCreateFaq">
                Ny fråga
              </v-btn>
            </div>

            <div v-if="faqLoading" class="text-center py-8">
              <v-progress-circular indeterminate color="primary" size="40" />
            </div>

            <template v-else-if="faqs.length > 0">
              <v-table hover>
                <thead>
                  <tr>
                    <th class="text-left">Fråga</th>
                    <th class="text-left">Kategori</th>
                    <th class="text-left">Status</th>
                    <th class="text-left">Skapad av</th>
                    <th class="text-left">Uppdaterad</th>
                    <th class="text-right">Åtgärder</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="faq in faqs" :key="faq._id">
                    <td class="faq-question-cell">{{ faq.question }}</td>
                    <td>{{ faq.categoryId?.name || '–' }}</td>
                    <td>
                      <v-chip size="small" :color="faq.status === 'active' ? 'success' : 'default'" variant="tonal">
                        {{ faq.status === 'active' ? 'Aktiv' : 'Inaktiv' }}
                      </v-chip>
                    </td>
                    <td>{{ faq.createdBy?.name || faq.createdBy?.email || '–' }}</td>
                    <td>{{ formatDate(faq.updatedAt) }}</td>
                    <td class="text-right text-no-wrap">
                      <v-btn size="small" variant="text" color="primary" @click="openViewFaq(faq)">Visa</v-btn>
                      <v-btn
                        v-if="canModify(faq)"
                        size="small"
                        variant="text"
                        color="primary"
                        @click="openEditFaq(faq)"
                      >
Redigera
</v-btn>
                      <v-btn
                        v-if="canModify(faq)"
                        size="small"
                        variant="text"
                        :color="faq.status === 'active' ? 'warning' : 'success'"
                        @click="toggleFaqStatus(faq)"
                      >
{{ faq.status === 'active' ? 'Inaktivera' : 'Aktivera' }}
</v-btn>
                      <v-btn
                        v-if="canModify(faq)"
                        size="small"
                        variant="text"
                        color="error"
                        @click="confirmDeleteFaq(faq)"
                      >
Ta bort
</v-btn>
                    </td>
                  </tr>
                </tbody>
              </v-table>
              <v-pagination
                v-model="faqPage"
                :length="faqTotalPages"
                :total-visible="5"
                class="mt-4"
                circle
              />
            </template>

            <div v-else class="text-center text-muted py-8">
              Inga vanliga frågor hittades. Skapa den första frågan för att komma igång.
            </div>
          </v-window-item>

          <!-- ─── Categories tab (create: all staff, edit/delete: admin) ─── -->
          <v-window-item value="categories">
            <div class="d-flex justify-end mb-4">
              <v-btn color="primary" prepend-icon="mdi-plus" @click="openCreateCategory">
                Ny kategori
              </v-btn>
            </div>

            <div v-if="categoryLoading" class="text-center py-8">
              <v-progress-circular indeterminate color="primary" size="40" />
            </div>

            <v-table v-else-if="categories.length > 0" hover>
              <thead>
                <tr>
                  <th class="text-left">Namn</th>
                  <th class="text-left">Beskrivning</th>
                  <th class="text-left">Ordning</th>
                  <th class="text-left">Status</th>
                  <th v-if="isAdmin" class="text-right">Åtgärder</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="category in categories" :key="category._id">
                  <td>{{ category.name }}</td>
                  <td class="category-description-cell">{{ category.description || '–' }}</td>
                  <td>{{ category.displayOrder }}</td>
                  <td>
                    <v-chip size="small" :color="category.status === 'active' ? 'success' : 'default'" variant="tonal">
                      {{ category.status === 'active' ? 'Aktiv' : 'Inaktiv' }}
                    </v-chip>
                  </td>
                  <td v-if="isAdmin" class="text-right text-no-wrap">
                    <v-btn size="small" variant="text" color="primary" @click="openEditCategory(category)">Redigera</v-btn>
                    <v-btn
                      size="small"
                      variant="text"
                      :color="category.status === 'active' ? 'warning' : 'success'"
                      @click="toggleCategoryStatus(category)"
                    >
{{ category.status === 'active' ? 'Inaktivera' : 'Aktivera' }}
</v-btn>
                    <v-btn size="small" variant="text" color="error" @click="confirmDeleteCategory(category)">Ta bort</v-btn>
                  </td>
                </tr>
              </tbody>
            </v-table>

            <div v-else class="text-center text-muted py-8">
              Inga kategorier ännu — skapa en för att kunna lägga till frågor.
            </div>
          </v-window-item>
        </v-window>
      </v-card>
    </section>

    <!-- ─── FAQ form dialog ──────────────────────────────────────────────── -->
    <v-dialog v-model="showFaqDialog" max-width="680px">
      <v-card>
        <v-card-title>{{ editingFaqId ? 'Redigera fråga' : 'Ny fråga' }}</v-card-title>
        <v-card-text>
          <v-form @submit.prevent="saveFaq">
            <v-select
              v-model="faqForm.categoryId"
              :items="formCategories"
              item-title="name"
              item-value="_id"
              label="Kategori *"
              variant="outlined"
              :error-messages="fieldErrors.categoryId"
            />
            <v-text-field
              v-model="faqForm.question"
              label="Fråga *"
              variant="outlined"
              counter="500"
              maxlength="500"
              :error-messages="fieldErrors.question"
            />
            <v-textarea
              v-model="faqForm.answer"
              label="Verifierat svar *"
              variant="outlined"
              rows="5"
              counter="5000"
              maxlength="5000"
              :error-messages="fieldErrors.answer"
            />
            <v-text-field
              v-model="faqForm.keywordsText"
              label="Nyckelord (kommaseparerade)"
              variant="outlined"
              hint="Används för att matcha fria frågor i chatten, t.ex. avgift, betala, faktura"
              persistent-hint
            />
            <v-textarea
              v-model="faqForm.alternatesText"
              label="Alternativa formuleringar (en per rad)"
              variant="outlined"
              rows="2"
            />
            <div class="d-flex ga-4">
              <v-text-field
                v-model.number="faqForm.displayOrder"
                type="number"
                min="0"
                label="Prioritet / visningsordning"
                variant="outlined"
                density="compact"
              />
              <v-switch
                v-model="faqForm.isActive"
                color="primary"
                hide-details
                :label="faqForm.isActive ? 'Aktiv' : 'Inaktiv'"
              />
            </div>
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="showFaqDialog = false">Avbryt</v-btn>
          <v-btn color="primary" :loading="saving" @click="saveFaq">Spara</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- ─── FAQ view dialog ──────────────────────────────────────────────── -->
    <v-dialog v-model="showViewDialog" max-width="640px">
      <v-card v-if="viewedFaq">
        <v-card-title>{{ viewedFaq.question }}</v-card-title>
        <v-card-subtitle>{{ viewedFaq.categoryId?.name }} · {{ viewedFaq.status === 'active' ? 'Aktiv' : 'Inaktiv' }}</v-card-subtitle>
        <v-card-text>
          <p class="answer-text">{{ viewedFaq.answer }}</p>
          <div v-if="viewedFaq.keywords?.length" class="mt-2">
            <v-chip v-for="keyword in viewedFaq.keywords" :key="keyword" size="small" class="me-1 mb-1" variant="outlined">
              {{ keyword }}
            </v-chip>
          </div>
        </v-card-text>
        <v-card-actions><v-spacer /><v-btn text @click="showViewDialog = false">Stäng</v-btn></v-card-actions>
      </v-card>
    </v-dialog>

    <!-- ─── Category form dialog ─────────────────────────────────────────── -->
    <v-dialog v-model="showCategoryDialog" max-width="520px">
      <v-card>
        <v-card-title>{{ editingCategoryId ? 'Redigera kategori' : 'Ny kategori' }}</v-card-title>
        <v-card-text>
          <v-form @submit.prevent="saveCategory">
            <v-text-field
              v-model="categoryForm.name"
              label="Namn *"
              variant="outlined"
              counter="80"
              maxlength="80"
              :error-messages="fieldErrors.name"
            />
            <v-text-field
              v-model="categoryForm.description"
              label="Beskrivning"
              variant="outlined"
              counter="500"
              maxlength="500"
            />
            <div v-if="isAdmin" class="d-flex ga-4">
              <v-text-field
                v-model.number="categoryForm.displayOrder"
                type="number"
                min="0"
                label="Visningsordning"
                variant="outlined"
                density="compact"
              />
              <v-switch
                v-model="categoryForm.isActive"
                color="primary"
                hide-details
                :label="categoryForm.isActive ? 'Aktiv' : 'Inaktiv'"
              />
            </div>
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="showCategoryDialog = false">Avbryt</v-btn>
          <v-btn color="primary" :loading="saving" @click="saveCategory">Spara</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- ─── Confirm delete dialog ────────────────────────────────────────── -->
    <v-dialog v-model="showConfirmDialog" max-width="460px">
      <v-card>
        <v-card-title>Bekräfta</v-card-title>
        <v-card-text>{{ confirmMessage }}</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="showConfirmDialog = false">Avbryt</v-btn>
          <v-btn color="error" :loading="saving" @click="runConfirmedAction">Ta bort</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useStore } from 'vuex'
import client from '@/api/client.js'
import { useToast } from '@/composables/useToast.js'

const store = useStore()
const toast = useToast()

const isAdmin = computed(() => store.getters.isAdmin)
const currentUserId = computed(() => store.getters.userId)

const LIMITS = {
  question: 500,
  answer: 5000,
  keywords: 30,
  alternateQuestions: 20,
}

const tab = ref('faqs')
const error = ref('')
const saving = ref(false)
const fieldErrors = ref({})

// FAQ list state
const faqs = ref([])
const faqLoading = ref(true)
const faqPage = ref(1)
const faqTotalPages = ref(1)
const faqTotal = ref(0)
const faqSearch = ref('')
const appliedSearch = ref('')
const faqCategoryFilter = ref(null)
const faqStatusFilter = ref('all')
const onlyMine = ref(false)

// Category state
const categories = ref([])
const categoryLoading = ref(true)

// Dialog state
const showFaqDialog = ref(false)
const editingFaqId = ref(null)
const faqForm = ref(emptyFaqForm())
const showViewDialog = ref(false)
const viewedFaq = ref(null)

const showCategoryDialog = ref(false)
const editingCategoryId = ref(null)
const categoryForm = ref(emptyCategoryForm())

const showConfirmDialog = ref(false)
const confirmMessage = ref('')
let confirmedAction = null

function emptyFaqForm() {
  return {
    categoryId: null,
    question: '',
    answer: '',
    keywordsText: '',
    alternatesText: '',
    displayOrder: 0,
    isActive: true,
  }
}

function emptyCategoryForm() {
  return { name: '', description: '', displayOrder: 0, isActive: true }
}

const statusFilterItems = [
  { title: 'Alla', value: 'all' },
  { title: 'Aktiva', value: 'active' },
  { title: 'Inaktiva', value: 'inactive' },
]

const categoryFilterItems = computed(() => categories.value)

const formCategories = computed(() =>
  categories.value.filter((c) => c.status === 'active' || c._id === faqForm.value.categoryId)
)

function canModify(faq) {
  if (isAdmin.value) return true
  return Boolean(currentUserId.value && String(faq.createdBy?._id || faq.createdBy) === String(currentUserId.value))
}

function formatDate(value) {
  if (!value) return '–'
  const d = new Date(value)
  return d.toLocaleDateString('sv-SE') + ' ' + d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
}

function splitList(text) {
  return String(text || '')
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

// ─── Data loading ───────────────────────────────────────────────────────────

async function loadCategories() {
  categoryLoading.value = true
  try {
    const { data } = await client.get('/chatbot/faq/manage/categories')
    categories.value = data.categories || []
    error.value = ''
  } catch (err) {
    error.value = err.message || 'Kunde inte hämta kategorier.'
  } finally {
    categoryLoading.value = false
  }
}

async function loadFaqs() {
  faqLoading.value = true
  try {
    const params = {
      page: faqPage.value,
      limit: 10,
    }
    if (appliedSearch.value) params.search = appliedSearch.value
    if (faqCategoryFilter.value) params.categoryId = faqCategoryFilter.value
    if (faqStatusFilter.value !== 'all') params.status = faqStatusFilter.value
    if (onlyMine.value && currentUserId.value) params.createdBy = currentUserId.value

    const { data } = await client.get('/chatbot/faq/manage/questions', { params })
    faqs.value = data.faqs || []
    faqTotal.value = data.total || 0
    faqTotalPages.value = data.totalPages || 1
    error.value = ''
  } catch (err) {
    error.value = err.message || 'Kunde inte hämta vanliga frågor.'
    faqs.value = []
  } finally {
    faqLoading.value = false
  }
}

function applyFaqFilters() {
  appliedSearch.value = (faqSearch.value || '').trim()
  faqPage.value = 1
  loadFaqs()
}

function clearFaqSearch() {
  faqSearch.value = ''
  appliedSearch.value = ''
  faqPage.value = 1
  loadFaqs()
}

watch([faqPage, faqCategoryFilter, faqStatusFilter, onlyMine], () => loadFaqs())

// ─── FAQ CRUD ───────────────────────────────────────────────────────────────

function validateFaqForm() {
  const errors = {}
  if (!faqForm.value.categoryId) errors.categoryId = 'Välj en kategori.'
  const question = String(faqForm.value.question || '').trim()
  if (!question) errors.question = 'Frågan får inte vara tom.'
  else if (question.length < 3) errors.question = 'Frågan måste vara minst 3 tecken.'
  if (!String(faqForm.value.answer || '').trim()) errors.answer = 'Svaret får inte vara tomt.'
  if (splitList(faqForm.value.keywordsText).length > LIMITS.keywords) {
    errors.keywords = `Max ${LIMITS.keywords} nyckelord.`
  }
  fieldErrors.value = errors
  return Object.keys(errors).length === 0
}

function buildFaqPayload() {
  return {
    categoryId: faqForm.value.categoryId,
    question: String(faqForm.value.question || '').trim(),
    answer: String(faqForm.value.answer || '').trim(),
    keywords: splitList(faqForm.value.keywordsText),
    alternateQuestions: splitList(faqForm.value.alternatesText),
    displayOrder: Math.max(parseInt(faqForm.value.displayOrder, 10) || 0, 0),
    status: faqForm.value.isActive ? 'active' : 'inactive',
  }
}

function openCreateFaq() {
  editingFaqId.value = null
  faqForm.value = emptyFaqForm()
  fieldErrors.value = {}
  showFaqDialog.value = true
}

function openEditFaq(faq) {
  editingFaqId.value = faq._id
  faqForm.value = {
    categoryId: faq.categoryId?._id || faq.categoryId,
    question: faq.question,
    answer: faq.answer,
    keywordsText: (faq.keywords || []).join(', '),
    alternatesText: (faq.alternateQuestions || []).join('\n'),
    displayOrder: faq.displayOrder ?? 0,
    isActive: faq.status === 'active',
  }
  fieldErrors.value = {}
  showFaqDialog.value = true
}

function openViewFaq(faq) {
  viewedFaq.value = faq
  showViewDialog.value = true
}

async function saveFaq() {
  if (!validateFaqForm()) return
  saving.value = true
  try {
    if (editingFaqId.value) {
      await client.put(`/chatbot/faq/manage/questions/${editingFaqId.value}`, buildFaqPayload())
      toast.success('Frågan uppdaterades!')
    } else {
      await client.post('/chatbot/faq/manage/questions', buildFaqPayload())
      toast.success('Frågan skapades!')
    }
    showFaqDialog.value = false
    await loadFaqs()
  } catch (err) {
    toast.error(err.message || 'Kunde inte spara frågan.')
  } finally {
    saving.value = false
  }
}

async function toggleFaqStatus(faq) {
  const nextStatus = faq.status === 'active' ? 'inactive' : 'active'
  try {
    await client.put(`/chatbot/faq/manage/questions/${faq._id}`, { status: nextStatus })
    toast.success(nextStatus === 'active' ? 'Frågan aktiverades.' : 'Frågan inaktiverades.')
    await loadFaqs()
  } catch (err) {
    toast.error(err.message || 'Kunde inte ändra status.')
  }
}

function confirmDeleteFaq(faq) {
  confirmMessage.value = `Är du säker på att du vill ta bort frågan "${faq.question}"? Studenterna kommer inte längre se den.`
  confirmedAction = async () => {
    await client.delete(`/chatbot/faq/manage/questions/${faq._id}`)
    toast.success('Frågan togs bort.')
    await loadFaqs()
  }
  showConfirmDialog.value = true
}

async function runConfirmedAction() {
  if (!confirmedAction) return
  saving.value = true
  try {
    await confirmedAction()
    showConfirmDialog.value = false
  } catch (err) {
    toast.error(err.message || 'Åtgärden misslyckades.')
  } finally {
    saving.value = false
    confirmedAction = null
  }
}

// ─── Category CRUD ──────────────────────────────────────────────────────────

function validateCategoryForm() {
  const errors = {}
  const name = String(categoryForm.value.name || '').trim()
  if (!name) errors.name = 'Kategorinamn är obligatoriskt.'
  else if (name.length < 2) errors.name = 'Namnet måste vara minst 2 tecken.'
  fieldErrors.value = errors
  return Object.keys(errors).length === 0
}

function openCreateCategory() {
  editingCategoryId.value = null
  categoryForm.value = emptyCategoryForm()
  fieldErrors.value = {}
  showCategoryDialog.value = true
}

function openEditCategory(category) {
  editingCategoryId.value = category._id
  categoryForm.value = {
    name: category.name,
    description: category.description || '',
    displayOrder: category.displayOrder ?? 0,
    isActive: category.status === 'active',
  }
  fieldErrors.value = {}
  showCategoryDialog.value = true
}

async function saveCategory() {
  if (!validateCategoryForm()) return
  saving.value = true
  try {
    const payload = {
      name: String(categoryForm.value.name).trim(),
      description: String(categoryForm.value.description || '').trim(),
      displayOrder: Math.max(parseInt(categoryForm.value.displayOrder, 10) || 0, 0),
      status: categoryForm.value.isActive ? 'active' : 'inactive',
    }
    if (editingCategoryId.value) {
      await client.put(`/chatbot/faq/manage/categories/${editingCategoryId.value}`, payload)
      toast.success('Kategorin uppdaterades!')
    } else {
      await client.post('/chatbot/faq/manage/categories', payload)
      toast.success('Kategorin skapades!')
    }
    showCategoryDialog.value = false
    await Promise.all([loadCategories(), loadFaqs()])
  } catch (err) {
    toast.error(err.message || 'Kunde inte spara kategorin.')
  } finally {
    saving.value = false
  }
}

async function toggleCategoryStatus(category) {
  const nextStatus = category.status === 'active' ? 'inactive' : 'active'
  try {
    await client.put(`/chatbot/faq/manage/categories/${category._id}`, { status: nextStatus })
    toast.success(nextStatus === 'active' ? 'Kategorin aktiverades.' : 'Kategorin inaktiverades.')
    await Promise.all([loadCategories(), loadFaqs()])
  } catch (err) {
    toast.error(err.message || 'Kunde inte ändra status.')
  }
}

function confirmDeleteCategory(category) {
  confirmMessage.value = `Är du säker på att du vill ta bort kategorin "${category.name}"? Kategorier med frågor kan inte tas bort.`
  confirmedAction = async () => {
    await client.delete(`/chatbot/faq/manage/categories/${category._id}`)
    toast.success('Kategorin togs bort.')
    await Promise.all([loadCategories(), loadFaqs()])
  }
  showConfirmDialog.value = true
}

onMounted(async () => {
  await Promise.all([loadCategories(), loadFaqs()])
})
</script>

<style scoped>
.text-muted {
  color: #888;
  font-style: italic;
}
.min-w-220 {
  min-width: 220px;
}
.min-w-200 {
  min-width: 200px;
}
.min-w-160 {
  min-width: 160px;
}
.faq-question-cell {
  max-width: 320px;
}
.category-description-cell {
  max-width: 280px;
}
.answer-text {
  white-space: pre-wrap;
  line-height: 1.6;
}
</style>
