import { describe, expect, it, vi } from 'vitest'

import { consumeSseStream } from './sseParser'

describe('consumeSseStream', () => {
  it('parses split chunks, multiline data, and ignores heartbeats', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(': heartbeat\n\nevent: content_'))
        controller.enqueue(
          encoder.encode(
            'delta\nid: 12\ndata: {"text":"첫 줄"}\ndata: {"text":"둘째 줄"}\n\n',
          ),
        )
        controller.close()
      },
    })
    const onMessage = vi.fn()

    await consumeSseStream(stream, onMessage)

    expect(onMessage).toHaveBeenCalledOnce()
    expect(onMessage).toHaveBeenCalledWith({
      data: '{"text":"첫 줄"}\n{"text":"둘째 줄"}',
      event: 'content_delta',
      id: '12',
    })
  })

  it('waits for a complete ready event split across network chunks', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('event: rea'))
        controller.enqueue(encoder.encode('dy\ndata: {"session'))
        controller.enqueue(encoder.encode('Id":573}\n\n'))
        controller.close()
      },
    })
    const onMessage = vi.fn()

    await consumeSseStream(stream, onMessage)

    expect(onMessage).toHaveBeenCalledOnce()
    expect(onMessage).toHaveBeenCalledWith({
      data: '{"sessionId":573}',
      event: 'ready',
      id: undefined,
    })
  })
})
