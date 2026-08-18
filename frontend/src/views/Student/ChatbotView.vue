<template>
  <main class="chatbot-page">
    <section class="chatbot-shell" aria-labelledby="chatbot-title">
      <header class="chatbot-header">
        <div>
          <p class="eyebrow">Mindful Learning · Studentstöd</p>
          <h1 id="chatbot-title">Fråga din studieassistent</h1>
          <p class="intro">Få hjälp att förstå kursinnehåll, planera nästa steg och hitta rätt i din studieplan.</p>
        </div>
        <span class="status-pill" :class="statusClass"><span class="status-dot"></span>{{ statusLabel }}</span>
      </header>

      <div ref="messageList" class="message-list" aria-live="polite">
        <div v-if="messages.length === 0" class="empty-chat">
          <div class="empty-mark" aria-hidden="true">?</div>
          <h2>Vad vill du veta?</h2>
          <p>Ställ en konkret fråga så får du ett svar baserat på din studieplan och kursinformation.</p>
          <div class="suggestions">
            <button v-for="suggestion in suggestions" :key="suggestion" type="button" @click="ask(suggestion)">{{ suggestion }}</button>
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
const suggestions = ['Hur kommer jag igång med min kurs?', 'Vad behöver jag göra härnäst?', 'Hur lämnar jag in en uppgift?']

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
    const { data } = await client.post('/chatbot/ask', { question: value })
    messages.value.push({ id: `assistant-${Date.now()}`, role: 'assistant', text: data.data?.answer || 'Jag kunde inte hitta ett svar just nu.', sources: data.data?.sources || [] })
  } catch (requestError) {
    error.value = requestError.message || 'Kunde inte hämta ett svar. Försök igen.'
  } finally {
    sending.value = false
    await scrollToLatest()
  }
}

const submit = () => ask(question.value)

onMounted(async () => {
  try {
    const { data } = await client.get('/chatbot/status')
    serviceStatus.value = data.data?.status || 'available'
  } catch {
    serviceStatus.value = 'limited'
  }
})
</script>

<style scoped>
.chatbot-page { min-height: calc(100vh - 7rem); padding: 2rem 1rem 4rem; background: #f6f7f5; color: #15231f; }
.chatbot-shell { width: min(100%, 900px); margin: 0 auto; background: #fff; border: 1px solid #dbe4df; box-shadow: 0 18px 50px rgba(21,35,31,.08); }
.chatbot-header { display: flex; justify-content: space-between; gap: 1.5rem; padding: 2rem; border-bottom: 1px solid #dbe4df; }
.eyebrow { margin: 0 0 .6rem; color: #2d7564; font-size: .72rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
h1 { margin: 0; font-size: clamp(1.7rem, 4vw, 2.7rem); letter-spacing: -.04em; }
.intro { max-width: 560px; margin: .7rem 0 0; color: #5c6b65; line-height: 1.5; }
.status-pill { align-self: flex-start; display: inline-flex; align-items: center; gap: .45rem; padding: .45rem .7rem; border: 1px solid #c8ded5; color: #216150; font-size: .8rem; white-space: nowrap; }
.status-dot { width: .45rem; height: .45rem; border-radius: 50%; background: #2d9a72; }
.is-limited { color: #8a5d18; border-color: #ead4a7; }.is-limited .status-dot { background: #c8902d; }
.message-list { min-height: 420px; max-height: 55vh; overflow-y: auto; padding: 2rem; background: #fbfcfb; }
.empty-chat { max-width: 500px; margin: 4rem auto; text-align: center; }.empty-mark { display: grid; place-items: center; width: 3.4rem; height: 3.4rem; margin: 0 auto 1rem; border: 1px solid #2d7564; color: #2d7564; font-size: 1.8rem; }.empty-chat h2 { margin: 0; font-size: 1.3rem; }.empty-chat p { color: #697870; line-height: 1.5; }
.suggestions { display: flex; flex-wrap: wrap; justify-content: center; gap: .5rem; margin-top: 1.5rem; }.suggestions button { padding: .65rem .8rem; border: 1px solid #cfdcd6; background: #fff; color: #2d5146; cursor: pointer; }.suggestions button:hover { border-color: #2d7564; }
.message { max-width: 76%; margin-bottom: 1.25rem; padding: 1rem 1.1rem; border: 1px solid #dbe4df; background: #fff; }.message.user { margin-left: auto; border-color: #b8d7ca; background: #edf7f2; }.message-label { margin-bottom: .35rem; color: #587068; font-size: .72rem; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; }.message-text { margin: 0; white-space: pre-wrap; line-height: 1.55; }.sources { display: flex; flex-wrap: wrap; gap: .35rem; margin-top: .8rem; color: #668177; font-size: .72rem; }.sources span { font-weight: 800; }.sources small { padding: .15rem .35rem; background: #eef3f0; }.typing span { animation: blink 1.2s infinite; }.typing span:nth-child(2) { animation-delay: .2s; }.typing span:nth-child(3) { animation-delay: .4s; }@keyframes blink { 0%,100%{opacity:.2}50%{opacity:1} }
.composer { padding: 1rem; border-top: 1px solid #dbe4df; }.composer textarea { width: 100%; resize: vertical; border: 1px solid #bdcbc4; padding: .85rem; color: inherit; font: inherit; outline: none; }.composer textarea:focus { border-color: #2d7564; box-shadow: 0 0 0 3px rgba(45,117,100,.12); }.composer-footer { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-top: .65rem; color: #718078; font-size: .75rem; }.composer button { border: 0; padding: .7rem 1rem; background: #1d4f43; color: #fff; font-weight: 700; cursor: pointer; }.composer button:disabled { opacity: .45; cursor: not-allowed; }.error-message { margin: 0; padding: .75rem 1rem; color: #9e3b35; background: #fff3f1; }.disclaimer { margin: 0; padding: .8rem 1rem 1rem; color: #7b8881; font-size: .75rem; text-align: center; }.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
@media (max-width: 640px) { .chatbot-header { flex-direction: column; padding: 1.25rem; }.message-list { padding: 1rem; }.message { max-width: 90%; }.chatbot-page { padding: 1rem .5rem 3rem; } }
</style>
