export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMProvider {
  readonly name: string;
  complete(messages: ChatMessage[], options?: { json?: boolean }): Promise<string>;
}
