export async function postDiscordWebhook(params: {
  webhookUrl: string;
  content: string;
  username?: string;
  avatarUrl?: string;
}): Promise<void> {
  const response = await fetch(params.webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      content: params.content,
      username: params.username,
      avatar_url: params.avatarUrl
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Discord webhook failed: ${response.status} ${response.statusText}${body ? `: ${body}` : ""}`
    );
  }
}

