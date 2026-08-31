<template>
  <main class="chatbot-page">
    <section class="chatbot-shell" aria-labelledby="chatbot-title">
      <header class="chatbot-header">
        <div>
          <p class="eyebrow">Mindful Learning · Studentstöd</p>
          <h1 id="chatbot-title">Fråga din studieassistent</h1>
          <p class="intro">Få hjälp att förstå kursinnehåll, planera nästa steg och hitta rätt i din studieplan.</p>
        </div>
        <div class="header-actions">
          <button type="button" class="faq-toggle" @click="toggleFaqPanel">Vanliga frågor</button>
          <span class="status-pill" :class="statusClass"><span class="status-dot"></span>{{ statusLabel }}</span>
        </div>
      </header>

      <div ref="messageList" class="message-list" aria-live="polite">
        <div v-if="messages.length === 0" class="empty-chat">
          <div class="empty-mark" aria-hidden="true">?</div>
          <h2>Vad vill du veta?</h2>
          <p>Ställ en konkret fråga så får du ett svar baserat på din studieplan och kursinformation.</p>
          <div v-if="faqCategories.length" class="suggestions faq-suggestions" aria-label="Vanliga frågor – välj kategori">
            <p class="suggestions-label">Vanliga frågor · välj en kategori</p>
            <button v-for="category in faqCategories" :key="category._id" type="button" class="faq-suggestion" @click="openCategoryFromHome(category)">
              <span class="faq-suggestion-badge" aria-hidden="true">✓</span>
              <span class="faq-suggestion-text">
                {{ category.name }}
                <small v-if="category.description">{{ category.description }}</small>
              </span>
              <span class="faq-suggestion-arrow" aria-hidden="true">→</span>
            </button>
          </div>
        </div>
        <article v-for="message in messages" :key="message.id" class="message" :class="message.role">
          <div class="message-label">{{ message.role === 'user' ? 'Du' : 'Studieassistenten' }}</div>
          <p class="message-text">{{ message.text }}</p>
          <div v-if="message.sources?.length" class="sources">
            <span>Källor</span><small v-for="source in message.sources" :key="source">{{ source }}</small>
          </div>
        </article>
        <div v-if="sending" class="message assistant"><div class="message-label">Studieassistenten</div><p class="typing">Skriver<span>.</span><span>.</span><span>.</span></p></div>
      </div>

      <!-- FAQ browser: dynamic categories → questions → verified answers -->
      <div v-if="showFaqPanel" class="faq-panel" aria-label="Vanliga frågor">
        <div class="faq-panel-header">
          <button v-if="selectedCategory" type="button" class="faq-back" @click="backToCategories">← Kategorier</button>
          <strong>{{ selectedCategory ? selectedCategory.name : 'Välj kategori' }}</strong>
          <button type="button" class="faq-close" aria-label="Stäng vanliga frågor" @click="toggleFaqPanel">✕</button>
        </div>

        <div v-if="faqCategoriesLoading" class="faq-status">Laddar kategorier...</div>
        <p v-else-if="faqCategoriesError" class="faq-status faq-error" role="alert">{{ faqCategoriesError }}</p>
        <p v-else-if="!selectedCategory && faqCategories.length === 0" class="faq-status">Inga kategorier finns ännu.</p>

        <div v-else-if="!selectedCategory" class="faq-categories">
          <button
            v-for="category in faqCategories"
            :key="category._id"
            type="button"
            class="faq-category"
            @click="selectCategory(category)"
          >
            <span>{{ category.name }}</span>
            <small v-if="category.description">{{ category.description }}</small>
          </button>
        </div>

        <template v-else>
          <div v-if="faqQuestionsLoading" class="faq-status">Laddar frågor...</div>
          <p v-else-if="faqQuestionsError" class="faq-status faq-error" role="alert">{{ faqQuestionsError }}</p>
          <p v-else-if="faqQuestions.length === 0" class="faq-status">Inga frågor i denna kategori ännu.</p>
          <ul v-else class="faq-questions">
            <li v-for="faq in faqQuestions" :key="faq._id">
              <button type="button" @click="askFaq(faq)">{{ faq.question }}</button>
            </li>
          </ul>
        </template>
      </div>

      <form class="composer" @submit.prevent="submit">
        <label class="sr-only" for="question">Din fråga</label>
        <textarea id="question" v-model="question" rows="2" maxlength="1000" placeholder="Skriv din fråga..." :disabled="sending" @keydown.enter.exact.prevent="submit"></textarea>
        <div class="composer-footer"><span>{{ question.length }}/1000</span><button type="submit" :disabled="sending || !question.trim()">Skicka fråga <span aria-hidden="true">→</span></button></div>
      </form>
      <p v-if="error" class="error-message" role="alert">{{ error }}</p>
      <p class="disclaimer">Svar är vägledande. Kontakta din lärare om du behöver ett formellt besked.</p>
    </section>
  </main>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import client from '@/api/client.js'

