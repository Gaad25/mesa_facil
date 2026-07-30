import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mesa Certa — Copilot de Poker",
    short_name: "Mesa Certa",
    description:
      "Treinador e apoio à decisão para partidas presenciais de Texas Hold’em.",
    start_url: "/",
    display: "standalone",
    background_color: "#06110e",
    theme_color: "#071612",
    orientation: "portrait-primary",
    lang: "pt-BR",
    categories: ["education", "games", "utilities"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
