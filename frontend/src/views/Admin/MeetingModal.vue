<template>
  <div class="modal-overlay">
    <div class="modal-content">
<h3>{{ event.title || 'Mötesinformation' }}</h3>
      

      <p><strong>Elev:</strong> {{ event.extendedProps?.studentName }}</p>
      <p><strong>Personnummer:</strong> {{ event.extendedProps?.personalNumber }}</p>
      <p><strong>Plats:</strong> {{ event.extendedProps?.location }}</p>
      <p><strong>Bokad av:</strong> {{ event.extendedProps?.bookedBy }}</p>
      <p><strong>Tid:</strong> {{ formatTime(event.start) }}</p>

      <div class="buttons">
        <button @click="$emit('close')">Stäng</button>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  props: {
    event: Object
  },
  emits: ['close'],
  methods: {
    formatTime(date) {
      return new Date(date).toLocaleString('sv-SE', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  }
};
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
}
.modal-content {
  background: white;
  padding: 20px;
  width: 400px;
  border-radius: 8px;
}
.buttons {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}
</style>
