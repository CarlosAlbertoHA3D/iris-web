type WSMessage = {
  jobId: string
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED'
  progress: number
  message?: string
}

export class WSClient {
  private ws?: WebSocket
  private url: string
  private token?: string

  constructor(url: string, token?: string) {
    this.url = url
    this.token = token
  }

  connect(onMessage: (m: WSMessage) => void, onClose?: () => void) {
    const url = new URL(this.url)
    if (this.token) url.searchParams.set('token', this.token)
    this.ws = new WebSocket(url.toString())
    this.ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as WSMessage
        onMessage(data)
      } catch (e) {
        // ignore
      }
    }
    this.ws.onclose = () => onClose?.()
  }

  close() {
    this.ws?.close()
  }
}
