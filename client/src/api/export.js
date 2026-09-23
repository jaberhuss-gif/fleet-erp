// Export helpers
export function exportToCSV(data, filename, columns) {
  if (!data || data.length === 0) {
    alert('No data to export');
    return;
  }

  const headers = columns ? columns.map(c => c.label) : Object.keys(data[0]);
  const keys = columns ? columns.map(c => c.key) : Object.keys(data[0]);
  const rows = data.map(item =>
    keys.map(k => {
      let val = item[k];
      if (val === null || val === undefined) val = '';
      val = String(val).replace(/"/g, '""');
      if (val.includes(',') || val.includes('"') || val.includes('\\n')) {
        val = '"' + val + '"';
      }
      return val;
    }).join(',')
  );

  const csv = [headers.join(','), ...rows].join('\\n');
  const blob = new Blob(['\\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename + '_' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Export a real Excel workbook (.xlsx) in the browser.
// Kept separate from CSV so existing exports remain unchanged.
export async function exportToExcel(data, filename, columns, sheetName = 'Report') {
  if (!data || data.length === 0) {
    alert('No data to export');
    return;
  }

  const XLSX = await import('xlsx');
  const keys = columns ? columns.map(c => c.key) : Object.keys(data[0]);
  const headers = columns ? columns.map(c => c.label) : keys;
  const rows = data.map(item => {
    const row = {};
    keys.forEach((key, index) => {
      const value = item[key];
      row[headers[index]] = value === null || value === undefined ? '' : value;
    });
    return row;
  });

  const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });
  worksheet['!cols'] = headers.map(header => ({ wch: Math.max(14, String(header).length + 2) }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, String(sheetName).slice(0, 31));
  XLSX.writeFile(workbook, filename + '_' + new Date().toISOString().slice(0, 10) + '.xlsx');
}
