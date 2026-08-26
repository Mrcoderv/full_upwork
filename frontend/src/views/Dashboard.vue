<template>
  <main class="dashboard-page">
    <section v-if="loading" class="dashboard-loading" aria-live="polite">
      <div class="skeleton skeleton-wide"></div><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-copy"></div>
    </section>
    <template v-else>
    <section v-if="loadError" class="dashboard-error" role="alert">
      <strong>Kunde inte uppdatera notifieringar.</strong><span>{{ loadError }}</span><button type="button" @click="loadDashboard">Försök igen</button>
    </section>
    <section class="dashboard-hero">
      <div>
        <p class="eyebrow">Mindful Learning · Skolöversikt</p>
        <h1>{{ greeting }}, {{ displayName }}</h1>
        <p class="hero-copy">En samlad arbetsyta för dagens undervisning, uppföljning och nästa viktiga steg.</p>
      </div>
      <div class="hero-actions">
        <router-link class="primary-action" :to="primaryAction.to">{{ primaryAction.label }}</router-link>
        <router-link class="secondary-action" to="/messages">Öppna meddelanden</router-link>
        <button class="hero-refresh" type="button" :disabled="refreshing" aria-live="polite" @click="loadDashboard">{{ refreshing ? 'Uppdaterar...' : 'Uppdatera notifieringar' }}</button>
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

      <article v-if="role === 'student' && aplStatus" class="panel today-panel">
        <div class="panel-heading"><div><p class="eyebrow">Arbetspraktik</p><h2>APL-status</h2></div><span class="status-pill" :style="{ background: aplColor, color: '#fff' }">{{ aplStatusLabel }}</span></div>
        <ul class="check-list">
          <li v-if="aplStatus.period"><span class="check-dot">✓</span><span><strong>Period</strong><small>{{ aplStatus.period }}</small></span></li>
          <li v-if="aplStatus.workplace"><span class="check-dot">✓</span><span><strong>Arbetsplats</strong><small>{{ aplStatus.workplace }}</small></span></li>
          <li v-if="aplStatus.supervisor"><span class="check-dot">✓</span><span><strong>Handledare</strong><small>{{ aplStatus.supervisor }}</small></span></li>
          <template v-if="aplStatusKitLinks.length > 0">
            <li v-for="link in aplStatusKitLinks" :key="link.to">
              <span class="check-dot">→</span>
              <span><router-link :to="link.to"><strong>{{ link.label }}</strong></router-link><small>{{ link.description }}</small></span>
            </li>
          </template>
        </ul>
      </article>

      <article v-else class="panel today-panel">
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
    const aplStatus = ref(null)
    const aplColor = computed(() => {
      const colors = { GRAY: '#9e9e9e', BLUE: '#2196f3', YELLOW: '#ffc107', PURPLE: '#9c27b0', RED: '#f44336', GREEN: '#4caf50' }
      return colors[aplStatus.value?.color] || '#9e9e9e'
    })
    const aplStatusLabel = computed(() => {
      const labels = { GRAY: 'Inte påbörjad', BLUE: 'Pågående', YELLOW: 'Försenad', PURPLE: 'Avslutande', RED: 'Ej godkänd', GREEN: 'Godkänd' }
      return labels[aplStatus.value?.color] || 'Okänd'
    })
    const aplStatusKitLinks = computed(() => {
      if (!aplStatus.value) return []
      const links = []
      if (aplStatus.value.hasLogbook) links.push({ to: '/student/apl', label: 'Loggbok', description: 'Dokumentera din praktik' })
      if (aplStatus.value.hasCv) links.push({ to: '/student/apl', label: 'CV', description: 'Visa ditt uppdaterade CV' })
      return links
    })
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
        if (role.value === 'student') {
          try {
            const { data: apl } = await client.get('/apl/my')
            aplStatus.value = apl
          } catch { aplStatus.value = null }
        }
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

    return { displayName, roleLabel, greeting, primaryAction, stats, quickLinks, loading, refreshing, loadError, loadDashboard, aplStatus, aplColor, aplStatusLabel, aplStatusKitLinks }
  },
}
</script>

