export async function sendSlack(webhookUrl: string, text: string): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Slack webhook ${res.status}: ${body}`)
  }
}

export async function validateSlackWebhook(webhookUrl: string): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: '🌙 overnight is connected to this channel.' }),
  })
  if (!res.ok) {
    throw new Error(`Slack webhook returned ${res.status}`)
  }
}
