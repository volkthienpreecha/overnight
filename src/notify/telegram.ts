const TELEGRAM_API = 'https://api.telegram.org'

export async function sendTelegram(
  botToken: string,
  chatId: string,
  text: string,
): Promise<void> {
  const url = `${TELEGRAM_API}/bot${botToken}/sendMessage`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Telegram API ${res.status}: ${body}`)
  }
}

export async function pollTelegramForChatId(
  botToken: string,
  timeoutMs = 120_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs
  let offset = 0

  while (Date.now() < deadline) {
    const url = `${TELEGRAM_API}/bot${botToken}/getUpdates?offset=${offset}&timeout=10`
    const res = await fetch(url)
    if (!res.ok) {
      throw new Error(`getUpdates ${res.status}`)
    }
    const data = (await res.json()) as { ok: boolean; result: Array<{ update_id: number; message?: { chat: { id: number } } }> }

    if (data.ok && data.result.length > 0) {
      for (const update of data.result) {
        offset = update.update_id + 1
        if (update.message?.chat?.id) {
          return String(update.message.chat.id)
        }
      }
    }

    // short sleep between polls
    await new Promise(r => setTimeout(r, 2000))
  }

  throw new Error('Timed out waiting for Telegram message')
}

export async function validateTelegramToken(botToken: string): Promise<string> {
  const res = await fetch(`${TELEGRAM_API}/bot${botToken}/getMe`)
  if (!res.ok) throw new Error(`Invalid token (${res.status})`)
  const data = (await res.json()) as { ok: boolean; result: { username: string } }
  if (!data.ok) throw new Error('Invalid token')
  return data.result.username
}