<style scoped>
.dashboard-page { min-height: 100%; padding: 2rem clamp(1rem, 4vw, 4rem) 4rem; background: var(--color-canvas); color: var(--color-ink); }.dashboard-loading,.dashboard-error { max-width: 900px; margin: 4rem auto; padding: 2rem; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-card); }.skeleton { background: linear-gradient(90deg, var(--status-neutral-tint) 25%, var(--color-bg-secondary) 50%, var(--status-neutral-tint) 75%); background-size: 200% 100%; animation: shimmer 1.4s infinite; }.skeleton-wide { height: 10rem; margin-bottom: 1rem; }.skeleton-title { width: 55%; height: 2.5rem; margin-bottom: .8rem; }.skeleton-copy { width: 80%; height: 1rem; }.dashboard-error { display: grid; gap: .6rem; color: var(--color-error-ink); }.dashboard-error button { width: fit-content; border: 0; border-radius: var(--radius-sm); padding: .65rem 1rem; background: var(--color-primary); color: var(--color-primary-contrast); cursor: pointer; }.hero-refresh { border: 1px solid rgba(255,255,255,.5); border-radius: var(--radius-sm); padding: .7rem 1rem; background: rgba(255,255,255,.12); color: #fff; cursor: pointer; font-weight: 800; }.hero-refresh:hover:not(:disabled) { background: rgba(255,255,255,.22); }.hero-refresh:disabled { opacity: .6; cursor: wait; }@keyframes shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
.dashboard-hero { display: flex; justify-content: space-between; gap: 2rem; align-items: end; max-width: 1400px; margin: 0 auto; padding: 2.5rem clamp(1rem, 3vw, 3rem); border-radius: var(--radius-lg); background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary-hover) 100%); color: var(--color-primary-contrast); }
.eyebrow { margin: 0 0 .5rem; color: var(--color-secondary-light); text-transform: uppercase; letter-spacing: .12em; font-size: .72rem; font-weight: 800; }
h1,h2,p { margin-top: 0; } h1 { max-width: 700px; margin-bottom: .75rem; font-size: clamp(2rem, 5vw, 4.5rem); line-height: .98; letter-spacing: -.05em; } h2 { margin-bottom: .4rem; font-size: 1.3rem; letter-spacing: -.02em; }.hero-copy { max-width: 600px; margin-bottom: 0; color: rgba(255,255,255,.85); line-height: 1.6; }.hero-actions { display: flex; flex-wrap: wrap; gap: .75rem; }.primary-action,.secondary-action { display: inline-flex; align-items: center; justify-content: center; min-height: 2.7rem; padding: .7rem 1rem; border-radius: var(--radius-sm); text-decoration: none; font-weight: 800; font-size: .82rem; transition: background var(--motion-duration) var(--motion-ease), border-color var(--motion-duration) var(--motion-ease); }.primary-action { background: var(--color-surface); color: var(--color-primary-hover); }.primary-action:hover { background: var(--color-primary-light); }.secondary-action { border: 1px solid rgba(255,255,255,.55); color: inherit; }.dashboard-hero .secondary-action:hover { border-color: rgba(255,255,255,.9); background: rgba(255,255,255,.12); }
.stat-grid,.workspace-grid,.role-note { max-width: 1400px; margin: 1.25rem auto 0; }.stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: var(--color-border); border: 1px solid var(--color-border); border-radius: var(--radius-card); overflow: hidden; }.stat-card { display: flex; flex-direction: column; gap: .35rem; padding: 1.25rem; background: var(--color-surface); }.stat-label,.stat-note { color: var(--color-text-muted); font-size: .75rem; }.stat-card strong { font-size: 1.35rem; }.workspace-grid { display: grid; grid-template-columns: 1.15fr .85fr; gap: 1.25rem; }.panel,.role-note { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-card); padding: 1.5rem; }.panel-heading { display: flex; justify-content: space-between; align-items: start; margin-bottom: 1rem; }.status-pill { padding: .4rem .6rem; border-radius: var(--radius-pill); background: var(--color-primary-light); color: var(--color-primary-hover); font-size: .72rem; font-weight: 800; }.quick-links { display: grid; gap: .55rem; }.quick-link { display: grid; grid-template-columns: 2rem 1fr auto; gap: .8rem; align-items: center; padding: .85rem; border-radius: var(--radius-sm); color: var(--color-ink); text-decoration: none; border: 1px solid var(--color-border); transition: border-color var(--motion-duration) var(--motion-ease), background var(--motion-duration) var(--motion-ease); }.quick-link:hover,.quick-link:focus-visible { border-color: var(--color-secondary); background: var(--color-secondary-light); }.quick-link strong,.quick-link small { display: block; }.quick-link small,.check-list small { margin-top: .2rem; color: var(--color-text-muted); font-size: .75rem; }.quick-icon,.check-dot { display: grid; place-items: center; width: 2rem; height: 2rem; border-radius: var(--radius-sm); background: var(--color-primary-light); color: var(--color-primary-hover); font-size: .7rem; font-weight: 900; }.check-list { display: grid; gap: 1.1rem; padding: 0; margin: 1.5rem 0 0; list-style: none; }.check-list li { display: flex; gap: .8rem; align-items: start; }.check-dot { flex: 0 0 auto; border-radius: 50%; }.check-list strong { display: block; font-size: .86rem; }.role-note { display: flex; justify-content: space-between; align-items: center; gap: 2rem; margin-top: 1.25rem; background: var(--color-primary-light); }.role-note p:not(.eyebrow) { max-width: 720px; margin-bottom: 0; color: var(--color-text-secondary); line-height: 1.6; }.role-note .secondary-action { border-color: var(--color-border-strong); color: var(--color-primary-hover); white-space: nowrap; }.role-note .secondary-action:hover { border-color: var(--color-primary); background: var(--color-surface); }
@media (max-width: 800px) { .dashboard-hero,.role-note { flex-direction: column; align-items: stretch; }.workspace-grid { grid-template-columns: 1fr; }.stat-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 480px) { .dashboard-page { padding: 1rem .75rem 2rem; }.dashboard-hero { padding: 1.5rem; }.hero-actions { flex-direction: column; }.hero-actions a { width: 100%; }.stat-card { padding: .9rem; }.panel,.role-note { padding: 1rem; } }
</style>
