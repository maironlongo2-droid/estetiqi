// Configuração PÚBLICA do Embedded Signup (Facebook Login for Business) usada
// pela interface para abrir o fluxo oficial da Meta e conectar o número.
//
// MÓDULO EXCLUSIVO DO SERVIDOR (lê variáveis de ambiente). Ainda assim, NUNCA
// devolve segredos: o App ID e o `config_id` NÃO são secretos — o App ID é
// público por natureza (aparece no SDK JS da Meta) e o `config_id` é apenas o
// identificador da configuração criada no painel. O App SECRET fica SÓ no
// servidor e jamais é exposto; aqui só verificamos SE ele existe.
//
// Honestidade: `enabled` só é true quando há tudo (App ID + config_id + App
// Secret). Caso contrário, a interface orienta exatamente o que falta, em vez de
// tentar abrir um fluxo que falharia.

import { WHATSAPP_ENV_KEYS } from "@/lib/communication/whatsapp-status";
import { DEFAULT_GRAPH_API_VERSION } from "@/lib/communication/whatsapp-connect";

export const WHATSAPP_APP_ID_ENV = "WHATSAPP_APP_ID";
export const WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID_ENV =
  "WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID";

export type EmbeddedSignupPublicConfig = {
  // true somente quando há App ID + config_id + App Secret configurados.
  enabled: boolean;
  // Públicos: podem ser entregues a usuários autenticados.
  appId: string | null;
  configId: string | null;
  graphVersion: string;
  // Variáveis ausentes, para a interface orientar o operador.
  missing: string[];
};

function readEnvKey(
  env: NodeJS.ProcessEnv,
  key: string
): string | null {
  const value = env[key];
  return value && value.trim() ? value.trim() : null;
}

export function readEmbeddedSignupPublicConfig(
  env: NodeJS.ProcessEnv = process.env
): EmbeddedSignupPublicConfig {
  const appId = readEnvKey(env, WHATSAPP_APP_ID_ENV);
  const configId = readEnvKey(env, WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID_ENV);
  const appSecret = readEnvKey(env, WHATSAPP_ENV_KEYS.appSecret);

  const missing: string[] = [];
  if (!appId) missing.push(WHATSAPP_APP_ID_ENV);
  if (!configId) missing.push(WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID_ENV);
  if (!appSecret) missing.push(WHATSAPP_ENV_KEYS.appSecret);

  return {
    enabled: Boolean(appId && configId && appSecret),
    // O App Secret NUNCA é devolvido aqui.
    appId,
    configId,
    graphVersion: DEFAULT_GRAPH_API_VERSION,
    missing,
  };
}
