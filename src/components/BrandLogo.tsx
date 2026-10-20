import React from 'react';

interface BrandLogoProps {
  size: number;
  title?: string; // si se da, el logo se anuncia como imagen; si no, es decorativo
}

// Logo de ITPocket: un equipo con su luz verde asomándose de un bolsillo con costura naranja.
// Tiene 3 versiones con la misma silueta para que se entienda en cualquier tamaño:
// grande (≥96 px) con costura fina y dos ranuras, mediana (36–95 px) con una ranura y costura
// gruesa, y chica (<36 px) sin ranuras y con el hilo continuo. Los íconos de public/icons
// (instalación, iPhone, pestaña) son las mismas figuras.
export const BrandLogo: React.FC<BrandLogoProps> = ({ size, title }) => {
  const a11y = title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true as const };
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} {...a11y} style={{ display: 'block', flexShrink: 0 }}>
      <rect width="100" height="100" rx="22" fill="#1C1F26" />
      {size >= 36 ? (
        <>
          <rect x="29" y="13" width="42" height="50" rx="8" fill="#F5A524" />
          {size >= 96 ? (
            <>
              <rect x="36" y="21" width="28" height="5" rx="2.5" fill="#1C1F26" />
              <rect x="36" y="30" width="28" height="5" rx="2.5" fill="#1C1F26" />
              <circle cx="50" cy="42" r="4.6" fill="#1C1F26" />
              <circle cx="50" cy="42" r="2.8" fill="#34D399" />
              <path d="M17 49H83V67C83 80 68 86 50 90C32 86 17 80 17 67Z" fill="#3A4150" />
              <path d="M23 55H77V66C77 76 65 81 50 84C35 81 23 76 23 66Z" fill="none" stroke="#F5A524" strokeWidth="2.4" strokeDasharray="4 3" />
            </>
          ) : (
            <>
              <rect x="36" y="22" width="28" height="6" rx="3" fill="#1C1F26" />
              <circle cx="50" cy="39" r="5.2" fill="#1C1F26" />
              <circle cx="50" cy="39" r="3.2" fill="#34D399" />
              <path d="M17 49H83V67C83 80 68 86 50 90C32 86 17 80 17 67Z" fill="#3A4150" />
              <path d="M24 56H76V66C76 75 65 80 50 83C35 80 24 75 24 66Z" fill="none" stroke="#F5A524" strokeWidth="3.4" strokeDasharray="6 4" />
            </>
          )}
        </>
      ) : (
        <>
          <rect x="27" y="12" width="46" height="52" rx="9" fill="#F5A524" />
          <circle cx="50" cy="31" r="7" fill="#1C1F26" />
          <circle cx="50" cy="31" r="4.3" fill="#34D399" />
          <path d="M15 49H85V67C85 81 69 87 50 91C31 87 15 81 15 67Z" fill="#3A4150" />
          <path d="M23 57H77V66C77 76 65 81 50 84C35 81 23 76 23 66Z" fill="none" stroke="#F5A524" strokeWidth="5" />
        </>
      )}
    </svg>
  );
};

// Nombre de la app: "IT" en ámbar y "Pocket" (estilos .brand-wordmark en index.css)
export const BrandWordmark: React.FC = () => (
  <span className="brand-wordmark"><b>IT</b><span>Pocket</span></span>
);
