export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export type MessageType = 'text' | 'image' | 'audio' | 'video' | 'document' | 'location' | 'template';

export interface WhatsAppCredentials {
  phoneNumberId: string;
  wabaId: string;
  accessToken: string;
  webhookVerifyToken: string;
  appId?: string;
  appSecret?: string;
  verifiedName?: string;
  displayPhoneNumber?: string;
  qualityRating?: string;
  isConnected: boolean;
  lastChecked?: number;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  fromMe: boolean;
  type: MessageType;
  text?: string;
  mediaUrl?: string;
  mediaCaption?: string;
  filename?: string;
  fileSize?: number;
  duration?: number;
  location?: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  };
  timestamp: number;
  status: MessageStatus;
  metaMessageId?: string;
  errorMessage?: string;
  templateName?: string;
}

export interface Conversation {
  id: string;
  phoneNumber: string;
  name: string;
  avatarColor: string;
  lastMessage?: ChatMessage;
  unreadCount: number;
  updatedAt: number;
  isPinned?: boolean;
}

export interface TemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'LOCATION';
  text?: string;
  example?: {
    header_text?: string[];
    body_text?: string[][];
    header_handle?: string[];
  };
  buttons?: Array<{
    type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
    text: string;
    url?: string;
    phone_number?: string;
  }>;
}

export interface WhatsAppTemplate {
  id?: string;
  name: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  language: string;
  status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'PAUSED';
  components: TemplateComponent[];
  previous_category?: string;
}

export interface BroadcastRecipient {
  phone: string;
  name: string;
  variables: Record<string, string>; // e.g. {{1}}: "Alex", {{2}}: "Order #4829"
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  error?: string;
  sentAt?: number;
}

export interface BroadcastCampaign {
  id: string;
  title: string;
  type: 'template' | 'custom';
  templateName?: string;
  templateLanguage?: string;
  customText?: string;
  mediaUrl?: string;
  mediaType?: MessageType;
  recipients: BroadcastRecipient[];
  totalRecipients: number;
  sentCount: number;
  deliveredCount: number;
  failedCount: number;
  status: 'draft' | 'running' | 'completed' | 'paused' | 'failed';
  createdAt: number;
  completedAt?: number;
  intervalMs: number;
}

export interface QuickFile {
  id: string;
  category: 'audio' | 'document' | 'image' | 'video' | 'location';
  name: string; // e.g. "1. Welcome Greeting.mp3" or "2. Catalogue.pdf"
  url: string;
  caption?: string;
  filename?: string;
  fileSize?: number;
  duration?: number;
  location?: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  };
  orderIndex: number;
  createdAt: number;
}

export interface QuickLocationPreset {
  id: string;
  name: string; // e.g. "HQ Main Office", "East Distribution Center"
  address: string;
  latitude: number;
  longitude: number;
  orderIndex: number;
  isDefault?: boolean;
}

export interface QuickPresetsSettings {
  audio: boolean;
  document: boolean;
  image: boolean;
  video: boolean;
  location: boolean;
}

