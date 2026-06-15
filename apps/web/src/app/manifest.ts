import type { MetadataRoute } from "next";
import { uiColors } from "@mi-banquito/ui";

const themeColor = uiColors.primary;

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mi Banquito",
    short_name: "Mi Banquito",
    id: "/",
    start_url: "/",
    display: "standalone",
    background_color: "#F8F4E9",
    theme_color: themeColor,
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