const question = ref('')
const sending = ref(false)
const error = ref('')
const serviceStatus = ref('available')
const messages = ref([])
const messageList = ref(null)

// FAQ knowledge base state
const showFaqPanel = ref(false)
const faqCategories = ref([])
const faqCategoriesLoading = ref(false)
const faqCategoriesError = ref('')
const faqCategoriesLoaded = ref(false)
const selectedCategory = ref(null)
const faqQuestions = ref([])
const faqQuestionsLoading = ref(false)
const faqQuestionsError = ref('')

const statusLabel = computed(() => serviceStatus.value === 'available' ? 'Online' : 'Begränsad service')
const statusClass = computed(() => serviceStatus.value === 'available' ? 'is-online' : 'is-limited')

const scrollToLatest = async () => {
  await nextTick()
  if (messageList.value) messageList.value.scrollTop = messageList.value.scrollHeight
}

const ask = async (text) => {
  const value = text.trim()
  if (!value || sending.value) return
  question.value = ''
  error.value = ''
  messages.value.push({ id: `user-${Date.now()}`, role: 'user', text: value })
  sending.value = true
  await scrollToLatest()
  try {
    const normalized = value.toLowerCase()
    const match = faqQuestions.value.find((faq) => {
      const questionText = String(faq.question || '').toLowerCase()
      return questionText === normalized || questionText.includes(normalized) || normalized.includes(questionText)
    })
    if (match?.answer) {
      messages.value.push({
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        text: match.answer,
        sources: [`Vanliga frågor${selectedCategory.value ? ` · ${selectedCategory.value.name}` : ''}`],
      })
    } else {
      messages.value.push({
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        text: 'Jag hittar inget verifierat svar på den frågan i den valda FAQ-kategorin. Välj en fråga bland vanliga frågor eller kontakta din lärare.',
      })
    }
  } catch (requestError) {
    error.value = requestError.message || 'Kunde inte söka i vanliga frågor.'
  } finally {
    sending.value = false
    await scrollToLatest()
  }
}

const submit = () => ask(question.value)

// ─── FAQ knowledge base ─────────────────────────────────────────────────────

const loadFaqCategories = async () => {
  faqCategoriesLoading.value = true
  faqCategoriesError.value = ''
  try {
    const { data } = await client.get('/chatbot/faq/categories')
    faqCategories.value = data.categories || []
    faqCategoriesLoaded.value = true
  } catch {
    faqCategoriesError.value = 'Kunde inte hämta kategorier. Försök igen.'
  } finally {
    faqCategoriesLoading.value = false
  }
}

const selectCategory = async (category) => {
  selectedCategory.value = category
  faqQuestions.value = []
  faqQuestionsError.value = ''
  faqQuestionsLoading.value = true
  try {
    const { data } = await client.get(`/chatbot/faq/categories/${category._id}/questions`)
    faqQuestions.value = data.faqs || []
  } catch {
    faqQuestionsError.value = 'Kunde inte hämta frågor. Försök igen.'
  } finally {
    faqQuestionsLoading.value = false
  }
}

const backToCategories = () => {
  selectedCategory.value = null
  faqQuestions.value = []
  faqQuestionsError.value = ''
}

// Display the exact verified answer stored by admin/teacher. The answer is
// already included in the loaded list payload, so no extra request is needed.
const askFaq = (faq) => {
  if (!faq) return
  messages.value.push({ id: `user-${Date.now()}`, role: 'user', text: faq.question })
  const source = `Vanliga frågor${selectedCategory.value ? ` · ${selectedCategory.value.name}` : ''}`
  messages.value.push({
    id: `assistant-${Date.now()}`,
    role: 'assistant',
    text: faq.answer,
    sources: [source],
  })
  scrollToLatest()
}

const toggleFaqPanel = () => {
  showFaqPanel.value = !showFaqPanel.value
  if (showFaqPanel.value && !faqCategoriesLoaded.value && !faqCategoriesLoading.value) {
    loadFaqCategories()
  }
}

