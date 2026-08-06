import type { ContactChannel, NotificationTemplate, PrismaService } from "@cobrai/db";
import { buildMessageContent, renderTemplate } from "../common/utils/api.utils";

/**
 * Persists the outbound Message row (and its parent Conversation) for a
 * contact attempt. Extracted out of `ContactsService` — which was already over
 * the repo's file-size limit before this plan — instead of appending here, per
 * the project's hard rule that a file already over the limit must not grow.
 *
 * `simulated` flows from the adapter result (D-17): a simulated send must
 * never be indistinguishable from a real one in the audit trail, so it must
 * not inflate delivery metrics nor consume the Ley 1266 contact quota.
 */
export async function recordConversationMessage(
  prisma: PrismaService,
  tenantId: string,
  debtorId: string,
  debtId: string,
  channel: ContactChannel,
  template: NotificationTemplate | null,
  variables: Record<string, string>,
  providerMessageId: string,
  body: string,
  sendStatus: "sent" | "failed",
  simulated: boolean
): Promise<void> {
  let conversation = await prisma.conversation.findFirst({
    where: { tenantId, debtorId, channel, deletedAt: null }
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        tenantId,
        debtorId,
        debtId,
        channel,
        status: "open",
        lastMessageAt: new Date()
      }
    });
  } else {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date(), debtId }
    });
  }

  await prisma.message.create({
    data: {
      tenantId,
      conversationId: conversation.id,
      direction: "out",
      channel,
      content: buildMessageContent(
        // For voice, the template is not what the debtor hears (Vapi drives the
        // call from its own assistant), so rendering it would persist raw script
        // scaffolding and unresolved variables. Store the clean call body instead.
        channel !== "voice" && template ? renderTemplate(template.content, variables) : body,
        providerMessageId
      ),
      status: sendStatus,
      templateId: template?.id,
      sentAt: new Date(),
      simulated
    }
  });
}
