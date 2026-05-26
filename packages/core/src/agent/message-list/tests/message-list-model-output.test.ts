import { describe, expect, it } from 'vitest';
import type { MastraDBMessage } from '../../../memory';
import { MessageList } from '../index';

const threadId = 'test-thread';
const resourceId = 'test-resource';

/**
 * Tests that toModelOutput substitution (stored in providerMetadata.mastra.modelOutput)
 * is applied in both aiV5.prompt() and aiV5.llmPrompt().
 */
describe('MessageList — toModelOutput substitution', () => {
  function buildMessageList() {
    const list = new MessageList({ threadId, resourceId });

    // User message
    const userMsg: MastraDBMessage = {
      id: 'user-1',
      role: 'user',
      type: 'text',
      createdAt: new Date(1),
      threadId,
      resourceId,
      content: { format: 2, parts: [{ type: 'text', text: 'call the tool' }] },
    };

    // Assistant message with tool invocation (result state) and providerMetadata.mastra.modelOutput
    const assistantMsg: MastraDBMessage = {
      id: 'asst-1',
      role: 'assistant',
      type: 'text',
      createdAt: new Date(2),
      threadId,
      resourceId,
      content: {
        format: 2,
        parts: [
          { type: 'step-start' },
          {
            type: 'tool-invocation',
            toolInvocation: {
              state: 'result',
              toolCallId: 'tc-1',
              toolName: 'getDoc',
              args: {},
              result: { id: 1, body: 'huge raw payload' },
            },
            providerMetadata: {
              mastra: {
                modelOutput: { summary: 'tiny summary for the model' },
              },
            },
          },
          { type: 'text', text: 'Done.' },
        ],
      },
    };

    list.add(userMsg, 'memory');
    list.add(assistantMsg, 'memory');

    return list;
  }

  it('aiV5.prompt() substitutes modelOutput into tool-result parts', () => {
    const list = buildMessageList();
    const messages = list.get.all.aiV5.prompt();

    const toolMessage = messages.find(m => m.role === 'tool');
    expect(toolMessage).toBeDefined();
    expect(Array.isArray(toolMessage!.content)).toBe(true);

    const toolResultPart = (toolMessage!.content as any[]).find(
      (p: any) => p.type === 'tool-result' && p.toolCallId === 'tc-1',
    );
    expect(toolResultPart).toBeDefined();
    // Should be the modelOutput value, not the raw result
    expect(toolResultPart.output).toEqual({ summary: 'tiny summary for the model' });
  });

  it('aiV5.llmPrompt() substitutes modelOutput into tool-result parts (regression)', async () => {
    const list = buildMessageList();
    const messages = await list.get.all.aiV5.llmPrompt();

    const toolMessage = messages.find(m => m.role === 'tool');
    expect(toolMessage).toBeDefined();
    expect(Array.isArray(toolMessage!.content)).toBe(true);

    const toolResultPart = (toolMessage!.content as any[]).find(
      (p: any) => p.type === 'tool-result' && p.toolCallId === 'tc-1',
    );
    expect(toolResultPart).toBeDefined();
    // Should be the modelOutput value, not the raw result
    expect(toolResultPart.output).toEqual({ summary: 'tiny summary for the model' });
  });

  it('aiV5.prompt() leaves tool-result output unchanged when no modelOutput is stored', () => {
    const list = new MessageList({ threadId, resourceId });

    const userMsg: MastraDBMessage = {
      id: 'user-2',
      role: 'user',
      type: 'text',
      createdAt: new Date(1),
      threadId,
      resourceId,
      content: { format: 2, parts: [{ type: 'text', text: 'call the tool' }] },
    };

    const assistantMsg: MastraDBMessage = {
      id: 'asst-2',
      role: 'assistant',
      type: 'text',
      createdAt: new Date(2),
      threadId,
      resourceId,
      content: {
        format: 2,
        parts: [
          { type: 'step-start' },
          {
            type: 'tool-invocation',
            toolInvocation: {
              state: 'result',
              toolCallId: 'tc-2',
              toolName: 'getDoc',
              args: {},
              result: { id: 1, body: 'raw payload' },
            },
            // No providerMetadata.mastra.modelOutput
          },
          { type: 'text', text: 'Done.' },
        ],
      },
    };

    list.add(userMsg, 'memory');
    list.add(assistantMsg, 'memory');

    const messages = list.get.all.aiV5.prompt();
    const toolMessage = messages.find(m => m.role === 'tool');
    expect(toolMessage).toBeDefined();

    const toolResultPart = (toolMessage!.content as any[]).find(
      (p: any) => p.type === 'tool-result' && p.toolCallId === 'tc-2',
    );
    expect(toolResultPart).toBeDefined();
    // Without modelOutput, output should reflect the raw result
    expect(toolResultPart.output).not.toEqual({ summary: 'tiny summary for the model' });
  });
});
