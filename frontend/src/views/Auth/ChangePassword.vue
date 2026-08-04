<template>
  <div class="login-page">
    <div class="login-container">
      <div class="login-header">
        <router-link to="/" class="logo-link">
          <img src="@/assets/mindful_transparent.png" alt="Mindful Logo" class="logo" />
        </router-link>
        <h1>Byt lösenord</h1>
        <p>Du måste byta lösenord innan du fortsätter</p>
      </div>

      <div class="login-card">
        <form class="login-form" @submit.prevent="handleChangePassword">
          <div class="form-group">
            <label for="currentPassword">Nuvarande lösenord</label>
            <input
              id="currentPassword"
              v-model="currentPassword"
              type="password"
              placeholder="Ange ditt nuvarande lösenord"
              required
              autocomplete="current-password"
              class="form-input"
            />
          </div>

          <div class="form-group">
            <label for="newPassword">Nytt lösenord</label>
            <input
              id="newPassword"
              v-model="newPassword"
              type="password"
              placeholder="Minst 8 tecken, med stor/små bokstav, siffra och specialtecken"
              required
              autocomplete="new-password"
              class="form-input"
            />
          </div>

          <div class="form-group">
            <label for="confirmPassword">Bekräfta nytt lösenord</label>
            <input
              id="confirmPassword"
              v-model="confirmPassword"
              type="password"
              placeholder="Upprepa det nya lösenordet"
              required
              autocomplete="new-password"
              class="form-input"
            />
          </div>

          <button
            type="submit"
            class="btn btn-primary btn-lg login-btn"
            :disabled="isLoading"
          >
            <span v-if="isLoading" class="loading-spinner"></span>
            {{ isLoading ? 'Byter lösenord...' : 'Byt lösenord' }}
          </button>
        </form>

        <div v-if="message" class="error-alert">
          {{ message }}
        </div>

        <div class="login-footer">
          <button type="button" class="back-link" @click="handleLogout">
            Logga ut
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
  import { ref } from 'vue'
  import { useStore } from 'vuex'
  import { useRouter } from 'vue-router'
  import { useToast } from '@/composables/useToast.js'

  export default {
    setup() {
      const store = useStore()
      const router = useRouter()
      const toast = useToast()

      const currentPassword = ref('')
      const newPassword = ref('')
      const confirmPassword = ref('')
      const message = ref('')
      const isLoading = ref(false)

      const handleChangePassword = async () => {
        if (isLoading.value) return

        if (newPassword.value !== confirmPassword.value) {
          message.value = 'De nya lösenorden matchar inte.'
          return
        }

        isLoading.value = true
        message.value = ''

        try {
          const result = await store.dispatch('changePassword', {
            currentPassword: currentPassword.value,
            newPassword: newPassword.value,
          })

          if (result.success) {
            toast.success('Lösenordet har ändrats!')
            router.push('/profile')
          } else {
            message.value = result.message || 'Lösenordsändringen misslyckades.'
          }
        } catch (error) {
          message.value = 'Ett fel uppstod. Försök igen.'
        } finally {
          isLoading.value = false
        }
      }

      const handleLogout = async () => {
        await store.dispatch('logout')
        router.push('/login')
      }

      return {
        currentPassword,
        newPassword,
        confirmPassword,
        message,
        isLoading,
        handleChangePassword,
        handleLogout,
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

  .login-footer {
    margin-top: 1.5rem;
    text-align: center;
  }

  .back-link {
    color: var(--color-text-secondary);
    text-decoration: none;
    font-size: 0.875rem;
    transition: color 0.2s ease;
    cursor: pointer;
    background: none;
    border: none;
    padding: 0;
  }

  .back-link:hover {
    color: var(--color-primary);
  }

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
</style>
