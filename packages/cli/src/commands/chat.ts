/**
 * CLI chat command — send a message to the orchestrator agent
 *
 * Single-shot: streams response to stdout and exits.
 * Multi-turn conversations happen via the web UI.
 */
import { CLIAdapter } from '../adapters/cli-adapter';
import { handleMessage } from '@archon/core';
import * as conversationDb from '@archon/core/db/conversations';
import * as messageDb from '@archon/core/db/messages';

export interface ChatCommandOptions {
  assistantType?: string;
}

/**
 * Execute a single-shot orchestrator chat message.
 * Creates a unique conversation, streams the response to stdout, and returns.
 */
export async function chatCommand(message: string, options?: ChatCommandOptions): Promise<void> {
  const adapter = new CLIAdapter({ streamingMode: 'batch' });
  const conversationId = `cli-chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const conversation = await conversationDb.getOrCreateConversation(
    adapter.getPlatformType(),
    conversationId,
    undefined,
    undefined,
    options?.assistantType
  );
  adapter.setConversationDbId(conversationId, conversation.id);
  await messageDb.addMessage(conversation.id, 'user', message);

  await handleMessage(adapter, conversationId, message, {
    ...(options?.assistantType ? { assistantType: options.assistantType } : {}),
  });
}
