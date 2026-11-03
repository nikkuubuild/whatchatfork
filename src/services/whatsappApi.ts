import { WhatsAppCredentials, WhatsAppTemplate, MessageType } from '../types/whatsapp';

export interface SendMessageOptions {
  credentials: WhatsAppCredentials;
  to: string; // E.164 format without '+' e.g. "15551234567"
  type: MessageType;
  text?: string;
  mediaUrl?: string;
  mediaCaption?: string;
  filename?: string;
  location?: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  };
  template?: {
    name: string;
    language: string;
    parameters?: Array<{ type: 'text'; text: string }>;
  };
}

export const WhatsAppApiService = {
  // Test Meta Cloud API credentials
  async testConnection(credentials: Pick<WhatsAppCredentials, 'phoneNumberId' | 'wabaId' | 'accessToken'>) {
    const res = await fetch('/api/whatsapp/test-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phoneNumberId: credentials.phoneNumberId.trim(),
        wabaId: credentials.wabaId?.trim(),
        token: credentials.accessToken.trim()
      })
    });
    return await res.json();
  },

  // Upload a media file or voice recording to the server proxy
  async uploadMedia(fileOrBlob: Blob | File, filename?: string): Promise<{ url: string; filename: string }> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = reader.result as string;
          const res = await fetch('/api/whatsapp/upload-local-media', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              filename: filename || (fileOrBlob instanceof File ? fileOrBlob.name : 'recording.webm'),
              base64Data,
              mimeType: fileOrBlob.type || 'application/octet-stream'
            })
          });
          const json = await res.json();
          if (!json.success) {
            throw new Error(json.error || 'Failed to upload media');
          }
          resolve({ url: json.url, filename: json.filename });
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file buffer'));
      reader.readAsDataURL(fileOrBlob);
    });
  },

  // Send a message via Meta WhatsApp Cloud API
  async sendMessage(options: SendMessageOptions) {
    const { credentials, to, type, text, mediaUrl, mediaCaption, filename, location, template } = options;

    // Clean phone number (remove +, spaces, hyphens)
    const cleanTo = to.replace(/[^0-9]/g, '');

    // Format Meta Graph API body
    let payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanTo
    };

    if (type === 'text') {
      payload.type = 'text';
      payload.text = {
        preview_url: true,
        body: text || ''
      };
    } else if (type === 'image') {
      payload.type = 'image';
      payload.image = {
        link: mediaUrl,
        caption: mediaCaption || undefined
      };
    } else if (type === 'audio') {
      payload.type = 'audio';
      payload.audio = {
        link: mediaUrl
      };
    } else if (type === 'video') {
      payload.type = 'video';
      payload.video = {
        link: mediaUrl,
        caption: mediaCaption || undefined
      };
    } else if (type === 'document') {
      payload.type = 'document';
      payload.document = {
        link: mediaUrl,
        caption: mediaCaption || undefined,
        filename: filename || 'document.pdf'
      };
    } else if (type === 'location' && location) {
      payload.type = 'location';
      payload.location = {
        latitude: location.latitude,
        longitude: location.longitude,
        name: location.name || 'Shared Location',
        address: location.address || ''
      };
    } else if (type === 'template' && template) {
      payload.type = 'template';
      const components: any[] = [];
      if (template.parameters && template.parameters.length > 0) {
        components.push({
          type: 'body',
          parameters: template.parameters
        });
      }
      payload.template = {
        name: template.name,
        language: { code: template.language || 'en_US' },
        ...(components.length > 0 ? { components } : {})
      };
    }

    const res = await fetch('/api/whatsapp/send-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: credentials.accessToken.trim(),
        phoneNumberId: credentials.phoneNumberId.trim(),
        messagePayload: payload
      })
    });

    return await res.json();
  },

  // Fetch Templates directly from Meta WABA
  async fetchTemplates(credentials: Pick<WhatsAppCredentials, 'accessToken' | 'wabaId'>): Promise<{ success: boolean; templates?: WhatsAppTemplate[]; error?: string }> {
    const res = await fetch(`/api/whatsapp/templates?wabaId=${encodeURIComponent(credentials.wabaId.trim())}`, {
      headers: {
        Authorization: `Bearer ${credentials.accessToken.trim()}`
      }
    });
    return await res.json();
  },

  // Create a new WhatsApp Template on Meta
  async createTemplate(
    credentials: Pick<WhatsAppCredentials, 'accessToken' | 'wabaId'>,
    templateData: {
      name: string;
      category: string;
      language: string;
      components: any[];
    }
  ) {
    const res = await fetch('/api/whatsapp/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: credentials.accessToken.trim(),
        wabaId: credentials.wabaId.trim(),
        templateData
      })
    });
    return await res.json();
  },

  // Fetch live incoming webhook messages and status updates
  async fetchLiveEvents(sinceTimestamp: number) {
    const res = await fetch(`/api/whatsapp/live-events?since=${sinceTimestamp}`);
    return await res.json();
  },

  // 1-Click Auto Setup inspired by WhatsJet: registers webhook via Graph API, subscribes WABA, and discovers phone numbers
  async autoSetupWebhook(params: {
    appId: string;
    appSecret: string;
    accessToken: string;
    wabaId: string;
    webhookUrl?: string;
    verifyToken?: string;
  }) {
    const res = await fetch('/api/whatsapp/auto-setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    return await res.json();
  },

  // Auto-fetch phone numbers registered under WABA
  async fetchPhoneNumbers(params: {
    wabaId: string;
    accessToken: string;
  }) {
    const res = await fetch(`/api/whatsapp/phone-numbers?wabaId=${encodeURIComponent(params.wabaId.trim())}`, {
      headers: {
        Authorization: `Bearer ${params.accessToken.trim()}`
      }
    });
    return await res.json();
  }
};
