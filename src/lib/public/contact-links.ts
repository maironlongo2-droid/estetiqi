// Normalizacao dos contatos do cartao digital (WhatsApp, Instagram e Google
// Maps). Fica centralizada para que o painel administrativo (validacao no
// navegador) e o servidor (validacao nas APIs) usem exatamente as mesmas regras,
// garantindo que o cartao publico nunca exiba um link invalido, inseguro ou
// ficticio.

const INSTAGRAM_USERNAME = /^[A-Za-z0-9._]{1,30}$/;
const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com"]);

// Hosts usados para compartilhar um lugar no Google Maps. Os primeiros aceitam
// qualquer caminho; os demais precisam apontar para o caminho /maps.
const MAPS_FULL_HOSTS = new Set([
  "maps.app.goo.gl",
  "maps.google.com",
  "maps.google.com.br",
]);
const MAPS_PATH_HOSTS = new Set([
  "google.com",
  "www.google.com",
  "google.com.br",
  "www.google.com.br",
  "goo.gl",
]);

// WhatsApp comercial: devolve apenas os digitos no formato aceito pelo wa.me
// (codigo do pais + DDD + numero) ou null quando o valor nao forma um numero
// utilizavel. Numeros brasileiros no formato local (10 ou 11 digitos) recebem o
// codigo do pais 55 automaticamente. Um campo vazio nunca e presumido.
export function normalizeWhatsapp(
  value: string | null | undefined
): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export function whatsappUrl(value: string | null | undefined): string | null {
  const number = normalizeWhatsapp(value);
  return number ? `https://wa.me/${number}` : null;
}

function instagramFromUsername(username: string | undefined): string | null {
  const handle = (username ?? "").trim();
  if (!INSTAGRAM_USERNAME.test(handle)) return null;
  return `https://instagram.com/${handle}`;
}

// Instagram comercial: aceita "@usuario", "usuario" ou uma URL completa do
// instagram.com e devolve a URL canonica do perfil, ou null quando a entrada e
// invalida ou aponta para outro destino ou protocolo inseguro.
export function instagramUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const candidate = value.trim();
  if (!candidate) return null;

  if (/^https?:\/\//i.test(candidate)) {
    let parsed: URL;
    try {
      parsed = new URL(candidate);
    } catch {
      return null;
    }
    if (parsed.protocol !== "https:") return null;
    if (!INSTAGRAM_HOSTS.has(parsed.hostname.toLowerCase())) return null;
    const segment = parsed.pathname.replace(/^\/+/, "").split("/")[0];
    return instagramFromUsername(segment);
  }

  return instagramFromUsername(candidate.replace(/^@/, ""));
}

// Google Maps: aceita somente destinos legitimos do Google Maps em HTTPS e
// devolve a URL normalizada, ou null quando o endereco nao aponta para o Maps.
export function googleMapsUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const candidate = value.trim();
  if (!candidate) return null;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;

  const host = parsed.hostname.toLowerCase();
  if (MAPS_FULL_HOSTS.has(host)) {
    return parsed.toString();
  }
  if (MAPS_PATH_HOSTS.has(host) && parsed.pathname.toLowerCase().startsWith("/maps")) {
    return parsed.toString();
  }
  return null;
}

// Link de pesquisa do Google Maps montado a partir do endereco comercial ja
// cadastrado. Usado como alternativa quando nao ha um link personalizado.
// Retorna null quando nao ha endereco suficiente para montar um destino valido.
export function googleMapsSearchUrl(
  address: string | null | undefined
): string | null {
  const query = (address ?? "").trim();
  if (!query) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    query
  )}`;
}
