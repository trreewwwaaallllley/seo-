import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AuditReportRow, KeywordRow } from '../types/seo';

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportKeywordsCsv(rows: KeywordRow[], filename = 'treewalley-keywords.csv') {
  const headers = [
    'Keyword',
    'Country',
    'Region',
    'Language',
    'List',
    'Ads Avg Monthly Searches',
    'Ads Competition',
    'Trends Interest',
    'GSC Clicks',
    'GSC Impressions',
    'GSC CTR (%)',
    'GSC Avg Position',
    'Commercial Intent',
    'Informational Intent',
    'Opportunity Score',
    'Data Sources',
    'Suggested Blog Topic',
  ];
  const csvRows = [
    headers.join(','),
    ...rows.map((r) =>
      [
        r.keyword,
        r.country,
        r.region || '',
        r.language,
        r.listName || '',
        r.adsAvgMonthlySearches ?? 'N/A',
        r.adsCompetitionLevel ?? 'N/A',
        r.trendsInterestScore ?? 'N/A',
        r.gscClicks ?? 'N/A',
        r.gscImpressions ?? 'N/A',
        r.gscCtr ?? 'N/A',
        r.gscAvgPosition ?? 'N/A',
        r.commercialIntent ?? '',
        r.informationalIntent ?? '',
        r.opportunityScore ?? '',
        r.dataSourceLabel,
        r.suggestedTopic ?? '',
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    ),
  ];
  downloadBlob(new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' }), filename);
}

export function exportKeywordsXlsx(rows: KeywordRow[], filename = 'treewalley-keywords.xlsx') {
  const worksheetData = rows.map((r) => ({
    Keyword: r.keyword,
    Country: r.country,
    Region: r.region || '',
    Language: r.language,
    List: r.listName || '',
    'Ads Monthly Searches': r.adsAvgMonthlySearches ?? 'Unavailable',
    'Ads Competition': r.adsCompetitionLevel ?? 'Unavailable',
    'Trends Interest': r.trendsInterestScore ?? 'Unavailable',
    'GSC Clicks': r.gscClicks ?? 'Unavailable',
    'GSC Impressions': r.gscImpressions ?? 'Unavailable',
    'GSC CTR (%)': r.gscCtr ?? 'Unavailable',
    'GSC Avg Position': r.gscAvgPosition ?? 'Unavailable',
    'Commercial Intent': r.commercialIntent || '',
    'Informational Intent': r.informationalIntent || '',
    'Opportunity Score': r.opportunityScore ?? 0,
    'Data Sources': r.dataSourceLabel,
    'Suggested Topic': r.suggestedTopic || '',
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(worksheetData);
  XLSX.utils.book_append_sheet(wb, ws, 'Keywords');
  XLSX.writeFile(wb, filename);
}

export function exportAuditPdf(report: AuditReportRow) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const sections = report.sectionsJson || {};

  doc.setFillColor(27, 67, 50);
  doc.rect(0, 0, 595, 86, 'F');
  doc.setTextColor(250, 248, 244);
  doc.setFontSize(20);
  doc.text('TreeWalley Furniture — Monthly SEO Audit Report', 40, 42);
  doc.setFontSize(10);
  doc.text(
    `Reporting Month: ${report.reportMonth}   |   Comparison: ${report.comparisonWindow}   |   Generated: ${new Date(
      report.generatedAt
    ).toLocaleDateString()}`,
    40,
    64
  );

  doc.setTextColor(29, 34, 31);
  doc.setFontSize(13);
  doc.text('1. Executive Summary', 40, 118);
  doc.setFontSize(10);
  const summaryLines = doc.splitTextToSize(report.executiveSummary, 515);
  doc.text(summaryLines, 40, 136);

  let yPos = 148 + summaryLines.length * 13;

  const org = typeof sections.organicPerformance === 'object' ? sections.organicPerformance : null;
  autoTable(doc, {
    startY: yPos,
    head: [['Metric', 'Value', 'Source Status']],
    body: [
      ['Total Organic Clicks', org ? String(org.clicks ?? 0) : 'Not Synced', org ? 'Google Search Console' : 'Connect GSC'],
      ['Total Impressions', org ? String(org.impressions ?? 0) : 'Not Synced', org ? 'Google Search Console' : 'Connect GSC'],
      ['Average CTR', org ? `${org.avgCtr ?? 0}%` : 'Not Synced', org ? 'Google Search Console' : 'Connect GSC'],
      ['Average Search Position', org ? String(org.avgPosition ?? 0) : 'Not Synced', org ? 'GSC Historical Avg' : 'Connect GSC'],
      ['Indexed URLs', String(sections.indexingStatus?.indexed ?? 0), 'URL Inspection API'],
      ['Not Indexed URLs', String(sections.indexingStatus?.notIndexed ?? 0), 'URL Inspection API'],
      ['Broken Internal Links', String((sections.brokenLinkAudit || []).length), 'HTTP Link Verifier'],
      ['Unoptimized Images', String(sections.imageOptimizationAudit?.missingAltCount ?? 0), 'Media Library Audit'],
    ],
    headStyles: { fillColor: [27, 67, 50] },
    styles: { fontSize: 9 },
  });

  const nextPlan = (sections.nextMonthContentPlan || []) as Array<any>;
  if (nextPlan.length > 0) {
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 24,
      head: [['Priority', 'Recommended Blog Title', 'Target Keyword', 'Category']],
      body: nextPlan.map((p) => [p.priority || 'High', p.title, p.targetKeyword, p.category]),
      headStyles: { fillColor: [111, 78, 55] },
      styles: { fontSize: 9 },
    });
  }

  doc.save(`treewalley-seo-audit-${report.reportMonth}.pdf`);
}

export function exportAuditXlsx(report: AuditReportRow) {
  const sections = report.sectionsJson || {};
  const wb = XLSX.utils.book_new();

  const summaryRows = [
    { Field: 'Report Month', Value: report.reportMonth },
    { Field: 'Comparison Window', Value: report.comparisonWindow },
    { Field: 'Generated At', Value: report.generatedAt },
    { Field: 'Executive Summary', Value: report.executiveSummary },
    { Field: 'Average CTR (%)', Value: sections.averageCtr ?? 'Unavailable' },
    { Field: 'Average Position', Value: sections.averagePosition ?? 'Unavailable' },
    { Field: 'Indexed URLs', Value: sections.indexingStatus?.indexed ?? 0 },
    { Field: 'Not Indexed URLs', Value: sections.indexingStatus?.notIndexed ?? 0 },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Executive Summary');

  if (Array.isArray(sections.keywordPerformance) && sections.keywordPerformance.length > 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sections.keywordPerformance), 'Keyword Performance');
  }
  if (Array.isArray(sections.nextMonthContentPlan) && sections.nextMonthContentPlan.length > 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sections.nextMonthContentPlan), 'Next Month Plan');
  }
  if (Array.isArray(sections.recommendedImprovements) && sections.recommendedImprovements.length > 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sections.recommendedImprovements), 'Improvements');
  }
  XLSX.writeFile(wb, `treewalley-seo-audit-${report.reportMonth}.xlsx`);
}

