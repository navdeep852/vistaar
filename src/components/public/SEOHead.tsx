import { useEffect } from 'react';

export interface SEOHeadProps {
  title: string;
  description: string;
  canonicalPath?: string;
  ogType?: 'website' | 'article' | 'product';
  ogImage?: string;
  structuredData?: Record<string, any> | Record<string, any>[];
}

const PRODUCTION_ORIGIN = 'https://www.vistaarone.com';

export const SEOHead: React.FC<SEOHeadProps> = ({
  title,
  description,
  canonicalPath = '',
  ogType = 'website',
  ogImage = `${PRODUCTION_ORIGIN}/Vistaar_Logo_With_Name.png`,
  structuredData,
}) => {
  useEffect(() => {
    // 1. Update Title
    document.title = title;

    // 2. Helper to set or create meta tags
    const setMetaTag = (attr: string, key: string, content: string) => {
      let tag = document.querySelector(`meta[${attr}="${key}"]`);
      if (!tag) {
        tag = document.createElement('meta');
        tag.setAttribute(attr, key);
        document.head.appendChild(tag);
      }
      tag.setAttribute('content', content);
    };

    // 3. Helper to set or create link tags
    const setLinkTag = (rel: string, href: string) => {
      let link = document.querySelector(`link[rel="${rel}"]`);
      if (!link) {
        link = document.createElement('link');
        link.setAttribute('rel', rel);
        document.head.appendChild(link);
      }
      link.setAttribute('href', href);
    };

    // Standard Meta Description
    setMetaTag('name', 'description', description);

    // Canonical Tag
    const cleanPath = canonicalPath.startsWith('/') ? canonicalPath : `/${canonicalPath}`;
    const canonicalUrl = cleanPath === '/' ? `${PRODUCTION_ORIGIN}/` : `${PRODUCTION_ORIGIN}${cleanPath}`;
    setLinkTag('canonical', canonicalUrl);

    // Open Graph Tags
    setMetaTag('property', 'og:title', title);
    setMetaTag('property', 'og:description', description);
    setMetaTag('property', 'og:url', canonicalUrl);
    setMetaTag('property', 'og:type', ogType);
    setMetaTag('property', 'og:image', ogImage);
    setMetaTag('property', 'og:site_name', 'VISTAAR');

    // Twitter Tags
    setMetaTag('name', 'twitter:card', 'summary_large_image');
    setMetaTag('name', 'twitter:title', title);
    setMetaTag('name', 'twitter:description', description);
    setMetaTag('name', 'twitter:image', ogImage);

    // Structured Data (JSON-LD)
    const scriptId = 'vistaar-dynamic-jsonld';
    let scriptTag = document.getElementById(scriptId) as HTMLScriptElement | null;
    
    if (structuredData) {
      const serialized = JSON.stringify(
        Array.isArray(structuredData)
          ? { '@context': 'https://schema.org', '@graph': structuredData }
          : { '@context': 'https://schema.org', ...structuredData }
      );
      if (!scriptTag) {
        scriptTag = document.createElement('script');
        scriptTag.id = scriptId;
        scriptTag.type = 'application/ld+json';
        document.head.appendChild(scriptTag);
      }
      if (scriptTag.textContent !== serialized) {
        scriptTag.textContent = serialized;
      }
    } else if (scriptTag) {
      scriptTag.remove();
    }

    return () => {
      // Cleanup dynamically injected route schema if component unmounts
      const tag = document.getElementById(scriptId);
      if (tag) tag.remove();
    };
  }, [title, description, canonicalPath, ogType, ogImage, JSON.stringify(structuredData)]);

  return null;
};
