import { WhatsAppCredentials, Conversation, ChatMessage, WhatsAppTemplate, BroadcastCampaign, QuickFile, QuickLocationPreset, QuickPresetsSettings } from '../types/whatsapp';
import { generateVoiceNoteWavUrl } from './audioGenerator';
import { getSampleImageDataUrl, getSampleVideoUrl } from './sampleMedia';

const STORAGE_KEYS = {
  CREDENTIALS: 'whatscloud_credentials_v1',
  CONVERSATIONS: 'whatscloud_conversations_v2',
  MESSAGES: 'whatscloud_messages_v2',
  TEMPLATES: 'whatscloud_templates_v1',
  CAMPAIGNS: 'whatscloud_campaigns_v1',
  THEME: 'whatscloud_theme_mode_v1',
  QUICK_FILES: 'whatscloud_quick_files_v1',
  QUICK_LOCATIONS: 'whatscloud_quick_locations_v1',
  QUICK_SETTINGS: 'whatscloud_quick_settings_v1'
};

const DEFAULT_QUICK_SETTINGS: QuickPresetsSettings = {
  audio: true,
  document: true,
  image: true,
  video: true,
  location: true
};

const DEFAULT_CREDENTIALS: WhatsAppCredentials = {
  phoneNumberId: '',
  wabaId: '',
  accessToken: '',
  appId: '',
  appSecret: '',
  webhookVerifyToken: 'whatscloud_token',
  isConnected: false
};

const INITIAL_CONVERSATIONS: Conversation[] = [
  {
    id: 'conv_917372893607',
    phoneNumber: '+91 73728 93607',
    name: 'dk',
    avatarColor: '#25D366',
    unreadCount: 1,
    updatedAt: 1793660762000,
    isPinned: true,
    lastMessage: {
      id: 'wamid.HBgMOTE3MzcyODkzNjA3FQIAEhggQTVBRDZFRDA1NDNBNUIyMEZFNkRENDRDQjFGNjZFMUEA',
      conversationId: 'conv_917372893607',
      fromMe: false,
      type: 'text',
      text: 'Hii',
      timestamp: 1793660762000,
      status: 'read'
    }
  }
];

export function buildRichInitialMessages(): Record<string, ChatMessage[]> {
  return {
    conv_917372893607: [
      {
        id: 'wamid.HBgMOTE3MzcyODkzNjA3FQIAEhggQTVBRDZFRDA1NDNBNUIyMEZFNkRENDRDQjFGNjZFMUEA',
        conversationId: 'conv_917372893607',
        fromMe: false,
        type: 'text',
        text: 'Hii',
        timestamp: 1793660762000,
        status: 'read'
      }
    ]
  };
}

