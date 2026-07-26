<template>
  <section>
    <div class="register-container">
      <form class="register-form" @submit.prevent="register">
        <input v-model="name" type="name" placeholder="Namn" class="input-field" required />
        <input
          v-model="email"
          type="email"
          placeholder="Email"
          class="input-field"
          required
          autocomplete="username"
        />
        <input
          v-model="password"
          type="password"
          placeholder="Lösenord"
          class="input-field"
          required
          autocomplete="new-password"
        />
        <button type="submit" class="register-button">Register</button>
      </form>
      <p v-if="message" class="message">{{ message }}</p>
    </div>
  </section>
</template>

<script>
  import client from '@/api/client.js'
  import { useToast } from '@/composables/useToast.js'

  export default {
    setup() {
      const toast = useToast()
      return { toast }
    },
    data() {
      return {
        name: '',
        email: '',
        password: '',
        message: '',
      }
    },
    methods: {
      async register() {
        try {
          const response = await client.post('/auth/register', {
            username: this.name,
            email: this.email,
            password: this.password,
          })
          this.message = response.data.message
        } catch (error) {
          this.message = error.response?.data?.message || 'An error occurred.'
          this.toast.error(this.message)
          console.error('Register error:', error)
        }
      },
    },
  }
</script>

<style scoped>
  .register-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-top: 20px;
    /* Space from the top */
    padding: 20px;
    background-color: #ffffff;
  }

  .logo {
    width: 150px;
    margin-bottom: 20px;
  }

  .register-form {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
    max-width: 300px;
  }

  .input-field {
    width: 100%;
    padding: 10px;
    margin: 10px 0;
    font-size: 16px;
    border: 1px solid #ccc;
    border-radius: 4px;
    box-sizing: border-box;
  }

  .register-button {
    width: 100%;
    padding: 10px;
    font-size: 16px;
    color: #fff;
    background-color: #007bff;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .register-button:hover {
    background-color: #0056b3;
  }

  .message {
    margin-top: 20px;
    color: #d9534f;
    /* Red for error messages */
  }
</style>
