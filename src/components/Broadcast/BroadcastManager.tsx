import React, { useState, useRef } from 'react';
import { 
  Send, 
  Upload, 
  Play, 
  Pause, 
  RotateCcw, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  FileSpreadsheet, 
  Download, 
  Plus,
  X,
  SlidersHorizontal,
  ChevronRight
} from 'lucide-react';
import { BroadcastCampaign, BroadcastRecipient, WhatsAppTemplate, WhatsAppCredentials } from '../../types/whatsapp';
import { WhatsAppApiService } from '../../services/whatsappApi';
import { waAudio } from '../../utils/audio';

interface BroadcastManagerProps {
  campaigns: BroadcastCampaign[];
  templates: WhatsAppTemplate[];
  credentials: WhatsAppCredentials;
  onSaveCampaign: (campaign: BroadcastCampaign) => void;
  onUpdateCampaign: (campaign: BroadcastCampaign) => void;
}

export const BroadcastManager: React.FC<BroadcastManagerProps> = ({
  campaigns,
  templates,
  credentials,
  onSaveCampaign,
  onUpdateCampaign
}) => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activeCampaign, setActiveCampaign] = useState<BroadcastCampaign | null>(null);

  // New Campaign Form State
  const [campaignTitle, setCampaignTitle] = useState('');
  const [campaignType, setCampaignType] = useState<'template' | 'custom'>('template');
  const [selectedTemplateName, setSelectedTemplateName] = useState<string>('');
  const [customBody, setCustomBody] = useState('');
  const [pastedNumbers, setPastedNumbers] = useState('');
  const [intervalMs, setIntervalMs] = useState(800);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);

  // Execution worker state
  const isRunningRef = useRef(false);
  const [isRunning, setIsRunning] = useState(false);

  // Parse CSV or pasted numbers
  const parseRecipients = (): BroadcastRecipient[] => {
    const lines = pastedNumbers
      .split(/[\n,;]+/)
      .map((l) => l.trim())
      .filter(Boolean);

    return lines.map((line, idx) => {
      // Check if format is "phone, name" or "name, phone"
      const parts = line.split(/[\t|]/).map((p) => p.trim());
      let phone = parts[0];
      let name = parts[1] || `Customer ${idx + 1}`;

      // If first part has letters and second part is digits, swap
      if (/[a-zA-Z]/.test(phone) && /^[0-9+() -]+$/.test(name)) {
        const temp = phone;
        phone = name;
        name = temp;
      }

      const cleanPhone = phone.replace(/[^0-9+]/g, '');

      return {
        phone: cleanPhone || phone,
        name,
        variables: {
          '1': name,
          '2': `ORD-${1000 + idx}`
        },
        status: 'pending'
      };
    });
  };

  // CSV file uploader handler
  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
      
      // If header line exists, skip or parse
      const dataLines = lines.slice(lines[0].toLowerCase().includes('phone') ? 1 : 0);
      setPastedNumbers(dataLines.join('\n'));
    };
    reader.readAsText(file);
  };

  // Create Campaign
  const handleCreateCampaign = (e: React.FormEvent) => {
    e.preventDefault();
    const recipients = parseRecipients();

    if (recipients.length === 0) {
      alert('Please enter at least one phone number.');
      return;
    }

    const newCampaign: BroadcastCampaign = {
      id: `camp_${Date.now()}`,
      title: campaignTitle || `Broadcast ${new Date().toLocaleDateString()}`,
      type: campaignType,
      templateName: campaignType === 'template' ? selectedTemplateName : undefined,
      customText: campaignType === 'custom' ? customBody : undefined,
      recipients,
      totalRecipients: recipients.length,
      sentCount: 0,
      deliveredCount: 0,
      failedCount: 0,
      status: 'draft',
      createdAt: Date.now(),
      intervalMs
    };

    onSaveCampaign(newCampaign);
    setActiveCampaign(newCampaign);
    setShowCreateModal(false);

    // Reset fields
    setCampaignTitle('');
    setPastedNumbers('');
    setCustomBody('');
    setCsvFileName(null);
  };

  // Execute sequential broadcast worker
  const startBroadcast = async (campaign: BroadcastCampaign) => {
    if (isRunningRef.current) return;
    isRunningRef.current = true;
    setIsRunning(true);

    const updated = { ...campaign, status: 'running' as const };
    setActiveCampaign(updated);
    onUpdateCampaign(updated);

    const recipients = [...updated.recipients];
    let sent = updated.sentCount;
    let failed = updated.failedCount;

    for (let i = 0; i < recipients.length; i++) {
      if (!isRunningRef.current) break; // paused or stopped

      const r = recipients[i];
      if (r.status === 'sent' || r.status === 'delivered') continue;

      // Rate limit delay between dispatches
      await new Promise((res) => setTimeout(res, updated.intervalMs || 800));

      if (!isRunningRef.current) break;

      try {
        if (credentials.isConnected && credentials.phoneNumberId && credentials.accessToken) {
          // Real Meta Cloud API call
          const res = await WhatsAppApiService.sendMessage({
            credentials,
            to: r.phone,
            type: updated.type === 'template' ? 'template' : 'text',
            text: updated.type === 'custom' 
              ? updated.customText?.replace(/\{\{name\}\}/gi, r.name).replace(/\{\{1\}\}/g, r.name)
              : undefined,
            template: updated.type === 'template' && updated.templateName
              ? {
                  name: updated.templateName,
                  language: 'en_US',
                  parameters: [{ type: 'text', text: r.name }]
                }
              : undefined
          });

          if (res.success) {
            r.status = 'sent';
            r.sentAt = Date.now();
            sent++;
            waAudio.playSent();
          } else {
            r.status = 'failed';
            r.error = res.error || 'Meta API rejected message';
            failed++;
          }
        } else {
          // Simulated dispatch for preview
          r.status = 'sent';
          r.sentAt = Date.now();
          sent++;
          waAudio.playSent();
        }
      } catch (err: any) {
        r.status = 'failed';
        r.error = err?.message || 'Dispatch failure';
        failed++;
      }

      // Update state and progress
      const currentProgress: BroadcastCampaign = {
        ...updated,
        recipients: [...recipients],
        sentCount: sent,
        failedCount: failed,
        status: isRunningRef.current ? 'running' : 'paused'
      };
      setActiveCampaign(currentProgress);
      onUpdateCampaign(currentProgress);
    }

    const finalStatus: BroadcastCampaign = {
      ...updated,
      recipients: [...recipients],
      sentCount: sent,
      failedCount: failed,
      status: recipients.every((r) => r.status === 'sent' || r.status === 'failed') ? 'completed' : 'paused',
      completedAt: Date.now()
    };

    isRunningRef.current = false;
    setIsRunning(false);
    setActiveCampaign(finalStatus);
    onUpdateCampaign(finalStatus);
    waAudio.vibrate([30, 40, 30]);
  };

  const pauseBroadcast = () => {
    isRunningRef.current = false;
    setIsRunning(false);
    if (activeCampaign) {
      const paused = { ...activeCampaign, status: 'paused' as const };
      setActiveCampaign(paused);
      onUpdateCampaign(paused);
    }
  };

  // Export campaign CSV report
  const exportReport = (campaign: BroadcastCampaign) => {
    const headers = 'Phone,Name,Status,SentAt,Error\n';
    const rows = campaign.recipients
      .map(
        (r) =>
          `"${r.phone}","${r.name}","${r.status}","${r.sentAt ? new Date(r.sentAt).toISOString() : ''}","${r.error || ''}"`
      )
      .join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${campaign.title.replace(/\s+/g, '_')}_Report.csv`;
    a.click();
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-[#111B21] transition-colors select-none p-3 pb-24 overflow-y-auto">
      {/* Top Header Card */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            WhatsApp Bulk Broadcast
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Dispatch personalized messages & templates with safe rate-limiting
          </p>
        </div>
        <button
          onClick={() => {
            if (templates.length > 0 && !selectedTemplateName) {
              setSelectedTemplateName(templates[0].name);
            }
            setShowCreateModal(true);
          }}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#008069] dark:bg-[#25D366] text-white text-xs font-semibold shadow-sm hover:opacity-95 active:scale-95 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>New Campaign</span>
        </button>
      </div>

      {/* Active Campaign Runner View */}
      {activeCampaign ? (
        <div className="mt-4 bg-white dark:bg-[#1F2C34] rounded-2xl p-4 shadow-sm border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  {activeCampaign.title}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    activeCampaign.status === 'running'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      : activeCampaign.status === 'completed'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {activeCampaign.status}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {activeCampaign.type === 'template'
                  ? `Template: ${activeCampaign.templateName}`
                  : 'Custom Text Campaign'}
              </p>
            </div>

            {/* Campaign Actions */}
            <div className="flex items-center gap-2">
              {activeCampaign.status === 'running' ? (
                <button
                  onClick={pauseBroadcast}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-500 text-white hover:bg-amber-600 shadow-xs"
                >
                  <Pause className="w-3.5 h-3.5" />
                  <span>Pause</span>
                </button>
              ) : activeCampaign.status !== 'completed' ? (
                <button
                  onClick={() => startBroadcast(activeCampaign)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#008069] dark:bg-[#25D366] text-white hover:opacity-95 shadow-xs"
                >
                  <Play className="w-3.5 h-3.5 fill-white" />
                  <span>Resume</span>
                </button>
              ) : null}

              <button
                onClick={() => exportReport(activeCampaign)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                title="Download CSV report"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">CSV Report</span>
              </button>
            </div>
          </div>

          {/* Progress Bar */}
          <div>
            <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 mb-1.5">
              <span>
                Progress: {activeCampaign.sentCount + activeCampaign.failedCount} /{' '}
                {activeCampaign.totalRecipients} processed
              </span>
              <span className="font-mono font-bold">
                {Math.round(
                  ((activeCampaign.sentCount + activeCampaign.failedCount) /
                    Math.max(1, activeCampaign.totalRecipients)) *
                    100
                )}
                %
              </span>
            </div>
            <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
              <div
                style={{
                  width: `${(activeCampaign.sentCount / Math.max(1, activeCampaign.totalRecipients)) * 100}%`
                }}
                className="h-full bg-[#25D366] transition-all duration-300"
              />
              <div
                style={{
                  width: `${(activeCampaign.failedCount / Math.max(1, activeCampaign.totalRecipients)) * 100}%`
                }}
                className="h-full bg-red-500 transition-all duration-300"
              />
            </div>
          </div>

          {/* Metric Stats Cards */}
          <div className="grid grid-cols-3 gap-2">
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 text-center">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Total</span>
              <span className="text-base font-bold font-mono text-slate-900 dark:text-white">
                {activeCampaign.totalRecipients}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40 text-center">
              <span className="text-[10px] text-emerald-600 uppercase tracking-wider block">Sent</span>
              <span className="text-base font-bold font-mono text-emerald-600 dark:text-emerald-400">
                {activeCampaign.sentCount}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 text-center">
              <span className="text-[10px] text-red-600 uppercase tracking-wider block">Failed</span>
              <span className="text-base font-bold font-mono text-red-600 dark:text-red-400">
                {activeCampaign.failedCount}
              </span>
            </div>
          </div>

          {/* Recipients Real-time Status Table */}
          <div className="max-h-64 overflow-y-auto border border-slate-100 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800">
            {activeCampaign.recipients.map((rec, index) => (
              <div
                key={index}
                className="flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/40"
              >
                <div>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                    {rec.name}
                  </span>
                  <span className="text-[11px] font-mono text-slate-500">{rec.phone}</span>
                </div>

                <div className="flex items-center gap-1.5">
                  {rec.status === 'sent' && (
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Sent</span>
                    </span>
                  )}
                  {rec.status === 'failed' && (
                    <span
                      title={rec.error}
                      className="flex items-center gap-1 text-red-600 dark:text-red-400 font-semibold text-[11px]"
                    >
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>Failed</span>
                    </span>
                  )}
                  {rec.status === 'pending' && (
                    <span className="flex items-center gap-1 text-slate-400 text-[11px]">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Pending</span>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Campaigns History */}
      <div className="mt-5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
          Campaign History ({campaigns.length})
        </h3>

        {campaigns.length === 0 ? (
          <div className="p-8 text-center bg-white dark:bg-[#1F2C34] rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
            <FileSpreadsheet className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              No broadcast campaigns yet
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Create your first broadcast to reach hundreds of WhatsApp contacts at once.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {campaigns.map((camp) => (
              <div
                key={camp.id}
                onClick={() => setActiveCampaign(camp)}
                className="flex items-center justify-between p-3.5 rounded-xl bg-white dark:bg-[#1F2C34] border border-slate-200 dark:border-slate-800 hover:border-[#008069] transition-all cursor-pointer"
              >
                <div>
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                    {camp.title}
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {camp.totalRecipients} recipients · {new Date(camp.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-semibold text-emerald-600">
                    {camp.sentCount} / {camp.totalRecipients}
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Campaign Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-3 animate-in fade-in">
          <div className="w-full max-w-md bg-white dark:bg-[#1F2C34] rounded-2xl p-5 shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold">
                <Send className="w-5 h-5 text-[#008069] dark:text-[#25D366]" />
                <span>Create WhatsApp Broadcast</span>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCampaign} className="space-y-4 pt-3 text-xs">
              {/* Campaign Title */}
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Campaign Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. VIP Spring Announcement"
                  value={campaignTitle}
                  onChange={(e) => setCampaignTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:border-[#008069]"
                />
              </div>

              {/* Message Type Toggle */}
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Message Format
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCampaignType('template')}
                    className={`py-2 px-3 rounded-xl font-medium border text-center transition-all ${
                      campaignType === 'template'
                        ? 'border-[#008069] bg-emerald-50 dark:bg-emerald-950/40 text-[#008069] dark:text-[#25D366] font-bold'
                        : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Approved Meta Template
                  </button>
                  <button
                    type="button"
                    onClick={() => setCampaignType('custom')}
                    className={`py-2 px-3 rounded-xl font-medium border text-center transition-all ${
                      campaignType === 'custom'
                        ? 'border-[#008069] bg-emerald-50 dark:bg-emerald-950/40 text-[#008069] dark:text-[#25D366] font-bold'
                        : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Custom Text Message
                  </button>
                </div>
              </div>

              {/* Template Select */}
              {campaignType === 'template' ? (
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Select WhatsApp Template
                  </label>
                  {templates.length === 0 ? (
                    <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 rounded-xl text-amber-800 dark:text-amber-300">
                      No templates synced yet. Switch to the Templates tab to fetch your Meta templates.
                    </div>
                  ) : (
                    <select
                      value={selectedTemplateName}
                      onChange={(e) => setSelectedTemplateName(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                    >
                      {templates.map((t) => (
                        <option key={t.name} value={t.name}>
                          {t.name} ({t.category} - {t.status})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ) : (
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Custom Message Text (Use &#123;&#123;name&#125;&#125; for recipient name)
                  </label>
                  <textarea
                    rows={3}
                    required
                    placeholder="Hello {{name}}, we have an exciting update regarding your account..."
                    value={customBody}
                    onChange={(e) => setCustomBody(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>
              )}

              {/* Recipients Input (Paste or CSV) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">
                    Recipients (Numbers or CSV)
                  </label>
                  <label className="text-[#008069] dark:text-[#25D366] font-medium cursor-pointer hover:underline flex items-center gap-1">
                    <Upload className="w-3 h-3" />
                    <span>Upload CSV</span>
                    <input
                      type="file"
                      accept=".csv,.txt"
                      className="hidden"
                      onChange={handleCsvUpload}
                    />
                  </label>
                </div>

                {csvFileName && (
                  <div className="text-[11px] text-emerald-600 mb-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Loaded from {csvFileName}</span>
                  </div>
                )}

                <textarea
                  rows={4}
                  required
                  placeholder={`15551234567 | John Doe\n15559876543 | Sarah Smith\n+91 9876543210 | Alex`}
                  value={pastedNumbers}
                  onChange={(e) => setPastedNumbers(e.target.value)}
                  className="w-full font-mono text-[11px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                />
                <span className="text-[10.5px] text-slate-400 mt-0.5 block">
                  Format: Phone Number | Customer Name (one per line)
                </span>
              </div>

              {/* Rate Limit Throttle */}
              <div>
                <div className="flex items-center justify-between font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  <span>Dispatch Interval (Delay)</span>
                  <span className="font-mono text-[#008069] dark:text-[#25D366]">
                    {(intervalMs / 1000).toFixed(1)}s / message
                  </span>
                </div>
                <input
                  type="range"
                  min="300"
                  max="3000"
                  step="100"
                  value={intervalMs}
                  onChange={(e) => setIntervalMs(parseInt(e.target.value, 10))}
                  className="w-full accent-[#008069]"
                />
                <span className="text-[10px] text-slate-400">
                  Recommended: 800ms–1500ms to avoid Meta WhatsApp spam flags.
                </span>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 font-semibold rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 font-semibold rounded-xl bg-[#008069] dark:bg-[#25D366] text-white hover:opacity-95 shadow-sm"
                >
                  Save & Launch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
