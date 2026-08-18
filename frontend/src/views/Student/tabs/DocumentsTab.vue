<template>
  <div>
    <div class="doc-section-header">
      <h4>Allmänna dokument</h4>
    </div>
    <DocumentSection :student="student" type="GENERAL" />
    
    <div class="doc-section-header mt-4">
      <h4>Cv</h4>
    </div>
    <DocumentSection :student="student" type="CV" />
    
    <div class="doc-section-header mt-4">
      <h4>APL-kontrakt</h4>
    </div>
    <DocumentSection :student="student" type="APL_CONTRACT" />

    <div class="doc-section-header mt-4">
      <h4>Praktikintyg</h4>
    </div>
    <DocumentSection :student="student" type="COURSE_ARCHIVE" />
  </div>
</template>

<script>
import DocumentSection from '../../Admin/SearchTabs/DocumentSection.vue';

export default {
  name: 'DocumentsTab',
  components: {
    DocumentSection,
  },
  props: {
    student: {
      type: Object,
      required: true,
    },
  },
};
</script>

<style scoped>
.doc-section-header {
  border-bottom: 1px solid #dee2e6;
  padding-bottom: 8px;
  margin-bottom: 12px;
}
.doc-section-header h4 {
  margin: 0;
  color: #495057;
  font-size: 1rem;
}
</style>
