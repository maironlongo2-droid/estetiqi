type SupportRequestNotification = {
  id: string;
  organizationName: string;
  userEmail: string;
  category: string;
  subject: string;
  description: string;
};

// Notificação externa opcional do responsável pelo EstetiQI.
//
// O projeto não possui provedor de e-mail configurado (nenhuma dependência ou
// credencial de SMTP), então não inventamos um envio de e-mail. Se a variável
// SUPPORT_NOTIFICATION_WEBHOOK_URL estiver definida, a solicitação é publicada
// nesse webhook (por exemplo: Activepieces — já usado no projeto —, Slack,
// Discord ou Zapier), que pode reenviar por e-mail para suporte@estetiqi.com.br.
//
// Sem a variável, nenhuma notificação acontece e a solicitação permanece apenas
// salva no banco. Esta função nunca lança: a persistência não depende dela e a
// interface jamais afirma que um e-mail foi enviado.
export async function notifySupportRequest(
  request: SupportRequestNotification
): Promise<boolean> {
  const webhookUrl = process.env.SUPPORT_NOTIFICATION_WEBHOOK_URL;

  if (!webhookUrl) {
    return false;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event: "support_request.created",
        to: "suporte@estetiqi.com.br",
        request,
      }),
    });

    return response.ok;
  } catch (error) {
    console.error("Support notification failed:", error);
    return false;
  }
}