export function exportAuditCsv(report: AuditReportRow) {
  const sections = report.sectionsJson || {};
  const lines = [
    ['Section', 'Detail', 'Value'].join(','),
    ['Report Month', 'Period', report.reportMonth].map((v) => `"${v}"`).join(','),
    ['Executive Summary', 'Overview', report.executiveSummary.replace(/"/g, '""')].map((v) => `"${v}"`).join(','),
    ['Indexing', 'Indexed URLs', String(sections.indexingStatus?.indexed ?? 0)].join(','),
    ['Indexing', 'Not Indexed URLs', String(sections.indexingStatus?.notIndexed ?? 0)].join(','),
    ['Links', 'Broken Links', String((sections.brokenLinkAudit || []).length)].join(','),
    ['Images', 'Missing Alt / Unoptimized', String(sections.imageOptimizationAudit?.missingAltCount ?? 0)].join(','),
  ];
  downloadBlob(
    new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' }),
    `treewalley-seo-audit-${report.reportMonth}.csv`
  );
}

export function exportAuditHtml(report: AuditReportRow) {
  const s = report.sectionsJson || {};
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>TreeWalley Monthly SEO Audit — ${report.reportMonth}</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 960px; margin: 40px auto; padding: 0 24px; color: #1D221F; background: #FAF8F4; }
  header { background: #1B4332; color: #FAF8F4; padding: 28px 32px; border-radius: 8px; }
  h1 { margin: 0 0 6px; font-size: 26px; }
  section { background: #FFF; border: 1px solid #E6E0D6; border-radius: 8px; padding: 20px 24px; margin-top: 20px; }
  h2 { margin-top: 0; color: #1B4332; font-size: 18px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { border-bottom: 1px solid #E6E0D6; text-align: left; padding: 8px 10px; }
  th { color: #5C635E; font-weight: 600; }
</style>
</head>
<body>
  <header>
    <h1>TreeWalley Furniture — Monthly SEO Audit</h1>
    <div>Month: ${report.reportMonth} &middot; Window: ${report.comparisonWindow} &middot; Generated: ${new Date(report.generatedAt).toLocaleString()}</div>
  </header>
  <section>
    <h2>Executive Summary</h2>
    <p>${report.executiveSummary}</p>
  </section>
  <section>
    <h2>Organic Performance &amp; Indexing</h2>
    <pre style="white-space:pre-wrap;font-size:13px;">${JSON.stringify({ organicPerformance: s.organicPerformance, indexingStatus: s.indexingStatus, imageOptimizationAudit: s.imageOptimizationAudit }, null, 2)}</pre>
  </section>
  <section>
    <h2>Next Month's Content Plan</h2>
    <table>
      <thead><tr><th>Priority</th><th>Title</th><th>Keyword</th><th>Category</th></tr></thead>
      <tbody>${(s.nextMonthContentPlan || []).map((p: any) => `<tr><td>${p.priority}</td><td>${p.title}</td><td>${p.targetKeyword}</td><td>${p.category}</td></tr>`).join('')}</tbody>
    </table>
  </section>
</body>
</html>`;
  downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8;' }), `treewalley-seo-audit-${report.reportMonth}.html`);
}
