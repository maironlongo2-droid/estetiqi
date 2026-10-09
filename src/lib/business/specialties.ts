// Opcoes de profissao ou especialidade principal das profissionais.
//
// A area de atuacao identifica a colaboradora no cartao publico e na selecao de
// profissionais, e e independente dos procedimentos que ela realiza (cadastrados
// separadamente). A lista inicial cobre os segmentos de estetica e beleza mais
// comuns; "Outra" permite informar uma especialidade personalizada.
export const SPECIALTY_OPTIONS: string[] = [
  "Manicure",
  "Pedicure",
  "Depiladora",
  "Esteticista",
  "Designer de sobrancelhas",
  "Cabeleireira",
  "Maquiadora",
  "Lash designer",
  "Massoterapeuta",
  "Micropigmentadora",
];

// Valor da opcao que libera o campo de especialidade personalizada.
export const SPECIALTY_OTHER = "Outra";

// Limite alinhado a coluna `professionals.specialty VARCHAR(80)`.
export const SPECIALTY_MAX_LENGTH = 80;
