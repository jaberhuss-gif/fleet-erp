// Export to CSV utility
export function exportToCSV(data, filename, columns) {
  if (!data || data.length === 0) {
    alert('No data to export');
    return;
  }
  
  // Build header
  const headers = columns ? columns.map(c => c.label) : Object.keys(data[0]);
  const keys = columns ? columns.map(c => c.key) : Object.keys(data[0]);
  
  // Build rows
  const rows = data.map(item => 
    keys.map(k => {
      let val = item[k];
      if (val === null || val === undefined) val = '';
      // Escape commas and quotes
      val = String(val).replace(/"/g, '""');
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        val = '"' + val + '"';
      }
      return val;
    }).join(',')
  );
  
  const csv = [headers.join(','), ...rows].join('\n');
  
  // Download
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename + '_' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