// Category-first navigation from the empty chat state: the student picks a
// category, which opens the FAQ panel directly on that category's questions.
const openCategoryFromHome = async (category) => {
  if (!category) return
  showFaqPanel.value = true
  if (!faqCategoriesLoaded.value && !faqCategoriesLoading.value) {
    await loadFaqCategories()
  }
  await selectCategory(category)
}

onMounted(async () => {
  try {
    const { data } = await client.get('/chatbot/status')
    serviceStatus.value = data.data?.status || 'available'
  } catch {
    serviceStatus.value = 'limited'
  }
  loadFaqCategories()
})
</script>

<style scoped>
.chatbot-page { min-height: calc(100vh - 7rem); padding: 2rem 1rem 4rem; background: var(--color-canvas); color: var(--color-ink); }
.chatbot-shell { width: min(100%, 900px); margin: 0 auto; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); overflow: hidden; }
.chatbot-header { display: flex; justify-content: space-between; gap: 1.5rem; padding: 2rem; border-bottom: 1px solid var(--color-border); background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%); color: var(--color-secondary-contrast); }
.header-actions { display: flex; align-items: center; gap: .75rem; }
.faq-toggle { padding: .45rem .8rem; border: 1px solid rgba(255, 255, 255, .55); border-radius: var(--radius-sm); background: rgba(255, 255, 255, .12); color: inherit; font-weight: 700; cursor: pointer; transition: background var(--motion-duration) var(--motion-ease), border-color var(--motion-duration) var(--motion-ease); }
.faq-toggle:hover { background: rgba(255, 255, 255, .22); border-color: rgba(255, 255, 255, .85); }
.eyebrow { margin: 0 0 .6rem; color: var(--color-secondary-light); font-size: .72rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
h1 { margin: 0; font-size: clamp(1.7rem, 4vw, 2.7rem); letter-spacing: -.04em; }
.intro { max-width: 560px; margin: .7rem 0 0; color: rgba(255, 255, 255, .82); line-height: 1.5; }
.status-pill { align-self: flex-start; display: inline-flex; align-items: center; gap: .45rem; padding: .45rem .7rem; border: 1px solid rgba(255, 255, 255, .45); border-radius: var(--radius-pill); background: rgba(255, 255, 255, .12); color: #fff; font-size: .8rem; white-space: nowrap; }
.status-dot { width: .45rem; height: .45rem; border-radius: 50%; background: var(--status-success-tint); }
.is-limited .status-dot { background: var(--status-warning-tint); }
.message-list { min-height: 420px; max-height: 55vh; overflow-y: auto; padding: 2rem; background: var(--color-bg-secondary); }
.empty-chat { max-width: 500px; margin: 4rem auto; text-align: center; }.empty-mark { display: grid; place-items: center; width: 3.4rem; height: 3.4rem; margin: 0 auto 1rem; border: 1px solid var(--color-primary); border-radius: var(--radius-md); color: var(--color-primary); font-size: 1.8rem; }.empty-chat h2 { margin: 0; font-size: 1.3rem; }.empty-chat p { color: var(--color-text-muted); line-height: 1.5; }
.suggestions { display: flex; flex-direction: column; align-items: stretch; gap: .5rem; margin-top: 1.5rem; text-align: left; }
.suggestions-label { margin: 0 0 .15rem; color: var(--color-primary); font-size: .72rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
.faq-suggestion { display: flex; align-items: center; gap: .6rem; padding: .7rem .85rem; border: 1px solid var(--color-border); border-left: 4px solid var(--color-secondary); border-radius: var(--radius-sm); background: var(--color-secondary-light); color: var(--color-primary-hover); font-weight: 600; cursor: pointer; transition: background var(--motion-duration) var(--motion-ease), border-color var(--motion-duration) var(--motion-ease); }
.faq-suggestion:hover { background: var(--color-primary-light); border-color: var(--color-primary); }
.faq-suggestion-text { display: flex; flex-direction: column; gap: .1rem; min-width: 0; }
.faq-suggestion-text small { color: var(--color-text-muted); font-weight: 400; }
.faq-suggestion-arrow { margin-left: auto; color: var(--color-secondary); font-weight: 700; }
.faq-suggestion-badge { display: grid; place-items: center; flex: 0 0 auto; width: 1.15rem; height: 1.15rem; border-radius: 50%; background: var(--color-secondary); color: #fff; font-size: .7rem; font-weight: 800; }
.message { max-width: 76%; margin-bottom: 1.25rem; padding: 1rem 1.1rem; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); }.message.user { margin-left: auto; border-color: var(--color-border-strong); background: var(--color-primary-light); }.message-label { margin-bottom: .35rem; color: var(--color-text-muted); font-size: .72rem; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; }.message-text { margin: 0; white-space: pre-wrap; line-height: 1.55; }.sources { display: flex; flex-wrap: wrap; gap: .35rem; margin-top: .8rem; color: var(--color-ink-muted); font-size: .72rem; }.sources span { font-weight: 800; }.sources small { padding: .15rem .35rem; border-radius: var(--radius-sm); background: var(--color-neutral-light); }.typing span { animation: blink 1.2s infinite; }.typing span:nth-child(2) { animation-delay: .2s; }.typing span:nth-child(3) { animation-delay: .4s; }@keyframes blink { 0%,100%{opacity:.2}50%{opacity:1} }
.faq-panel { border-top: 1px solid var(--color-border); padding: 1rem; background: var(--color-primary-light); }
.faq-panel-header { display: flex; align-items: center; gap: .75rem; margin-bottom: .75rem; }
.faq-back { border: 0; background: none; color: var(--color-primary); font-weight: 700; cursor: pointer; padding: 0; }
.faq-back:hover { color: var(--color-primary-hover); }
.faq-close { margin-left: auto; border: 1px solid var(--color-border-strong); border-radius: var(--radius-sm); background: var(--color-surface); cursor: pointer; padding: .25rem .5rem; }
.faq-categories { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: .6rem; }
.faq-category { display: flex; flex-direction: column; gap: .2rem; padding: .75rem .85rem; border: 1px solid var(--color-border-strong); border-radius: var(--radius-sm); background: var(--color-surface); text-align: left; cursor: pointer; color: inherit; font: inherit; transition: border-color var(--motion-duration) var(--motion-ease), background var(--motion-duration) var(--motion-ease); }
.faq-category:hover { border-color: var(--color-secondary); background: var(--color-secondary-light); }
.faq-category span { font-weight: 700; color: var(--color-primary); }
.faq-category small { color: var(--color-text-muted); }
.faq-questions { list-style: none; margin: 0; padding: 0; max-height: 240px; overflow-y: auto; }
.faq-questions li + li { margin-top: .4rem; }
.faq-questions button { width: 100%; text-align: left; padding: .65rem .8rem; border: 1px solid var(--color-border-strong); border-radius: var(--radius-sm); background: var(--color-surface); color: inherit; font: inherit; cursor: pointer; transition: border-color var(--motion-duration) var(--motion-ease), background var(--motion-duration) var(--motion-ease); }
.faq-questions button:hover { border-color: var(--color-secondary); background: var(--color-secondary-light); }
.faq-status { margin: 0; padding: .75rem 0; color: var(--color-text-muted); }
.faq-error { color: var(--color-error-ink); }
.composer { padding: 1rem; border-top: 1px solid var(--color-border); background: var(--color-surface); }.composer textarea { width: 100%; resize: vertical; border: 1px solid var(--color-border-strong); border-radius: var(--radius-sm); padding: .85rem; color: inherit; font: inherit; outline: none; }.composer textarea:focus { border-color: var(--color-primary); box-shadow: 0 0 0 3px var(--color-primary-light); }.composer-footer { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-top: .65rem; color: var(--color-text-muted); font-size: .75rem; }.composer button { border: 0; border-radius: var(--radius-sm); padding: .7rem 1rem; background: var(--color-primary); color: var(--color-primary-contrast); font-weight: 700; cursor: pointer; transition: background var(--motion-duration) var(--motion-ease); }.composer button:hover:not(:disabled) { background: var(--color-primary-hover); }.composer button:disabled { opacity: .45; cursor: not-allowed; }.error-message { margin: 0; padding: .75rem 1rem; color: var(--color-error-ink); background: var(--color-error-light); }.disclaimer { margin: 0; padding: .8rem 1rem 1rem; color: var(--color-text-muted); font-size: .75rem; text-align: center; }.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
@media (max-width: 640px) { .chatbot-header { flex-direction: column; padding: 1.25rem; }.header-actions { flex-wrap: wrap; }.message-list { padding: 1rem; }.message { max-width: 90%; }.chatbot-page { padding: 1rem .5rem 3rem; } }
</style>
