/**
 * Normaliza a resposta de texto da IA para que possa ser interpretada como JSON.
 *
 * Modelos como o Gemini às vezes envolvem o JSON em cercas Markdown
 * (```json ... ```) ou adicionam texto explicativo antes/depois do conteúdo.
 * Removemos esses envelopes para que uma resposta válida do modelo nunca seja
 * transformada em erro pelo nosso próprio código.
 *
 * Nota: o regex usa `\s` (uma barra) para representar espaços em branco.
 * `\\s` em um literal de regex casaria uma barra invertida literal seguida de
 * "s", o que não limpa as cercas Markdown e faz uma resposta válida falhar.
 */
export function cleanJsonResponse(text: string): string {
  let value = text.trim();

  // Remove cercas Markdown, ex.: ```json\n{ ... }\n``` ou ```\n{ ... }\n```
  // `[a-zA-Z]*` consome qualquer marcador de linguagem (json, text, ...).
  const fenced = value.match(/```[a-zA-Z]*\s*([\s\S]*?)\s*```/);
  if (fenced) {
    value = fenced[1].trim();
  }

  // Se o conteúdo já é o próprio JSON, não há mais nada a fazer.
  if (value.startsWith("{") || value.startsWith("[")) {
    return value;
  }

  // Caso contrário, extrai o objeto/array JSON do meio de qualquer texto ao redor.
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start !== -1 && end > start) {
    return value.slice(start, end + 1);
  }

  return value;
}