export function buildInitialQuickFiles(): QuickFile[] {
  const voiceIntro = typeof window !== 'undefined' ? generateVoiceNoteWavUrl('intro') : '';
  const voiceExpl = typeof window !== 'undefined' ? generateVoiceNoteWavUrl('explanation') : '';
  const voiceConfirm = typeof window !== 'undefined' ? generateVoiceNoteWavUrl('confirmation') : '';
  const voiceThanks = typeof window !== 'undefined' ? generateVoiceNoteWavUrl('thankyou') : '';

  const imgCatalogue = getSampleImageDataUrl('2026 Wholesale Catalogue', 'Official Tiered Pricing & Stock', '#25D366');
  const imgWarehouse = getSampleImageDataUrl('Warehouse Dispatch Hub', 'Dock 4 - Pallet Inspection Verified', '#008069');
  const imgQR = getSampleImageDataUrl('Instant Bank Transfer QR', 'Corporate Account Payment Gateway', '#128C7E');

  return [
    // AUDIO (up to 10)
    {
      id: 'qf_aud_1',
      category: 'audio',
      name: '1. Welcome Greeting.mp3',
      url: voiceIntro,
      duration: 6,
      orderIndex: 0,
      createdAt: Date.now() - 1000 * 60 * 100
    },
    {
      id: 'qf_aud_2',
      category: 'audio',
      name: '2. Pricing & Delivery Explainer.mp3',
      url: voiceExpl,
      duration: 14,
      orderIndex: 1,
      createdAt: Date.now() - 1000 * 60 * 90
    },
    {
      id: 'qf_aud_3',
      category: 'audio',
      name: '3. Payment Terms & Schedule.wav',
      url: voiceConfirm,
      duration: 8,
      orderIndex: 2,
      createdAt: Date.now() - 1000 * 60 * 80
    },
    {
      id: 'qf_aud_4',
      category: 'audio',
      name: '4. Thank You & Next Steps.mp3',
      url: voiceThanks,
      duration: 5,
      orderIndex: 3,
      createdAt: Date.now() - 1000 * 60 * 70
    },

    // DOCUMENTS (up to 10)
    {
      id: 'qf_doc_1',
      category: 'document',
      name: '1. Official Product Catalogue 2026.pdf',
      filename: 'Official_Catalogue_2026.pdf',
      url: imgCatalogue,
      fileSize: 2450000,
      caption: 'Official wholesale catalogue with volume tier discounts',
      orderIndex: 0,
      createdAt: Date.now() - 1000 * 60 * 100
    },
    {
      id: 'qf_doc_2',
      category: 'document',
      name: '2. Company Terms & Bank Wire Invoice.pdf',
      filename: 'Terms_and_Banking_Invoice.pdf',
      url: imgQR,
      fileSize: 1120000,
      caption: 'Corporate banking instructions & terms of service',
      orderIndex: 1,
      createdAt: Date.now() - 1000 * 60 * 90
    },
    {
      id: 'qf_doc_3',
      category: 'document',
      name: '3. Express Logistics Dispatch Matrix.pdf',
      filename: 'Logistics_Schedule.pdf',
      url: imgWarehouse,
      fileSize: 850000,
      caption: 'Global courier shipping timeline breakdown',
      orderIndex: 2,
      createdAt: Date.now() - 1000 * 60 * 80
    },

    // IMAGES (up to 10)
    {
      id: 'qf_img_1',
      category: 'image',
      name: '1. Warehouse Dispatch Inspection.jpg',
      url: imgWarehouse,
      caption: 'Pallet packaging & verified safety seal at Dock 4',
      orderIndex: 0,
      createdAt: Date.now() - 1000 * 60 * 100
    },
    {
      id: 'qf_img_2',
      category: 'image',
      name: '2. Payment Gateway QR Code.jpg',
      url: imgQR,
      caption: 'Scan to complete instant verified corporate transfer',
      orderIndex: 1,
      createdAt: Date.now() - 1000 * 60 * 90
    },
    {
      id: 'qf_img_3',
      category: 'image',
      name: '3. Product Specifications Flyer.jpg',
      url: imgCatalogue,
      caption: 'High-yield product features comparison sheet',
      orderIndex: 2,
      createdAt: Date.now() - 1000 * 60 * 80
    },

    // VIDEOS (up to 10)
    {
      id: 'qf_vid_1',
      category: 'video',
      name: '1. Warehouse Packaging Reel.mp4',
      url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      caption: 'Inspection walkthrough of packaged dispatch crate',
      orderIndex: 0,
      createdAt: Date.now() - 1000 * 60 * 100
    },
    {
      id: 'qf_vid_2',
      category: 'video',
      name: '2. Product Demonstration Reel.mp4',
      url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      caption: 'Quick 30-second operational walkthrough',
      orderIndex: 1,
      createdAt: Date.now() - 1000 * 60 * 90
    }
  ];
}

