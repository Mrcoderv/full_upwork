// Shared export helpers for admin report views (CSV + PDF).
// CSV pattern follows the existing exportCSV() in CoursesStats.vue.
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Export tabular data as CSV.
 * @param {string} filename e.g. 'revenue-report.csv'
 * @param {string[]} headers column headers
 * @param {Array<Array<string|number>>} rows data rows
 */
export function exportToCSV(filename, headers, rows) {
  const escapeCell = (cell) => {
    const value = cell === null || cell === undefined ? '' : String(cell)
    if (/[",\n]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`
    }
    return value
  }

  const csv = [headers, ...rows].map((row) => row.map(escapeCell).join(',')).join('\n')
  downloadBlob(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }), filename)
}

/**
 * Export tabular data as a simple PDF table.
 * @param {string} filename e.g. 'revenue-report.pdf'
 * @param {string} title heading printed at the top of the document
 * @param {string[]} headers column headers
 * @param {Array<Array<string|number>>} rows data rows
 */
export function exportToPDF(filename, title, headers, rows) {
  const doc = new jsPDF()
  doc.setFontSize(14)
  doc.text(title, 14, 16)
  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: 22,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [63, 81, 181] },
  })
  doc.save(filename)
}
