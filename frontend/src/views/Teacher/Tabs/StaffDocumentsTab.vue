<template>
  <div class="staff-documents-tab">
    <div class="card">
      <div class="card-header">
        <h3>Filarkiv</h3>
      </div>
      <div class="card-body">
        <div class="document-category">
          <h4>Allmänna dokument</h4>
          <DocumentSection
            :user-data="teacher.user"
            user-type="teacher"
            type="GENERAL"
          />
        </div>

        <div class="document-category">
          <h4>Lärardokument</h4>
          <DocumentSection
            :user-data="teacher.user"
            user-type="teacher"
            type="TEACHER_DOC"
          />
        </div>

        <div class="document-category">
          <h4>Rapporter</h4>
          <DocumentSection
            :user-data="teacher.user"
            user-type="teacher"
            type="REPORT"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import DocumentSection from '@/views/Admin/SearchTabs/DocumentSection.vue';

export default {
  name: 'StaffDocumentsTab',
  components: { DocumentSection },
  props: {
    teacher: { type: Object, required: true },
  },
};
</script>

<style scoped>
.card {
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
}

.card-header {
  background: #f8f9fa;
  padding: 12px 16px;
  border-bottom: 1px solid #dee2e6;
}

.card-header h3 {
  margin: 0;
  font-size: 1.1rem;
  color: #2c3e50;
}

.card-body {
  padding: 16px;
}

.document-category {
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid #f0f0f0;
}

.document-category:last-child {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}

.document-category h4 {
  font-size: 1rem;
  color: #495057;
  margin-bottom: 12px;
}
</style>