const INITIAL_TEMPLATES: WhatsAppTemplate[] = [
  {
    id: 'tmpl_1',
    name: 'order_status_update',
    category: 'UTILITY',
    language: 'en_US',
    status: 'APPROVED',
    components: [
      {
        type: 'HEADER',
        format: 'TEXT',
        text: 'Order Status Notification'
      },
      {
        type: 'BODY',
        text: 'Hello {{1}}, your order #{{2}} has been confirmed and is scheduled for shipment on {{3}}. Thank you for choosing us!',
        example: {
          body_text: [['Alexander', '89104', 'November 12']]
        }
      },
      {
        type: 'FOOTER',
        text: 'WhatsCloud Automated Updates'
      },
      {
        type: 'BUTTONS',
        buttons: [
          {
            type: 'URL',
            text: 'Track Shipment',
            url: 'https://example.com/track/{{1}}'
          },
          {
            type: 'QUICK_REPLY',
            text: 'Need Help?'
          }
        ]
      }
    ]
  },
  {
    id: 'tmpl_2',
    name: 'seasonal_flash_sale',
    category: 'MARKETING',
    language: 'en_US',
    status: 'APPROVED',
    components: [
      {
        type: 'HEADER',
        format: 'TEXT',
        text: 'Exclusive VIP Offer ⚡'
      },
      {
        type: 'BODY',
        text: 'Greetings {{1}}! Unlock 25% off all wholesale catalog items this weekend using code {{2}} at checkout.',
        example: {
          body_text: [['Partner', 'VIP25']]
        }
      },
      {
        type: 'FOOTER',
        text: 'Reply STOP to opt out'
      },
      {
        type: 'BUTTONS',
        buttons: [
          {
            type: 'URL',
            text: 'Shop Now',
            url: 'https://example.com/store'
          }
        ]
      }
    ]
  },
  {
    id: 'tmpl_3',
    name: 'appointment_reminder',
    category: 'UTILITY',
    language: 'en_US',
    status: 'APPROVED',
    components: [
      {
        type: 'HEADER',
        format: 'TEXT',
        text: 'Scheduled Appointment'
      },
      {
        type: 'BODY',
        text: 'Hi {{1}}, this is a friendly reminder for your consultation on {{2}} at {{3}}.',
        example: {
          body_text: [['David', 'Tomorrow', '10:30 AM']]
        }
      },
      {
        type: 'BUTTONS',
        buttons: [
          {
            type: 'QUICK_REPLY',
            text: 'Confirm Attendance'
          },
          {
            type: 'QUICK_REPLY',
            text: 'Reschedule'
          }
        ]
      }
    ]
  }
];

