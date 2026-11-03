import { Response } from 'express';
import { db } from './db.js';
import { v4 as uuidv4 } from 'uuid';
import { logWebhookEvent } from './webhookDiagnostics.js';

// In-memory tenant-isolated SSE connections
// Map<tenantId, Set<{ id: string; res: Response }>>
const tenantSseClients = new Map<string, Set<{ id: string; res: Response }>>();

export function registerTenantSseClient(tenantId: string, clientId: string, res: Response) {
  if (!tenantSseClients.has(tenantId)) {
    tenantSseClients.set(tenantId, new Set());
  }
  const clientSet = tenantSseClients.get(tenantId)!;
  clientSet.add({ id: clientId, res });
  console.log(`[Multi-Tenant SSE] Client ${clientId} connected to tenant ${tenantId} (Tenant active: ${clientSet.size})`);
}

export function unregisterTenantSseClient(tenantId: string, clientId: string) {
  const clientSet = tenantSseClients.get(tenantId);
  if (clientSet) {
    for (const client of clientSet) {
      if (client.id === clientId) {
        clientSet.delete(client);
        break;
      }
    }
    if (clientSet.size === 0) {
      tenantSseClients.delete(tenantId);
    }
  }
  console.log(`[Multi-Tenant SSE] Client ${clientId} disconnected from tenant ${tenantId}`);
}

export function broadcastTenantEvent(tenantId: string, event: any) {
  const clientSet = tenantSseClients.get(tenantId);
  if (!clientSet || clientSet.size === 0) {
    return;
  }

  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of Array.from(clientSet)) {
    try {
      client.res.write(payload);
    } catch (err) {
      console.warn(`[Multi-Tenant SSE] Error pushing to client ${client.id}, pruning:`, err);
      clientSet.delete(client);
    }
  }
}

// Global heartbeat every 20 seconds to keep all tenant SSE connections alive
setInterval(() => {
  for (const [tenantId, clientSet] of tenantSseClients.entries()) {
    for (const client of Array.from(clientSet)) {
      try {
        client.res.write(': ping\n\n');
      } catch {
        clientSet.delete(client);
      }
    }
    if (clientSet.size === 0) {
      tenantSseClients.delete(tenantId);
    }
  }
}, 20000);

// Resolve which tenant owns an incoming webhook event
export async function resolveTenantFromWebhook(wabaId?: string, phoneNumberId?: string): Promise<{
  tenantId: string;
  channelId: string;
} | null> {
  if (phoneNumberId) {
    const channel = (await db.prepare('SELECT id, tenant_id FROM whatsapp_channels WHERE phone_number_id = ?').get(phoneNumberId)) as {
      id: string;
      tenant_id: string;
    } | undefined;
    if (channel) return { tenantId: channel.tenant_id, channelId: channel.id };
  }

  if (wabaId) {
    const channel = (await db.prepare('SELECT id, tenant_id FROM whatsapp_channels WHERE waba_id = ?').get(wabaId)) as {
      id: string;
      tenant_id: string;
    } | undefined;
    if (channel) return { tenantId: channel.tenant_id, channelId: channel.id };
  }

  // Fallback to active channel if only one exists
  const defaultChannel = (await db.prepare("SELECT id, tenant_id FROM whatsapp_channels WHERE status = 'active' LIMIT 1").get()) as {
    id: string;
    tenant_id: string;
  } | undefined;

  if (defaultChannel) {
    return { tenantId: defaultChannel.tenant_id, channelId: defaultChannel.id };
  }

  return null;
}

