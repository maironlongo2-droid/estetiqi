// Avatar único do cartão digital público (profissionais e logo/identidade).
//
// Um único componente controla: formato circular, recorte, fundo de fallback e o
// tamanho. A imagem nunca recebe borda, contorno ou anel próprios, e o recorte
// circular vem do contêiner (`.eq-avatar` em globals.css, com overflow hidden) —
// é isso que evita a moldura quadrada ao redor das fotos.
//
// Sem foto, o componente mostra as iniciais em um fundo coerente com o modelo e
// NUNCA renderiza uma imagem quebrada.

type AvatarSize = "sm" | "md" | "lg" | "xl";

const SIZE_CLASSES: Record<AvatarSize, string> = {
  sm: "eq-avatar--sm h-12 w-12",
  md: "eq-avatar--md h-16 w-16",
  lg: "eq-avatar--lg h-20 w-20 sm:h-24 sm:w-24",
  // Logo/identidade do cartão: um degrau acima da foto do profissional (96px no
  // celular, 112px a partir de sm) para dar presença à marca. As duas dimensões
  // são sempre declaradas juntas e .eq-avatar mantém `aspect-ratio: 1 / 1`, então
  // o elemento é sempre um círculo — nunca um retângulo ou quadrado.
  xl: "eq-avatar--xl h-24 w-24 sm:h-28 sm:w-28",
};

export function PublicAvatar({
  src,
  alt,
  name,
  size = "md",
  fit = "cover",
  className = "",
}: {
  src?: string | null;
  alt: string;
  name: string;
  size?: AvatarSize;
  fit?: "cover" | "contain";
  className?: string;
}) {
  const classes =
    `eq-avatar ${SIZE_CLASSES[size]} ${
      fit === "contain" ? "eq-avatar--contain" : ""
    } ${className}`.trim();
  const initial = (name ?? "").trim().charAt(0).toUpperCase();

  if (src) {
    return (
      <span className={classes}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} loading="lazy" decoding="async" />
      </span>
    );
  }

  return (
    <span className={classes} aria-hidden="true">
      {initial}
    </span>
  );
}