export const LocalStorageManager = {
  getCredentials(): WhatsAppCredentials {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.CREDENTIALS);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      // fallback
    }
    return DEFAULT_CREDENTIALS;
  },

  saveCredentials(creds: WhatsAppCredentials) {
    localStorage.setItem(STORAGE_KEYS.CREDENTIALS, JSON.stringify(creds));
  },

  getConversations(): Conversation[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.CONVERSATIONS);
      if (raw) {
        let parsed: Conversation[] = JSON.parse(raw);
        // Clean out legacy demo conversations
        parsed = parsed.filter((c) => !['conv_1', 'conv_2', 'conv_3', 'conv_4'].includes(c.id));
        // Ensure dk (+917372893607) exists in conversations
        const hasDk = parsed.some(
          (c) => c.id === 'conv_917372893607' || c.phoneNumber.replace(/[^0-9]/g, '').includes('917372893607')
        );
        if (!hasDk && INITIAL_CONVERSATIONS.length > 0) {
          parsed.unshift(INITIAL_CONVERSATIONS[0]);
        }
        this.saveConversations(parsed);
        return parsed;
      }
    } catch (e) {
      // fallback
    }
    return INITIAL_CONVERSATIONS;
  },

  saveConversations(conversations: Conversation[]) {
    localStorage.setItem(STORAGE_KEYS.CONVERSATIONS, JSON.stringify(conversations));
  },

  getMessages(): Record<string, ChatMessage[]> {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.MESSAGES);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Delete legacy demo conversation messages
        delete parsed.conv_1;
        delete parsed.conv_2;
        delete parsed.conv_3;
        delete parsed.conv_4;

        // Ensure conv_917372893607 messages exist
        if (!parsed.conv_917372893607 || parsed.conv_917372893607.length === 0) {
          parsed.conv_917372893607 = [
            {
              id: 'wamid.HBgMOTE3MzcyODkzNjA3FQIAEhggQTVBRDZFRDA1NDNBNUIyMEZFNkRENDRDQjFGNjZFMUEA',
              conversationId: 'conv_917372893607',
              fromMe: false,
              type: 'text',
              text: 'Hii',
              timestamp: 1793660762000,
              status: 'read'
            }
          ];
        }
        this.saveMessages(parsed);
        return parsed;
      }
    } catch (e) {
      // fallback
    }
    const fresh = buildRichInitialMessages();
    this.saveMessages(fresh);
    return fresh;
  },

  saveMessages(messages: Record<string, ChatMessage[]>) {
    localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(messages));
  },

  resetDemoMessages(): Record<string, ChatMessage[]> {
    const fresh = buildRichInitialMessages();
    this.saveMessages(fresh);
    this.saveConversations(INITIAL_CONVERSATIONS);
    return fresh;
  },

  getTemplates(): WhatsAppTemplate[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.TEMPLATES);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      // fallback
    }
    return INITIAL_TEMPLATES;
  },

  saveTemplates(templates: WhatsAppTemplate[]) {
    localStorage.setItem(STORAGE_KEYS.TEMPLATES, JSON.stringify(templates));
  },

  getCampaigns(): BroadcastCampaign[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.CAMPAIGNS);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      // fallback
    }
    return [];
  },

  saveCampaigns(campaigns: BroadcastCampaign[]) {
    localStorage.setItem(STORAGE_KEYS.CAMPAIGNS, JSON.stringify(campaigns));
  },

  // QUICK FILES (Up to 10 per category)
  getQuickFiles(category?: 'audio' | 'document' | 'image' | 'video'): QuickFile[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.QUICK_FILES);
      if (raw) {
        const parsed: QuickFile[] = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return category ? parsed.filter((f) => f.category === category) : parsed;
        }
      }
    } catch (e) {
      // fallback
    }
    const defaults = buildInitialQuickFiles();
    this.saveQuickFiles(defaults);
    return category ? defaults.filter((f) => f.category === category) : defaults;
  },

  saveQuickFiles(files: QuickFile[]) {
    localStorage.setItem(STORAGE_KEYS.QUICK_FILES, JSON.stringify(files));
  },

  addQuickFile(file: Omit<QuickFile, 'id' | 'createdAt' | 'orderIndex'>): { success: boolean; file?: QuickFile; error?: string } {
    const all = this.getQuickFiles();
    const catFiles = all.filter((f) => f.category === file.category);

    if (catFiles.length >= 10) {
      return {
        success: false,
        error: `Maximum limit reached: You can have up to 10 quick ${file.category} files. Please remove one first.`
      };
    }

    const newQuick: QuickFile = {
      ...file,
      id: `qf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      createdAt: Date.now(),
      orderIndex: catFiles.length
    };

    const updated = [...all, newQuick];
    this.saveQuickFiles(updated);
    return { success: true, file: newQuick };
  },

  removeQuickFile(id: string): QuickFile[] {
    const all = this.getQuickFiles().filter((f) => f.id !== id);
    this.saveQuickFiles(all);
    return all;
  },

  renameQuickFile(id: string, newName: string): QuickFile[] {
    const all = this.getQuickFiles().map((f) => {
      if (f.id === id) {
        return { ...f, name: newName.trim() };
      }
      return f;
    });
    this.saveQuickFiles(all);
    return all;
  },

  reorderQuickFiles(category: 'audio' | 'document' | 'image' | 'video', fromIndex: number, toIndex: number): QuickFile[] {
    const all = this.getQuickFiles();
    const catFiles = all.filter((f) => f.category === category).sort((a, b) => a.orderIndex - b.orderIndex);
    const otherFiles = all.filter((f) => f.category !== category);

    if (fromIndex < 0 || fromIndex >= catFiles.length || toIndex < 0 || toIndex >= catFiles.length) {
      return all;
    }

    const [moved] = catFiles.splice(fromIndex, 1);
    catFiles.splice(toIndex, 0, moved);

    // Reassign orderIndex
    catFiles.forEach((f, idx) => {
      f.orderIndex = idx;
    });

    const updated = [...otherFiles, ...catFiles];
    this.saveQuickFiles(updated);
    return updated;
  },

  // MULTI-BRANCH QUICK LOCATIONS (up to 10 office centers)
  getQuickLocations(): QuickLocationPreset[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.QUICK_LOCATIONS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    const defaults: QuickLocationPreset[] = [
      {
        id: 'loc_hq',
        name: 'Main Corporate HQ - Downtown Hub',
        address: '500 Howard St, Financial District, San Francisco, CA',
        latitude: 37.7891,
        longitude: -122.3993,
        orderIndex: 0,
        isDefault: true
      },
      {
        id: 'loc_east',
        name: 'East Bay Logistics & Freight Center',
        address: '1400 Cargo Way, Harbor Gate 4, Oakland, CA',
        latitude: 37.7952,
        longitude: -122.2785,
        orderIndex: 1
      },
      {
        id: 'loc_north',
        name: 'North City Customer Experience & Retail Branch',
        address: '750 Battery St, Suite 200, San Francisco, CA',
        latitude: 37.7989,
        longitude: -122.4011,
        orderIndex: 2
      },
      {
        id: 'loc_south',
        name: 'South Industrial Storage & Packaging Depot',
        address: '2200 Industrial Blvd, San Carlos, CA',
        latitude: 37.5072,
        longitude: -122.2605,
        orderIndex: 3
      }
    ];
    this.saveQuickLocations(defaults);
    return defaults;
  },

  saveQuickLocations(locations: QuickLocationPreset[]) {
    localStorage.setItem(STORAGE_KEYS.QUICK_LOCATIONS, JSON.stringify(locations));
  },

  addQuickLocation(loc: Omit<QuickLocationPreset, 'id' | 'orderIndex'>): { success: boolean; location?: QuickLocationPreset; error?: string } {
    const all = this.getQuickLocations();
    if (all.length >= 10) {
      return { success: false, error: 'Maximum 10 branch locations allowed.' };
    }
    const newLoc: QuickLocationPreset = {
      ...loc,
      id: `loc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      orderIndex: all.length
    };
    const updated = [...all, newLoc];
    this.saveQuickLocations(updated);
    return { success: true, location: newLoc };
  },

  removeQuickLocation(id: string): QuickLocationPreset[] {
    const all = this.getQuickLocations().filter((l) => l.id !== id);
    this.saveQuickLocations(all);
    return all;
  },

  reorderQuickLocations(fromIndex: number, toIndex: number): QuickLocationPreset[] {
    const all = this.getQuickLocations().sort((a, b) => a.orderIndex - b.orderIndex);
    if (fromIndex < 0 || fromIndex >= all.length || toIndex < 0 || toIndex >= all.length) return all;
    const [moved] = all.splice(fromIndex, 1);
    all.splice(toIndex, 0, moved);
    all.forEach((l, idx) => (l.orderIndex = idx));
    this.saveQuickLocations(all);
    return all;
  },

  getQuickSettings(): QuickPresetsSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.QUICK_SETTINGS);
      if (raw) {
        return { ...DEFAULT_QUICK_SETTINGS, ...JSON.parse(raw) };
      }
    } catch (e) {}
    return DEFAULT_QUICK_SETTINGS;
  },

  saveQuickSettings(settings: QuickPresetsSettings) {
    localStorage.setItem(STORAGE_KEYS.QUICK_SETTINGS, JSON.stringify(settings));
  },

  getTheme(): 'dark' | 'light' {
    try {
      const t = localStorage.getItem(STORAGE_KEYS.THEME);
      if (t === 'dark' || t === 'light') return t;
    } catch (e) {}
    return 'light';
  },

  saveTheme(theme: 'dark' | 'light') {
    localStorage.setItem(STORAGE_KEYS.THEME, theme);
  }
};
