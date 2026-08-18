<template>
  <main class="dashboard-page">
    <section v-if="loading" class="dashboard-loading" aria-live="polite">
      <div class="skeleton skeleton-wide"></div><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-copy"></div>
    </section>
    <section v-else-if="loadError" class="dashboard-error" role="alert">
      <strong>Kunde inte läsa översikten.</strong><span>{{ loadError }}</span><button type="button" @click="loadDashboard">Försök igen</button>
    </section>
    <template v-else>
    <section class="dashboard-hero">
      <div>
        <p class="eyebrow">Mindful Learning · Skolöversikt</p>
        <h1>{{ greeting }}, {{ displayName }}</h1>
        <p class="hero-copy">En samlad arbetsyta för dagens undervisning, uppföljning och nästa viktiga steg.</p>
      </div>
      <div class="hero-actions">
        <router-link class="primary-action" :to="primaryAction.to">{{ primaryAction.label }}</router-link>
        <router-link class="secondary-action" to="/messages">Öppna meddelanden</router-link>
        <button class="hero-refresh" type="button" :disabled="refreshing" @click="loadDashboard">{{ refreshing ? 'Uppdaterar...' : 'Uppdatera' }}</button>
      </div>
    </section>

    <section class="stat-grid" aria-label="Snabb översikt">
      <article v-for="stat in stats" :key="stat.label" class="stat-card">
        <span class="stat-label">{{ stat.label }}</span>
        <strong>{{ stat.value }}</strong>
        <span class="stat-note">{{ stat.note }}</span>
      </article>
    </section>

    <section class="workspace-grid">
      <article class="panel quick-panel">
        <div class="panel-heading"><div><p class="eyebrow">Snabb åtkomst</p><h2>Fortsätt där du slutade</h2></div></div>
        <div class="quick-links">
          <router-link v-for="item in quickLinks" :key="item.to" :to="item.to" class="quick-link">
            <span class="quick-icon" aria-hidden="true">{{ item.icon }}</span>
            <span><strong>{{ item.label }}</strong><small>{{ item.description }}</small></span>
            <span aria-hidden="true">→</span>
          </router-link>
        </div>
      </article>

      <article class="panel today-panel">
        <div class="panel-heading"><div><p class="eyebrow">Idag</p><h2>Din arbetsyta</h2></div><span class="status-pill">{{ roleLabel }}</span></div>
        <ul class="check-list">
          <li><span class="check-dot">1</span><span><strong>Kontrollera nya meddelanden</strong><small>Håll kommunikationen samlad i inkorgen.</small></span></li>
          <li><span class="check-dot">2</span><span><strong>Följ upp aktiva ärenden</strong><small>Se uppgifter, betyg, APL och studieplaner.</small></span></li>
          <li><span class="check-dot">3</span><span><strong>Planera nästa steg</strong><small>Använd kalendern för möten, prov och deadlines.</small></span></li>
        </ul>
      </article>
    </section>

    <section class="role-note" aria-label="Rollinformation">
      <div><p class="eyebrow">Rollbaserad vy</p><h2>Allt du behöver, utan brus.</h2><p>Menyn och snabbvägarna anpassas efter dina behörigheter. Befintliga elev-, lärar-, APL-, rapport- och administrationsflöden finns kvar och nås från sina respektive arbetsytor.</p></div>
      <router-link class="secondary-action" to="/profile">Visa min profil</router-link>
    </section>
    </template>
  </main>
</template>

<script>
import { computed, onMounted, ref } from 'vue'
import { useStore } from 'vuex'
import client from '@/api/client.js'