// Ingest incoming webhook payload, persist to DB with tenant scoping, and trigger isolated SSE push
export async function processInboundWebhookPayload(body: any, explicitTenantId?: string): Promise<void> {
  if (body?.object !== 'whatsapp_business_account') return;

  const entries = body.entry || [];
  for (const entry of entries) {
    const wabaId = entry.id;
    const changes = entry.changes || [];

    for (const change of changes) {
      const value = change.value;
      if (!value) continue;

      const phoneNumberId = value.metadata?.phone_number_id;
      
      // If routed via /whatsapp-webhook/:tenantId, use that tenant immediately
      let tenantMatch = null;
      if (explicitTenantId) {
        const directChannel = (await db.prepare('SELECT id, tenant_id FROM whatsapp_channels WHERE tenant_id = ? LIMIT 1').get(explicitTenantId)) as { id: string; tenant_id: string } | undefined;
        if (directChannel) {
          tenantMatch = { tenantId: directChannel.tenant_id, channelId: directChannel.id };
        }
      }

      if (!tenantMatch) {
        tenantMatch = await resolveTenantFromWebhook(wabaId, phoneNumberId);
      }

      if (!tenantMatch) {
        console.warn(`[Webhook Router] Unmapped inbound event for WABA ${wabaId} / Phone ${phoneNumberId}. Skipping.`);
        await logWebhookEvent({
          tenantId: null,
          eventType: 'unmapped_event',
          payload: { wabaId, phoneNumberId, change },
          isError: true
        });
        continue;
      }

      const { tenantId, channelId } = tenantMatch;

      // 1. Process Inbound Messages
      if (Array.isArray(value.messages)) {
        for (const msg of value.messages) {
          try {
            const contact = (value.contacts && value.contacts[0]) || null;
            const senderPhone = msg.from;
            const senderName = contact?.profile?.name || senderPhone;
            const msgTimestamp = parseInt(msg.timestamp || '0', 10) * 1000 || Date.now();
            const msgId = msg.id || uuidv4();

            // Idempotency: skip if already processed
            const existingMsg = (await db.prepare('SELECT id FROM messages WHERE meta_message_id = ?').get(msgId)) as { id: string } | undefined;
            if (existingMsg) {
              console.log(`[Webhook Idempotency] Message ${msgId} already processed. Skipping duplicate.`);
              continue;
            }

            let textContent = '';
            let mediaUrl: string | null = null;
            let mediaCaption: string | null = null;
            let filename: string | null = null;
            let locationJson: string | null = null;

            if (msg.type === 'text') {
              textContent = msg.text?.body || '';
            } else if (msg.type === 'image') {
              textContent = msg.image?.caption || 'Photo';
              mediaUrl = `/api/whatsapp/proxy-media?mediaId=${encodeURIComponent(msg.image?.id || '')}`;
              mediaCaption = msg.image?.caption || null;
            } else if (msg.type === 'video') {
              textContent = msg.video?.caption || 'Video';
              mediaUrl = `/api/whatsapp/proxy-media?mediaId=${encodeURIComponent(msg.video?.id || '')}`;
            } else if (msg.type === 'audio') {
              textContent = 'Voice message';
              mediaUrl = `/api/whatsapp/proxy-media?mediaId=${encodeURIComponent(msg.audio?.id || '')}`;
            } else if (msg.type === 'document') {
              textContent = msg.document?.filename || 'Document';
              filename = msg.document?.filename || null;
              mediaUrl = `/api/whatsapp/proxy-media?mediaId=${encodeURIComponent(msg.document?.id || '')}`;
            } else if (msg.type === 'location') {
              textContent = msg.location?.name || 'Shared Location';
              locationJson = JSON.stringify(msg.location);
            } else if (msg.type === 'button') {
              textContent = msg.button?.text || '';
            } else if (msg.type === 'interactive') {
              textContent = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || 'Interactive response';
            } else {
              textContent = `[${msg.type} message]`;
            }

            // Atomically upsert conversation
            let conv = (await db.prepare('SELECT id, unread_count FROM conversations WHERE tenant_id = ? AND customer_phone = ?').get(tenantId, senderPhone)) as {
              id: string;
              unread_count: number;
            } | undefined;

            let convId = conv ? conv.id : uuidv4();
            if (conv) {
              await db.prepare(`
                UPDATE conversations
                SET customer_name = COALESCE(?, customer_name),
                    unread_count = unread_count + 1,
                    last_message_preview = ?,
                    updated_at = ?
                WHERE id = ?
              `).run(senderName, textContent, msgTimestamp, convId);
            } else {
              const colors = ['#008069', '#128C7E', '#25D366', '#075E54', '#34B7F1'];
              const randomColor = colors[Math.floor(Math.random() * colors.length)];
              await db.prepare(`
                INSERT INTO conversations (id, tenant_id, channel_id, customer_phone, customer_name, avatar_color, unread_count, last_message_preview, updated_at, created_at)
                VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
              `).run(convId, tenantId, channelId, senderPhone, senderName, randomColor, textContent, msgTimestamp, msgTimestamp);
            }

            // Insert Message
            await db.prepare(`
              INSERT INTO messages (id, tenant_id, conversation_id, meta_message_id, from_me, type, text, media_url, media_caption, filename, location_json, status, created_at)
              VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, 'read', ?)
            `).run(uuidv4(), tenantId, convId, msgId, msg.type, textContent, mediaUrl, mediaCaption, filename, locationJson, msgTimestamp);

            // Log event into audit trail
            await logWebhookEvent({
              tenantId,
              eventType: 'inbound_message',
              payload: { msgId, from: senderPhone, type: msg.type }
            });

            // Broadcast isolated SSE event to this tenant
            broadcastTenantEvent(tenantId, {
              id: msgId,
              type: 'message',
              timestamp: msgTimestamp,
              data: {
                ...msg,
                contactName: senderName,
                phoneNumberId
              }
            });
          } catch (msgErr) {
            console.error('[Inbound Message Processing Error]:', msgErr);
            await logWebhookEvent({
              tenantId,
              eventType: 'message_processing_error',
              payload: { error: String(msgErr), msg },
              isError: true
            });
          }
        }
      }

      // 2. Process Status Updates (sent, delivered, read, failed)
      if (Array.isArray(value.statuses)) {
        for (const status of value.statuses) {
          try {
            const metaMsgId = status.id;
            const statusValue = status.status;
            const statusTimestamp = parseInt(status.timestamp || '0', 10) * 1000 || Date.now();

            // Safe update: do not downgrade read status
            await db.prepare(`
              UPDATE messages
              SET status = CASE 
                WHEN status = 'read' AND ? IN ('sent', 'delivered') THEN status
                ELSE ?
              END
              WHERE meta_message_id = ? AND tenant_id = ?
            `).run(statusValue, statusValue, metaMsgId, tenantId);

            // Log status update
            await logWebhookEvent({
              tenantId,
              eventType: `status_${statusValue}`,
              payload: { metaMsgId, status: statusValue }
            });

            // Broadcast isolated status event to this tenant
            broadcastTenantEvent(tenantId, {
              id: metaMsgId,
              type: 'status',
              timestamp: statusTimestamp,
              data: status
            });
          } catch (statusErr) {
            console.error('[Status Update Processing Error]:', statusErr);
            await logWebhookEvent({
              tenantId,
              eventType: 'status_processing_error',
              payload: { error: String(statusErr), status },
              isError: true
            });
          }
        }
      }
    }
  }
}
