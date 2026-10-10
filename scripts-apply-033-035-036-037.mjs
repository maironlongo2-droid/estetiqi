// scripts-apply-033-035-036-037.mjs
//
// Alias de compatibilidade do utilitario de migrations desta etapa (033, 035,
// 036 e 037).
//
// O implementador canonico e `scripts-apply-033-035-036.mjs` (nome HISTORICO,
// mantido para que os comandos e as notas que ja o referenciam continuem
// funcionando). Este arquivo existe para que o nome do utilitario tambem
// reflita a migration 037.
//
// Nenhuma logica e duplicada: o modulo canonico e executado neste mesmo processo,
// com o MESMO process.argv e o MESMO ambiente, portanto todos os modos
// (--help, --status, preflight, --dry-run, --apply) se comportam exatamente
// igual, inclusive os codigos de saida e o texto de ajuda (que passa a exibir o
// nome pelo qual foi invocado).
//
// Exemplos:
//   node scripts-apply-033-035-036-037.mjs --help
//   node scripts-apply-033-035-036-037.mjs --status
//   node scripts-apply-033-035-036-037.mjs <033|035|036|037>

await import("./scripts-apply-033-035-036.mjs");
