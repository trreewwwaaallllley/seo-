import React, { useEffect, useState } from 'react';
import { FileCode2, FileSpreadsheet, FileText, Table } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import {
  exportAuditCsv,
  exportAuditHtml,
  exportAuditPdf,
  exportAuditXlsx,
  exportKeywordsCsv,
  exportKeywordsXlsx,
} from '../../lib/exporters';
import { AuditReportRow, KeywordRow } from '../../types/seo';

export const ExportReportsView: React.FC = () => {
  const [audits, setAudits] = useState<AuditReportRow[]>([]);
  const [keywords, setKeywords] = useState<KeywordRow[]>([]);
  const [selectedAuditId, setSelectedAuditId] = useState<number | ''>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [aRes, kRes] = await Promise.all([
          apiFetch('/api/audits'),
          apiFetch('/api/keywords'),
        ]);
        const list: AuditReportRow[] = aRes.audits || [];
        setAudits(list);
        setKeywords(kRes.keywords || []);
        if (list.length > 0) setSelectedAuditId(list[0].id);
      } catch (err: any) {
        setError(err.message);
      }
    };
    load();
  }, []);

  const selectedAudit = audits.find((a) => a.id === Number(selectedAuditId));

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="border-b border-[#E6E0D6] pb-5">
        <h1 className="font-display text-3xl font-bold text-[#1D221F]">
          Analytics &amp; SEO Report Exports
        </h1>
        <p className="mt-1 text-xs text-[#5C635E]">
          Download formatted PDF, Excel (.xlsx), CSV, and standalone HTML executive reports for TreeWalley leadership.
        </p>
      </div>

      {error && (
        <div className="p-3.5 rounded-md border border-[#DC2626]/30 bg-[#FEF2F2] text-[#991B1B] text-xs">
          {error}
        </div>
      )}

      {/* Monthly SEO Audit Exports */}
      <div className="bg-white border border-[#E6E0D6] rounded-lg p-6 space-y-4">
        <h2 className="font-display text-xl font-bold text-[#1D221F]">
          Monthly SEO Audit Report Export
        </h2>

        <div className="text-xs">
          <label className="block font-medium text-[#5C635E] mb-1">
            Select Monthly Audit Report
          </label>
          <select
            value={selectedAuditId}
            onChange={(e) => setSelectedAuditId(Number(e.target.value))}
            className="w-full max-w-md px-3 py-2 rounded-md border border-[#E6E0D6]"
          >
            {audits.length === 0 && <option value="">No audit reports generated yet</option>}
            {audits.map((a) => (
              <option key={a.id} value={a.id}>
                {a.reportMonth} ({a.comparisonWindow}) — {new Date(a.generatedAt).toLocaleString()}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 text-xs">
          <button
            type="button"
            disabled={!selectedAudit}
            onClick={() => selectedAudit && exportAuditPdf(selectedAudit)}
            className="p-4 border border-[#E6E0D6] rounded-md hover:border-[#1B4332] hover:bg-[#FAF8F4] disabled:opacity-40 text-left space-y-1.5 cursor-pointer"
          >
            <FileText className="w-5 h-5 text-[#1B4332]" />
            <div className="font-semibold text-[#1D221F]">Export PDF</div>
            <div className="text-[11px] text-[#5C635E]">Formatted executive summary &amp; tables</div>
          </button>

          <button
            type="button"
            disabled={!selectedAudit}
            onClick={() => selectedAudit && exportAuditXlsx(selectedAudit)}
            className="p-4 border border-[#E6E0D6] rounded-md hover:border-[#1B4332] hover:bg-[#FAF8F4] disabled:opacity-40 text-left space-y-1.5 cursor-pointer"
          >
            <FileSpreadsheet className="w-5 h-5 text-[#16A34A]" />
            <div className="font-semibold text-[#1D221F]">Export Excel (.xlsx)</div>
            <div className="text-[11px] text-[#5C635E]">Multi-sheet workbook</div>
          </button>

          <button
            type="button"
            disabled={!selectedAudit}
            onClick={() => selectedAudit && exportAuditCsv(selectedAudit)}
            className="p-4 border border-[#E6E0D6] rounded-md hover:border-[#1B4332] hover:bg-[#FAF8F4] disabled:opacity-40 text-left space-y-1.5 cursor-pointer"
          >
            <Table className="w-5 h-5 text-[#6F4E37]" />
            <div className="font-semibold text-[#1D221F]">Export CSV</div>
            <div className="text-[11px] text-[#5C635E]">Raw structured comma-separated metrics</div>
          </button>

          <button
            type="button"
            disabled={!selectedAudit}
            onClick={() => selectedAudit && exportAuditHtml(selectedAudit)}
            className="p-4 border border-[#E6E0D6] rounded-md hover:border-[#1B4332] hover:bg-[#FAF8F4] disabled:opacity-40 text-left space-y-1.5 cursor-pointer"
          >
            <FileCode2 className="w-5 h-5 text-[#B68D40]" />
            <div className="font-semibold text-[#1D221F]">Export HTML</div>
            <div className="text-[11px] text-[#5C635E]">Standalone styled executive report</div>
          </button>
        </div>
      </div>

      {/* Keyword Intelligence Export */}
      <div className="bg-white border border-[#E6E0D6] rounded-lg p-6 space-y-4">
        <h2 className="font-display text-xl font-bold text-[#1D221F]">
          Keyword Research Database Export ({keywords.length} keywords)
        </h2>
        <div className="flex flex-wrap gap-3 text-xs">
          <button
            type="button"
            disabled={keywords.length === 0}
            onClick={() => exportKeywordsXlsx(keywords)}
            className="px-4 py-2.5 rounded-md bg-[#1B4332] text-[#FAF8F4] font-medium disabled:opacity-40 flex items-center gap-2 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Download Keywords Excel (.xlsx)</span>
          </button>
          <button
            type="button"
            disabled={keywords.length === 0}
            onClick={() => exportKeywordsCsv(keywords)}
            className="px-4 py-2.5 rounded-md border border-[#E6E0D6] hover:bg-[#FAF8F4] disabled:opacity-40 flex items-center gap-2 cursor-pointer"
          >
            <Table className="w-4 h-4" />
            <span>Download Keywords CSV</span>
          </button>
        </div>
      </div>
    </div>
  );
};
