<template>
  <div>
    <h2>Admin: Hantera Frågor för Handlingsplan</h2>
    <form @submit.prevent="submitQuestions">
      <div v-for="(question, index) in questions" :key="index" class="form-group">
        <input v-model="question.label" placeholder="Label" required />
        <select v-model="question.type" required>
          <option value="text">Text</option>
          <option value="date">Datum</option>
          <option value="textarea">Textarea</option>
          <option value="select">Select</option>
          <option value="radio">Radio</option>
          <option value="checkbox">Checkbox</option>
        </select>
        <div v-if="question.type === 'select' || question.type === 'radio' || question.type === 'checkbox'" >
          <div v-for="(option, optIndex) in question.options" :key="optIndex">
            <input v-model="question.options[optIndex]" placeholder="Options" />
            <button @click="removeOption(index, optIndex)">Ta bort alternativ</button>
          </div>
          <button @click.prevent="addOption(index)">Lägg till alternativ</button>
        </div>
        <button @click.prevent="removeQuestion(index)">Ta bort fråga</button>      
      </div>
      <button @click.prevent="addQuestion">Lägg till fråga</button>
      <button type="submit">Spara Frågor</button>
    </form>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import client from '@/api/client.js'
import { useToast } from '@/composables/useToast.js'

const toast = useToast()

// Initial ladda frågor
const questions = ref([{label: '', type: 'text', options: [], required: true}])



const fetchQuestions = async () => {
  try {
    const response = await client.get('/form-questions/ACTION_PLAN')
    if (response.data && response.data.questions) {
      questions.value = response.data.questions
    }
  } catch (error) {
    console.error('Kunde inte hämta frågor:', error)
  }
}

onMounted(fetchQuestions)

const generateKey = (label) => {
  return label.toLowerCase().replace(/\s+/g, '_') + '_' + Math.random().toString(36).substr(2, 5);
}

const addQuestion = () => {
  questions.value.push({ 
    label: '', 
    type: 'text', 
    options: [], 
    required: true,
    key: generateKey('fråga') 
  })
}

const removeQuestion = (index) => {
  questions.value.splice(index, 1)
}

const addOption = (questionIndex) => {
  questions.value[questionIndex].options.push('')
}

const removeOption = (questionIndex, optionIndex) => {
  questions.value[questionIndex].options.splice(optionIndex, 1)
}

const submitQuestions = async () => {
  try {
    const cleanedQuestions = questions.value.map(q => ({
      label: q.label,
      type: q.type,
      options: ['select', 'checkbox', 'radio'].includes(q.type) ? (q.options || []) : [],
      required: q.required || false,
      key: q.key || generateKey(q.label)
    }));

    const response = await client.post('/form-questions', {
      type: 'ACTION_PLAN',
      questions: cleanedQuestions
    });

    toast.success(response.data.message);
  } catch (error) {
    console.error('Kunde inte spara frågor:', error);
  }
}

</script>

<style>
.form-group {
  margin-bottom: 1em;
  display: flex;
  gap: 10px;
  align-items: center;
}

input, select {
  padding: 5px;
  border-radius: 5px;
  border: 1px solid #ddd;
}
</style>
