<template>
  <div class="scrollable-view">
    <div class="home-page">
      <!-- Hero Section -->
      <section class="hero">
        <div class="hero-content">
          <h1>Välkommen till Mindful Learning</h1>
          <p>En modern plattform för utbildning och lärande som sätter användaren i centrum. Upptäck nya möjligheter att växa och utvecklas.</p>
          <div class="hero-actions">
            <router-link v-if="!isLoggedIn" to="/login" class="btn btn-primary btn-lg">
              Kom igång
            </router-link>
            <router-link v-if="isLoggedIn" to="/profile" class="btn btn-primary btn-lg">
              Min profil
            </router-link>
          </div>
        </div>
      </section>

      <!-- Features Section -->
      <section class="features-section">
        <div class="container">
          <h2 class="section-title">Funktioner</h2>
          <div class="features-grid">
            <div class="feature-card">
              <div class="feature-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                  <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                </svg>
              </div>
              <h3>Kurser & Utbildning</h3>
              <p>Hantera kurser, program och kurspaket på ett enkelt och överskådligt sätt.</p>
            </div>

            <div class="feature-card">
              <div class="feature-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                  <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                </svg>
              </div>
              <h3>Betygsättning</h3>
              <p>Effektiv hantering av betyg och bedömningar med stöd för olika betygsskalor.</p>
            </div>

            <div class="feature-card">
              <div class="feature-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </div>
              <h3>Kalender & Schema</h3>
              <p>Håll koll på viktiga datum, prövningar och möten med den integrerade kalendern.</p>
            </div>

            <div class="feature-card">
              <div class="feature-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <h3>Studenthantering</h3>
              <p>Komplett översikt över studenter, deras framsteg och prestationer.</p>
            </div>
          </div>
        </div>
      </section>

      <!-- CTA Section -->
      <section v-if="!isLoggedIn" class="cta">
        <div class="container">
          <h2>Redo att komma igång?</h2>
          <p>Skapa ditt konto idag och upptäck alla möjligheter som Mindful Learning erbjuder.</p>
          <router-link to="/login" class="btn btn-primary btn-lg">
            Logga in nu
          </router-link>
        </div>
      </section>
    </div>
  </div>
</template>

<script>
import { computed } from 'vue'
import { useStore } from 'vuex'

export default {
  name: 'HomePage',
  setup() {
    const store = useStore()
    const isLoggedIn = computed(() => store.getters.isLoggedIn)

    return {
      isLoggedIn
    }
  }
}
</script>

<style scoped>
  .home-page {
    min-height: 100%;
    background: var(--color-bg);
    display: flex;
    flex-direction: column;
  }

  .container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 1.5rem;
  }

  .hero-content {
    max-width: 800px;
    margin: 0 auto;
  }

  .hero-actions {
    margin-top: 2rem;
    display: flex;
    justify-content: center;
    gap: 1rem;
  }

  .features-section {
    padding: 5rem 0;
    background: var(--color-surface);
    flex: 1;
  }

  .features-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 2rem;
    margin-top: 3rem;
  }

  .feature-card h3 {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--color-text);
    margin: 1rem 0 0.5rem 0;
  }

  .feature-card p {
    color: var(--color-text-secondary);
    line-height: 1.6;
    margin: 0;
  }

  /* Responsiv design */
  @media (max-width: 768px) {
    .hero h1 {
      font-size: 2.5rem;
    }
    
    .hero p {
      font-size: 1.125rem;
    }

    .features-grid {
      grid-template-columns: 1fr;
      gap: 1.5rem;
    }

    .hero-actions {
      flex-direction: column;
      align-items: center;
    }

    .hero-actions .btn {
      width: 100%;
      max-width: 300px;
    }
  }

  @media (max-width: 480px) {
    .hero {
      padding: 4rem 1rem;
    }
    
    .hero h1 {
      font-size: 2rem;
    }
    
    .features-section {
      padding: 3rem 0;
    }
  }
</style>
