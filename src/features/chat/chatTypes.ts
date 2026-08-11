export type ChatMessageRole = 'assistant' | 'user'
export type ChatMessageStatus = 'failed' | 'sent' | 'streaming'

export interface ChatMessage {
  content: string
  createdAt?: string
  id: string
  messageType?: string
  pageNumber?: number
  requestId?: string
  role: ChatMessageRole
  status: ChatMessageStatus
}