export default {
  name: 'DashboardPage',
  setup() {
    const store = useStore()
    const user = computed(() => store.state.user || {})
    const role = computed(() => store.getters.userRole)
    const loading = ref(true)
    const refreshing = ref(false)
    const loadError = ref('')
    const unreadCount = ref(null)
    const displayName = computed(() => user.value.name || user.value.username || user.value.email?.split('@')[0] || 'där')
    const roleLabel = computed(() => ({ student: 'Elev', teacher: 'Lärare', admin: 'Administratör', systemadmin: 'Systemadministratör', syv: 'SYV', specped: 'Specialpedagog', coordinator: 'Koordinator' }[role.value] || 'Medarbetare'))
    const greeting = computed(() => new Date().getHours() < 12 ? 'God morgon' : new Date().getHours() < 18 ? 'God eftermiddag' : 'God kväll')
    const primaryAction = computed(() => role.value === 'student' ? { label: 'Mina kurser', to: '/course-cards' } : role.value === 'teacher' ? { label: 'Lärarvy', to: '/larare/kurser' } : { label: 'Öppna elever', to: '/students' })
    const stats = computed(() => role.value === 'student' ? [
      { label: 'Mina kurser', value: 'Se aktuella', note: 'kurser och framsteg' }, { label: 'Inlämningar', value: 'Följ upp', note: 'uppgifter och feedback' }, { label: 'Meddelanden', value: unreadCount.value === null ? 'Öppna' : `${unreadCount.value} olästa`, note: 'nya besked i inkorgen' }, { label: 'Kalender', value: 'Planera', note: 'möten och deadlines' },
    ] : [
      { label: 'Elevöversikt', value: 'Öppna', note: 'studentregister och uppföljning' }, { label: 'Kurser', value: 'Hantera', note: 'mallar och kursinstanser' }, { label: 'Kommunikation', value: 'Samlat', note: 'meddelanden och notiser' }, { label: 'Rapporter', value: 'Analysera', note: 'resultat och aktivitet' },
    ])
    const loadDashboard = async () => {
      refreshing.value = true
      loadError.value = ''
      try {
        const { data } = await client.get('/notifications')
        const notifications = Array.isArray(data) ? data : data?.notifications || []
        unreadCount.value = notifications.filter((item) => !item.read && !item.isRead).length
      } catch (error) {
        loadError.value = error.message || 'Försök igen eller kontakta skoladministrationen.'
      } finally {
        loading.value = false
        refreshing.value = false
      }
    }

    const quickLinks = computed(() => role.value === 'student' ? [
      { to: '/course-cards', label: 'Mina kurser', description: 'Progress, moduler och studieintyg', icon: '01' }, { to: '/examform', label: 'Prövningar', description: 'Anmälan och kommande examinationer', icon: '02' }, { to: '/chatbot', label: 'Studieassistent', description: 'Få hjälp att komma vidare', icon: '03' }, { to: '/messages', label: 'Meddelanden', description: 'Se dialoger och nya besked', icon: '04' },
    ] : [
      { to: '/students', label: 'Elever', description: 'Sök och följ upp studerande', icon: '01' }, { to: '/larare/kurser', label: 'Mina kurser', description: 'Undervisning och kursarbete', icon: '02' }, { to: '/betyg', label: 'Betyg', description: 'Bedöm och följ resultat', icon: '03' }, { to: '/kalender', label: 'Kalender', description: 'Planera möten och prov', icon: '04' },
    ])
    onMounted(loadDashboard)

    return { displayName, roleLabel, greeting, primaryAction, stats, quickLinks, loading, refreshing, loadError, loadDashboard }
  },
}
</script>

