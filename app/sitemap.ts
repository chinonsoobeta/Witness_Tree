import type { MetadataRoute } from "next";
import { PUBLIC_LOCALE_ROUTE_PAIRS, SITE_ORIGIN } from "@/lib/site-metadata";

const absolute = (path: string) => `${SITE_ORIGIN}${path}`;

export default function sitemap(): MetadataRoute.Sitemap {
  const gateway: MetadataRoute.Sitemap[number] = {
    url: SITE_ORIGIN,
    alternates: {
      languages: {
        en: absolute("/en"),
        fr: absolute("/fr"),
        "x-default": SITE_ORIGIN,
      },
    },
  };

  return [
    gateway,
    ...PUBLIC_LOCALE_ROUTE_PAIRS.flatMap((paths) => {
      const languages = { en: absolute(paths.en), fr: absolute(paths.fr) };
      return [
        { url: languages.en, alternates: { languages } },
        { url: languages.fr, alternates: { languages } },
      ];
    }),
  ];
}
