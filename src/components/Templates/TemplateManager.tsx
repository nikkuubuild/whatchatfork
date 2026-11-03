import React, { useState } from 'react';
import { 
  FileCode, 
  RefreshCw, 
  Plus, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  ExternalLink, 
  Phone, 
  X,
  Eye,
  Sparkles
} from 'lucide-react';
import { WhatsAppTemplate, WhatsAppCredentials, TemplateComponent } from '../../types/whatsapp';
import { WhatsAppApiService } from '../../services/whatsappApi';

interface TemplateManagerProps {
  templates: WhatsAppTemplate[];
  credentials: WhatsAppCredentials;
  onSaveTemplates: (templates: WhatsAppTemplate[]) => void;
  onSelectTemplateForChat?: (template: WhatsAppTemplate) => void;
}

export const TemplateManager: React.FC<TemplateManagerProps> = ({
  templates,
  credentials,
  onSaveTemplates,
  onSelectTemplateForChat
}) => {
  const [selectedFilter, setSelectedFilter] = useState<'ALL' | 'UTILITY' | 'MARKETING' | 'AUTHENTICATION'>('ALL');
  const [selectedTemplate, setSelectedTemplate] = useState<WhatsAppTemplate | null>(templates[0] || null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  // Create Template Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [tplName, setTplName] = useState('');
  const [tplCategory, setTplCategory] = useState<'UTILITY' | 'MARKETING' | 'AUTHENTICATION'>('UTILITY');
  const [tplLanguage, setTplLanguage] = useState('en_US');
  const [headerType, setHeaderType] = useState<'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'>('NONE');
  const [headerText, setHeaderText] = useState('');
  const [bodyText, setBodyText] = useState('Hello {{1}}, your order #{{2}} has been confirmed!');
  const [footerText, setFooterText] = useState('Reply STOP to unsubscribe');
  const [buttonType, setButtonType] = useState<'NONE' | 'QUICK_REPLY' | 'URL'>('QUICK_REPLY');
  const [buttonText, setButtonText] = useState('Confirm Order');
  const [buttonUrl, setButtonUrl] = useState('https://example.com/order/{{1}}');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync templates from Meta Cloud API
  const handleSyncFromMeta = async () => {
    if (!credentials.isConnected || !credentials.wabaId || !credentials.accessToken) {
      alert('Please connect your Meta WABA ID and Access Token in the Settings tab first.');
      return;
    }

    setIsSyncing(true);
    setSyncStatus(null);
    try {
      const res = await WhatsAppApiService.fetchTemplates({
        wabaId: credentials.wabaId,
        accessToken: credentials.accessToken
      });

      if (res.success && res.templates) {
        onSaveTemplates(res.templates);
        if (res.templates.length > 0) {
          setSelectedTemplate(res.templates[0]);
        }
        setSyncStatus(`Successfully synced ${res.templates.length} templates from Meta.`);
      } else {
        setSyncStatus(res.error || 'Failed to fetch templates from Meta.');
      }
    } catch (err: any) {
      setSyncStatus(err?.message || 'Error communicating with Meta API');
    } finally {
      setIsSyncing(false);
    }
  };

  // Submit new template to Meta
  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tplName.trim()) return;

    // Validate name (lowercase and underscore only)
    const formattedName = tplName.toLowerCase().replace(/[^a-z0-9_]/g, '_');

    const components: TemplateComponent[] = [];

    if (headerType !== 'NONE') {
      components.push({
        type: 'HEADER',
        format: headerType,
        text: headerType === 'TEXT' ? headerText : undefined
      });
    }

    components.push({
      type: 'BODY',
      text: bodyText
    });

    if (footerText.trim()) {
      components.push({
        type: 'FOOTER',
        text: footerText
      });
    }

    if (buttonType === 'QUICK_REPLY') {
      components.push({
        type: 'BUTTONS',
        buttons: [{ type: 'QUICK_REPLY', text: buttonText || 'Quick Reply' }]
      });
    } else if (buttonType === 'URL') {
      components.push({
        type: 'BUTTONS',
        buttons: [{ type: 'URL', text: buttonText || 'Visit Website', url: buttonUrl }]
      });
    }

    const newTemplate: WhatsAppTemplate = {
      name: formattedName,
      category: tplCategory,
      language: tplLanguage,
      status: credentials.isConnected ? 'PENDING' : 'APPROVED',
      components
    };

    setIsSubmitting(true);
    try {
      if (credentials.isConnected && credentials.wabaId && credentials.accessToken) {
        const res = await WhatsAppApiService.createTemplate(credentials, {
          name: formattedName,
          category: tplCategory,
          language: tplLanguage,
          components
        });
        if (!res.success) {
          alert(`Meta rejected template: ${res.error}`);
        }
      }

      const updated = [newTemplate, ...templates];
      onSaveTemplates(updated);
      setSelectedTemplate(newTemplate);
      setShowCreateModal(false);
      setTplName('');
    } catch (err: any) {
      alert(`Submission error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredTemplates = templates.filter((t) => {
    if (selectedFilter === 'ALL') return true;
    return t.category === selectedFilter;
  });

  const getStatusBadge = (status: WhatsAppTemplate['status']) => {
    switch (status) {
      case 'APPROVED':
        return (
          <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full">
            <CheckCircle2 className="w-3 h-3" />
            <span>Approved</span>
          </span>
        );
      case 'PENDING':
        return (
          <span className="flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-full">
            <Clock className="w-3 h-3" />
            <span>In Review</span>
          </span>
        );
      case 'REJECTED':
        return (
          <span className="flex items-center gap-1 text-[11px] font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 px-2 py-0.5 rounded-full">
            <AlertCircle className="w-3 h-3" />
            <span>Rejected</span>
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-[#111B21] transition-colors select-none p-3 pb-24 overflow-y-auto">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Meta Message Templates
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Sync, create, and preview pre-approved WhatsApp Business templates
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSyncFromMeta}
            disabled={isSyncing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1F2C34] text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-2xs"
            title="Fetch approved templates from WhatsApp Business Account"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>Sync from Meta</span>
          </button>

          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#008069] dark:bg-[#25D366] text-white text-xs font-semibold shadow-sm hover:opacity-95 active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Create Template</span>
          </button>
        </div>
      </div>

      {syncStatus && (
        <div className="mt-3 p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
          <span>{syncStatus}</span>
          <button onClick={() => setSyncStatus(null)} className="font-bold">×</button>
        </div>
      )}

      {/* Category Segmented Tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-200/60 dark:bg-slate-800/60 rounded-xl my-3 w-fit">
        {(['ALL', 'UTILITY', 'MARKETING', 'AUTHENTICATION'] as const).map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedFilter(cat)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              selectedFilter === cat
                ? 'bg-white dark:bg-[#1F2C34] text-slate-900 dark:text-white shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Main Grid: Template List + WhatsApp Live Preview Bubble */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Templates List */}
        <div className="lg:col-span-7 space-y-2">
          {filteredTemplates.length === 0 ? (
            <div className="p-8 text-center bg-white dark:bg-[#1F2C34] rounded-2xl border border-slate-200 dark:border-slate-800">
              <FileCode className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                No templates in this category
              </p>
            </div>
          ) : (
            filteredTemplates.map((tpl) => {
              const isSelected = selectedTemplate?.name === tpl.name;
              const body = tpl.components.find((c) => c.type === 'BODY')?.text;
              return (
                <div
                  key={tpl.name}
                  onClick={() => setSelectedTemplate(tpl)}
                  className={`p-3.5 rounded-xl bg-white dark:bg-[#1F2C34] border transition-all cursor-pointer ${
                    isSelected
                      ? 'border-[#008069] ring-2 ring-[#008069]/20 shadow-sm'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-slate-900 dark:text-white truncate">
                      {tpl.name}
                    </span>
                    {getStatusBadge(tpl.status)}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 line-clamp-2">
                    {body}
                  </p>
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[10.5px] text-slate-400">
                    <span>{tpl.category}</span>
                    <span>·</span>
                    <span>{tpl.language}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Live WhatsApp Bubble Preview Container */}
        <div className="lg:col-span-5">
          <div className="sticky top-20 bg-white dark:bg-[#1F2C34] rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 mb-3">
              <Eye className="w-4 h-4 text-[#008069]" />
              <span>WhatsApp Native Bubble Preview</span>
            </div>

            {selectedTemplate ? (
              <div className="p-4 rounded-2xl whatsapp-chat-bg-light dark:whatsapp-chat-bg-dark border border-black/5">
                <div className="bg-white dark:bg-[#202C33] rounded-2xl rounded-tl-xs p-3.5 shadow-sm text-slate-900 dark:text-slate-100 max-w-[95%] space-y-2">
                  {/* Header */}
                  {selectedTemplate.components.find((c) => c.type === 'HEADER') && (
                    <div className="font-bold text-xs text-slate-900 dark:text-white border-b border-black/5 dark:border-white/5 pb-1">
                      {selectedTemplate.components.find((c) => c.type === 'HEADER')?.text ||
                        `[${selectedTemplate.components.find((c) => c.type === 'HEADER')?.format} HEADER]`}
                    </div>
                  )}

                  {/* Body */}
                  <div className="text-[14px] leading-relaxed break-words whitespace-pre-wrap select-text">
                    {selectedTemplate.components
                      .find((c) => c.type === 'BODY')
                      ?.text?.replace(/\{\{1\}\}/g, 'Alexander')
                      ?.replace(/\{\{2\}\}/g, '#98402')
                      ?.replace(/\{\{3\}\}/g, 'Tomorrow at 10:00 AM')}
                  </div>

                  {/* Footer */}
                  {selectedTemplate.components.find((c) => c.type === 'FOOTER') && (
                    <div className="text-[11px] text-slate-400 pt-1">
                      {selectedTemplate.components.find((c) => c.type === 'FOOTER')?.text}
                    </div>
                  )}

                  {/* Timestamp & checks */}
                  <div className="text-[10px] text-right text-slate-400">
                    12:00 PM
                  </div>

                  {/* Buttons */}
                  {selectedTemplate.components.find((c) => c.type === 'BUTTONS')?.buttons?.map((btn, i) => (
                    <div
                      key={i}
                      className="w-full py-2 text-center text-xs font-semibold text-[#008069] dark:text-[#25D366] bg-slate-50 dark:bg-white/5 rounded-xl border border-black/5 flex items-center justify-center gap-1.5"
                    >
                      {btn.type === 'URL' ? <ExternalLink className="w-3.5 h-3.5" /> : null}
                      <span>{btn.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-xs text-slate-400">
                Select a template to view authentic WhatsApp preview
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Template Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-3 animate-in fade-in">
          <div className="w-full max-w-lg bg-white dark:bg-[#1F2C34] rounded-2xl p-5 shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold">
                <FileCode className="w-5 h-5 text-[#008069] dark:text-[#25D366]" />
                <span>Create Meta WhatsApp Template</span>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTemplate} className="space-y-4 pt-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Template Name (lowercase & underscores only)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. shipping_update_express"
                  value={tplName}
                  onChange={(e) => setTplName(e.target.value.toLowerCase().replace(/\s+/g, '_'))}
                  className="w-full font-mono px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:border-[#008069]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Category
                  </label>
                  <select
                    value={tplCategory}
                    onChange={(e) => setTplCategory(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                  >
                    <option value="UTILITY">UTILITY (Transactional / Alerts)</option>
                    <option value="MARKETING">MARKETING (Offers / Announcements)</option>
                    <option value="AUTHENTICATION">AUTHENTICATION (OTPs)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Language
                  </label>
                  <select
                    value={tplLanguage}
                    onChange={(e) => setTplLanguage(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                  >
                    <option value="en_US">English (US)</option>
                    <option value="es_ES">Spanish (Spain)</option>
                    <option value="pt_BR">Portuguese (Brazil)</option>
                    <option value="hi_IN">Hindi (India)</option>
                  </select>
                </div>
              </div>

              {/* Header */}
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Header (Optional)
                </label>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  {(['NONE', 'TEXT', 'IMAGE'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setHeaderType(t)}
                      className={`py-1.5 text-center rounded-lg border font-medium ${
                        headerType === t
                          ? 'border-[#008069] bg-emerald-50 dark:bg-emerald-950/40 text-[#008069] dark:text-[#25D366] font-bold'
                          : 'border-slate-200 dark:border-slate-800 text-slate-600'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                {headerType === 'TEXT' && (
                  <input
                    type="text"
                    placeholder="e.g. Order Delivery Confirmation"
                    value={headerText}
                    onChange={(e) => setHeaderText(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                )}
              </div>

              {/* Body */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">
                    Body Text
                  </label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setBodyText((prev) => prev + ' {{1}}')}
                      className="px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 text-[10px] font-mono hover:bg-slate-300"
                    >
                      + {'{{1}}'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setBodyText((prev) => prev + ' {{2}}')}
                      className="px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 text-[10px] font-mono hover:bg-slate-300"
                    >
                      + {'{{2}}'}
                    </button>
                  </div>
                </div>
                <textarea
                  rows={4}
                  required
                  value={bodyText}
                  onChange={(e) => setBodyText(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>

              {/* Footer */}
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Footer (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Powered by WhatsCloud"
                  value={footerText}
                  onChange={(e) => setFooterText(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>

              {/* Buttons */}
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Interactive Button
                </label>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  {(['NONE', 'QUICK_REPLY', 'URL'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setButtonType(t)}
                      className={`py-1.5 text-center rounded-lg border font-medium ${
                        buttonType === t
                          ? 'border-[#008069] bg-emerald-50 dark:bg-emerald-950/40 text-[#008069] dark:text-[#25D366] font-bold'
                          : 'border-slate-200 dark:border-slate-800 text-slate-600'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                {buttonType !== 'NONE' && (
                  <div className="space-y-2">
                    <input
                      type="text"
                      placeholder="Button Label (e.g. Track Order)"
                      value={buttonText}
                      onChange={(e) => setButtonText(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                    />
                    {buttonType === 'URL' && (
                      <input
                        type="url"
                        placeholder="https://example.com/order"
                        value={buttonUrl}
                        onChange={(e) => setButtonUrl(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                      />
                    )}
                  </div>
                )}
              </div>

              {/* Submit */}
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
                  disabled={isSubmitting}
                  className="px-5 py-2 font-semibold rounded-xl bg-[#008069] dark:bg-[#25D366] text-white hover:opacity-95 shadow-sm"
                >
                  {isSubmitting ? 'Submitting to Meta...' : 'Submit to Meta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
