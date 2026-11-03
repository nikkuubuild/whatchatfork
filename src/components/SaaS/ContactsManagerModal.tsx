import React, { useState, useEffect } from 'react';
import {
  X,
  Users,
  Search,
  Plus,
  Upload,
  Tag,
  Phone,
  Mail,
  Trash2,
  MessageSquare,
  Check,
  AlertCircle,
  FileSpreadsheet
} from 'lucide-react';

interface ContactsManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  token?: string;
  onStartChat?: (phoneNumber: string, name?: string) => void;
}

export const ContactsManagerModal: React.FC<ContactsManagerModalProps> = ({
  isOpen,
  onClose,
  token,
  onStartChat
}) => {
  const [contacts, setContacts] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'add' | 'import'>('list');

  // Single contact form
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [notes, setNotes] = useState('');

  // Bulk CSV form
  const [csvText, setCsvText] = useState('');
  const [importStatus, setImportStatus] = useState<string | null>(null);

  const authHeader: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const fetchContacts = async () => {
    setIsLoading(true);
    try {
      let url = '/api/contacts';
      const params = new URLSearchParams();
      if (searchQuery) params.append('q', searchQuery);
      if (selectedTag && selectedTag !== 'all') params.append('tag', selectedTag);
      if (params.toString()) url += `?${params.toString()}`;

      const res = await fetch(url, { headers: authHeader as any });
      const data = await res.json();
      if (data.success && data.contacts) {
        setContacts(data.contacts);
      }
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchContacts();
    }
  }, [isOpen, searchQuery, selectedTag]);

  if (!isOpen) return null;

  // Extract all distinct tags for filter pills
  const allTags = Array.from(
    new Set(
      contacts.flatMap((c) => {
        try {
          const parsed = JSON.parse(c.tags || '[]');
          return Array.isArray(parsed) ? parsed : [c.tags];
        } catch {
          return c.tags ? [c.tags] : [];
        }
      })
    )
  ).filter(Boolean);

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone) return;

    const tagsArray = tagsInput
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({
          phone,
          name,
          email,
          tags: tagsArray,
          notes
        })
      });
      const data = await res.json();
      if (data.success) {
        setName('');
        setPhone('');
        setEmail('');
        setTagsInput('');
        setNotes('');
        setViewMode('list');
        fetchContacts();
      } else {
        alert(data.error || 'Failed to add contact');
      }
    } catch {
      alert('Network error adding contact');
    }
  };

  const handleImportCsv = async () => {
    if (!csvText.trim()) return;
    setImportStatus('Processing CSV...');

    const lines = csvText.trim().split('\n');
    const parsedContacts: any[] = [];

    lines.forEach((line) => {
      const parts = line.split(',').map((p) => p.trim());
      if (parts.length > 0 && parts[0]) {
        // format: phone, name, email, tags
        parsedContacts.push({
          phone: parts[0],
          name: parts[1] || parts[0],
          email: parts[2] || '',
          tags: parts[3] ? [parts[3].toLowerCase()] : ['imported']
        });
      }
    });

    try {
      const res = await fetch('/api/contacts/import-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({ contacts: parsedContacts })
      });
      const data = await res.json();
      if (data.success) {
        setImportStatus(`Successfully imported ${data.count} contacts.`);
        setCsvText('');
        fetchContacts();
        setTimeout(() => {
          setViewMode('list');
          setImportStatus(null);
        }, 1200);
      } else {
        setImportStatus(data.error || 'Failed to import CSV');
      }
    } catch {
      setImportStatus('Error importing CSV contacts');
    }
  };

  const handleDeleteContact = async (id: string) => {
    if (!confirm('Are you sure you want to delete this contact?')) return;
    try {
      await fetch(`/api/contacts/${id}`, { method: 'DELETE', headers: authHeader as any });
      setContacts((prev) => prev.filter((c) => c.id !== id));
    } catch {
      alert('Failed to delete contact');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200 font-sans">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-4xl max-h-[96vh] sm:max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-500/10 text-teal-400 flex items-center justify-center border border-teal-500/20 shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <span>CRM Contacts</span>
                <span className="text-[10px] bg-teal-500/20 text-teal-400 font-bold px-2 py-0.5 rounded-full">
                  {contacts.length}
                </span>
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-400">
                Manage your customer database, tags, CSV lists, and start conversations.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Bar */}
        <div className="p-4 bg-slate-950/40 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search by name, phone, or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-teal-500 w-64"
              />
            </div>

            {/* Tag Filter */}
            <select
              value={selectedTag}
              onChange={(e) => setSelectedTag(e.target.value)}
              className="py-2 px-3 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none"
            >
              <option value="all">All Tags</option>
              {allTags.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode('add')}
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${
                viewMode === 'add'
                  ? 'bg-teal-500 text-slate-950'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
              }`}
            >
              <Plus className="w-4 h-4" />
              <span>Add Contact</span>
            </button>
            <button
              onClick={() => setViewMode('import')}
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${
                viewMode === 'import'
                  ? 'bg-teal-500 text-slate-950'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
              }`}
            >
              <Upload className="w-4 h-4" />
              <span>Bulk CSV Import</span>
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {viewMode === 'add' && (
            <form onSubmit={handleAddContact} className="max-w-xl mx-auto space-y-4 bg-slate-950/60 p-6 rounded-2xl border border-slate-800">
              <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                <h3 className="text-sm font-bold text-white">Create New Customer Contact</h3>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">WhatsApp Phone Number *</label>
                  <input
                    type="text"
                    required
                    placeholder="+91 98200 12345"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Contact Name</label>
                  <input
                    type="text"
                    placeholder="Sunil Verma"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Email Address</label>
                  <input
                    type="email"
                    placeholder="sunil@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Tags (Comma-separated)</label>
                  <input
                    type="text"
                    placeholder="vip, enterprise, delhi"
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Notes</label>
                  <textarea
                    rows={2}
                    placeholder="Customer requirements or history..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold rounded-xl text-xs transition-colors mt-2"
                >
                  Save Contact
                </button>
              </div>
            </form>
          )}

          {viewMode === 'import' && (
            <div className="max-w-2xl mx-auto space-y-4 bg-slate-950/60 p-6 rounded-2xl border border-slate-800 text-xs">
              <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-white">Bulk CSV Contacts Import</h3>
                  <p className="text-slate-400">Paste raw CSV data or numbers to batch import contacts.</p>
                </div>
                <button
                  onClick={() => setViewMode('list')}
                  className="text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
              </div>

              {importStatus && (
                <div className="p-3 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-400 font-semibold">
                  {importStatus}
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-slate-300 font-semibold">
                  CSV Data Format: <span className="text-teal-400 font-mono">phone, name, email, tag</span>
                </label>
                <textarea
                  rows={8}
                  placeholder={`919820011111, Rajesh Kumar, rajesh@gmail.com, lead\n919820022222, Priya Sharma, priya@corp.in, vip\n919820033333, Amit Singh, amit@startup.com, campaign`}
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  className="w-full p-3 bg-slate-900 border border-slate-700 rounded-xl text-white font-mono text-xs focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>

              <button
                onClick={handleImportCsv}
                className="w-full py-2.5 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold rounded-xl transition-colors"
              >
                Import Contacts into Database
              </button>
            </div>
          )}

          {viewMode === 'list' && (
            contacts.length === 0 ? (
              <div className="p-12 text-center text-slate-500 bg-slate-950/30 rounded-2xl border border-slate-800">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-xs">No contacts found matching your criteria. Add one or import a CSV list.</p>
              </div>
            ) : (
              <div className="border border-slate-800 rounded-2xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                    <tr>
                      <th className="p-3.5">Contact Name</th>
                      <th className="p-3.5">Phone Number</th>
                      <th className="p-3.5">Email</th>
                      <th className="p-3.5">Tags</th>
                      <th className="p-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300">
                    {contacts.map((c) => {
                      let tagsList: string[] = [];
                      try {
                        const parsed = JSON.parse(c.tags || '[]');
                        tagsList = Array.isArray(parsed) ? parsed : [c.tags];
                      } catch {
                        if (c.tags) tagsList = [c.tags];
                      }

                      return (
                        <tr key={c.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="p-3.5 font-bold text-white">{c.name || 'Unknown'}</td>
                          <td className="p-3.5 font-mono text-teal-400">+{c.phone}</td>
                          <td className="p-3.5 text-slate-400">{c.email || '—'}</td>
                          <td className="p-3.5">
                            <div className="flex flex-wrap gap-1">
                              {tagsList.map((tag, idx) => (
                                <span
                                  key={idx}
                                  className="px-2 py-0.5 rounded-md bg-teal-500/10 text-teal-400 border border-teal-500/20 text-[10px] font-semibold"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="p-3.5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {onStartChat && (
                                <button
                                  onClick={() => {
                                    onStartChat(c.phone, c.name);
                                    onClose();
                                  }}
                                  className="p-1.5 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 rounded-lg transition-colors"
                                  title="Open WhatsApp Chat"
                                >
                                  <MessageSquare className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                onClick={() => handleDeleteContact(c.id)}
                                className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
                                title="Delete Contact"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
};
