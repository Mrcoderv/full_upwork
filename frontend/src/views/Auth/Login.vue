<template>
  <div class="login-page">
    <div class="login-container">
      <!-- Logo Section -->
      <div class="login-header">
        <router-link to="/" class="logo-link">
          <img src="@/assets/mindful_transparent.png" alt="Mindful Logo" class="logo" />
        </router-link>
        <h1>Välkommen tillbaka</h1>
        <p>Logga in för att fortsätta till Mindful Learning</p>
      </div>

      <!-- Login Form -->
      <div class="login-card">
        <form class="login-form" @submit.prevent="handleLogin">
          <div class="form-group">
            <label for="email">E-postadress</label>
            <input
              id="email"
              v-model="email"
              type="email"
              placeholder="din@email.com"
              required
              autocomplete="username"
              class="form-input"
              :class="{ 'error': message && message.includes('email') }"
            />
          </div>

          <div class="form-group">
            <label for="password">Lösenord</label>
            <input
              id="password"
              v-model="password"
              type="password"
              placeholder="Ange ditt lösenord"
              required
              autocomplete="current-password"
              class="form-input"
              :class="{ 'error': message && message.includes('lösenord') }"
            />
          </div>

          <button 
            type="submit" 
            class="btn btn-primary btn-lg login-btn"
            :disabled="isLoading"
          >
            <span v-if="isLoading" class="loading-spinner"></span>
            {{ isLoading ? 'Loggar in...' : 'Logga in' }}
          </button>
        </form>

        <!-- Error Message -->
        <div v-if="message" class="error-alert">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          {{ message }}
        </div>

        <!-- Additional Links -->
        <div class="login-footer">
          <router-link to="/" class="back-link">
            ← Tillbaka till startsidan
          </router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
  import { ref } from 'vue'
  import { useStore } from 'vuex'
  import { useRouter } from 'vue-router'

  export default {
    setup() {
      const store = useStore()
      const router = useRouter()

      const email = ref('')
      const password = ref('')
      const message = ref('')
      const isLoading = ref(false)

      const handleLogin = async () => {
        if (isLoading.value) return
        
        isLoading.value = true
        message.value = ''

        try {
          const result = await store.dispatch('login', {
            email: email.value,
            password: password.value,
          })

          if (result.success) {
            if (result.requiresPasswordChange) {
              router.push('/change-password')
            } else {
              router.push('/profile')
            }
          } else {
            message.value = result.message || 'Inloggningen misslyckades'
          }
        } catch (error) {
          message.value = 'Ett fel uppstod. Försök igen.'
          console.error('Login error:', error)
        } finally {
          isLoading.value = false
        }
      }

      return {
        email,
        password,
        message,
        isLoading,
        handleLogin,
      }
    },
  }
</script>

<style scoped>
  .login-page {
    min-height: 100vh;
    background: linear-gradient(135deg, var(--color-primary-light) 0%, var(--color-secondary-light) 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }

  .login-container {
    width: 100%;
    max-width: 400px;
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .login-header {
    text-align: center;
    color: var(--color-text);
  }

  .logo-link {
    display: inline-block;
    transition: transform 0.2s ease;
    cursor: pointer;
  }

  .logo-link:hover {
    transform: scale(1.05);
  }

  .logo {
    height: 80px;
    margin-bottom: 1.5rem;
    filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.1));
  }

  .login-header h1 {
    font-size: 2rem;
    font-weight: 700;
    margin: 0 0 0.5rem 0;
    color: var(--color-text);
  }

  .login-header p {
    font-size: 1rem;
    color: var(--color-text-secondary);
    margin: 0;
  }

  .login-card {
    background: var(--color-surface);
    border-radius: var(--radius-xl);
    box-shadow: var(--shadow-lg);
    border: 1px solid var(--color-border);
    padding: 2rem;
    backdrop-filter: blur(10px);
  }

  .login-form {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .form-group label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-text);
  }

  .form-input {
    padding: 0.875rem 1rem;
    border: 2px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: 1rem;
    background: var(--color-surface);
    color: var(--color-text);
    transition: all 0.2s ease-in-out;
    outline: none;
  }

  .form-input:focus {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px var(--color-primary-light);
  }

  .form-input.error {
    border-color: var(--color-error);
    box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
  }

  .form-input::placeholder {
    color: var(--color-text-muted);
  }

  .login-btn {
    width: 100%;
    margin-top: 0.5rem;
    position: relative;
    overflow: hidden;
  }

  .login-btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .loading-spinner {
    display: inline-block;
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-radius: 50%;
    border-top-color: white;
    animation: spin 1s linear infinite;
    margin-right: 0.5rem;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .error-alert {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.2);
    border-radius: var(--radius-md);
    color: var(--color-error);
    font-size: 0.875rem;
    margin-top: 1rem;
  }

  .error-alert svg {
    flex-shrink: 0;
  }

  .login-footer {
    margin-top: 1.5rem;
    text-align: center;
  }

  .back-link {
    color: var(--color-text-secondary);
    text-decoration: none;
    font-size: 0.875rem;
    transition: color 0.2s ease;
  }

  .back-link:hover {
    color: var(--color-primary);
  }

  /* Responsiv design */
  @media (max-width: 480px) {
    .login-page {
      padding: 0.5rem;
    }

    .login-container {
      max-width: 100%;
    }

    .login-card {
      padding: 1.5rem;
    }

    .login-header h1 {
      font-size: 1.75rem;
    }

    .logo {
      height: 60px;
      margin-bottom: 1rem;
    }
  }

  /* Animationer */
  .login-container {
    animation: fadeInUp 0.6s ease-out;
  }

  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(30px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .login-card {
    animation: slideIn 0.4s ease-out 0.2s both;
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
</style>
