// Marca do EstetiQI: um sparkle esmeralda que representa beleza + organização.
// Mantém a identidade consistente com o ícone do PWA (public/icon.svg) e com a
// logo exibida no cabeçalho do app e na landing page.
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      className={className}
      role="img"
      aria-label="EstetiQI"
      focusable="false"
    >
      <path
        d="M256 88C268 168 344 244 424 256C344 268 268 344 256 424C244 344 168 268 88 256C168 244 244 168 256 88Z"
        fill="#0f766e"
      />
      <circle cx="372" cy="150" r="26" fill="#34d399" />
    </svg>
  );
}