<style scoped>
.dashboard-page { min-height: 100%; padding: 2rem clamp(1rem, 4vw, 4rem) 4rem; background: #f4f7f5; color: #17352e; }.dashboard-loading,.dashboard-error { max-width: 900px; margin: 4rem auto; padding: 2rem; background: #fff; border: 1px solid #d8e3dd; }.skeleton { background: linear-gradient(90deg, #e7efea 25%, #f7faf8 50%, #e7efea 75%); background-size: 200% 100%; animation: shimmer 1.4s infinite; }.skeleton-wide { height: 10rem; margin-bottom: 1rem; }.skeleton-title { width: 55%; height: 2.5rem; margin-bottom: .8rem; }.skeleton-copy { width: 80%; height: 1rem; }.dashboard-error { display: grid; gap: .6rem; color: #6e2e2e; }.dashboard-error button { width: fit-content; border: 0; padding: .65rem 1rem; background: #17352e; color: #fff; cursor: pointer; }.hero-refresh { border: 1px solid #557d6d; padding: .7rem 1rem; background: transparent; color: #f7faf8; cursor: pointer; font-weight: 800; }.hero-refresh:disabled { opacity: .6; cursor: wait; }@keyframes shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
.dashboard-hero { display: flex; justify-content: space-between; gap: 2rem; align-items: end; max-width: 1400px; margin: 0 auto; padding: 2.5rem clamp(1rem, 3vw, 3rem); background: #17352e; color: #f7faf8; }
.eyebrow { margin: 0 0 .5rem; color: #78c5a5; text-transform: uppercase; letter-spacing: .12em; font-size: .72rem; font-weight: 800; }
h1,h2,p { margin-top: 0; } h1 { max-width: 700px; margin-bottom: .75rem; font-size: clamp(2rem, 5vw, 4.5rem); line-height: .98; letter-spacing: -.05em; } h2 { margin-bottom: .4rem; font-size: 1.3rem; letter-spacing: -.02em; }.hero-copy { max-width: 600px; margin-bottom: 0; color: #c7dbd1; line-height: 1.6; }.hero-actions { display: flex; flex-wrap: wrap; gap: .75rem; }.primary-action,.secondary-action { display: inline-flex; align-items: center; justify-content: center; min-height: 2.7rem; padding: .7rem 1rem; text-decoration: none; font-weight: 800; font-size: .82rem; }.primary-action { background: #78c5a5; color: #17352e; }.secondary-action { border: 1px solid #a8c4b7; color: inherit; }.dashboard-hero .secondary-action { border-color: #557d6d; color: #f7faf8; }
.stat-grid,.workspace-grid,.role-note { max-width: 1400px; margin: 1.25rem auto 0; }.stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: #cad9d1; border: 1px solid #cad9d1; }.stat-card { display: flex; flex-direction: column; gap: .35rem; padding: 1.25rem; background: #fff; }.stat-label,.stat-note { color: #63776e; font-size: .75rem; }.stat-card strong { font-size: 1.35rem; }.workspace-grid { display: grid; grid-template-columns: 1.15fr .85fr; gap: 1.25rem; }.panel,.role-note { background: #fff; border: 1px solid #d8e3dd; padding: 1.5rem; }.panel-heading { display: flex; justify-content: space-between; align-items: start; margin-bottom: 1rem; }.status-pill { padding: .4rem .6rem; background: #e4f3ec; color: #236448; font-size: .72rem; font-weight: 800; }.quick-links { display: grid; gap: .55rem; }.quick-link { display: grid; grid-template-columns: 2rem 1fr auto; gap: .8rem; align-items: center; padding: .85rem; color: #17352e; text-decoration: none; border: 1px solid #e4ece7; }.quick-link:hover,.quick-link:focus-visible { border-color: #78c5a5; background: #f6fbf8; }.quick-link strong,.quick-link small { display: block; }.quick-link small,.check-list small { margin-top: .2rem; color: #718179; font-size: .75rem; }.quick-icon,.check-dot { display: grid; place-items: center; width: 2rem; height: 2rem; background: #e5f3eb; color: #236448; font-size: .7rem; font-weight: 900; }.check-list { display: grid; gap: 1.1rem; padding: 0; margin: 1.5rem 0 0; list-style: none; }.check-list li { display: flex; gap: .8rem; align-items: start; }.check-dot { flex: 0 0 auto; border-radius: 50%; }.check-list strong { display: block; font-size: .86rem; }.role-note { display: flex; justify-content: space-between; align-items: center; gap: 2rem; margin-top: 1.25rem; background: #e6f1eb; }.role-note p:not(.eyebrow) { max-width: 720px; margin-bottom: 0; color: #52675d; line-height: 1.6; }.role-note .secondary-action { color: #17352e; white-space: nowrap; }
@media (max-width: 800px) { .dashboard-hero,.role-note { flex-direction: column; align-items: stretch; }.workspace-grid { grid-template-columns: 1fr; }.stat-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 480px) { .dashboard-page { padding: 1rem .75rem 2rem; }.dashboard-hero { padding: 1.5rem; }.hero-actions { flex-direction: column; }.hero-actions a { width: 100%; }.stat-card { padding: .9rem; }.panel,.role-note { padding: 1rem; } }
</style>
