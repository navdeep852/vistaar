import React, { useState } from 'react';
import { 
  ArrowLeft, 
  Calendar, 
  Clock, 
  User, 
  Share2, 
  Check, 
  Tag, 
  ChevronRight, 
  Sparkles,
  BookOpen,
  ArrowRight
} from 'lucide-react';
import { SEOHead } from '../../components/public/SEOHead';
import { PublicHeader } from '../../components/public/PublicHeader';
import { PublicFooter } from '../../components/public/PublicFooter';
import { navigateTo } from '../../lib/publicRouter';
import { BLOG_POSTS, BlogPost } from '../../data/blogPosts';

interface PublicBlogPostViewProps {
  slug: string;
}

export const PublicBlogPostView: React.FC<PublicBlogPostViewProps> = ({ slug }) => {
  const [copied, setCopied] = useState(false);

  const post = BLOG_POSTS.find((p) => p.slug === slug);

  const handleNav = (path: string, e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    navigateTo(path);
  };

  const handleCopyLink = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!post) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans">
        <SEOHead
          title="Article Not Found | VISTAAR Blog"
          description="The requested business guide or article could not be found."
          canonicalPath={`/blog/${slug}`}
        />
        <PublicHeader />
        <main className="flex-1 flex items-center justify-center py-20 px-4">
          <div className="text-center max-w-md bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <BookOpen className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
              Article Not Found
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
              The article you are looking for does not exist or may have been moved to another section.
            </p>
            <a
              href="/blog"
              onClick={(e) => handleNav('/blog', e)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to All Articles</span>
            </a>
          </div>
        </main>
        <PublicFooter />
      </div>
    );
  }

  const relatedPosts = BLOG_POSTS.filter((p) => p.slug !== post.slug).slice(0, 2);

  const articleSchema = [
    {
      '@type': 'Article',
      headline: post.title,
      description: post.excerpt,
      author: {
        '@type': 'Organization',
        name: 'VISTAAR Technologies',
      },
      publisher: {
        '@type': 'Organization',
        name: 'VISTAAR Business OS',
        logo: {
          '@type': 'ImageObject',
          url: 'https://www.vistaarone.com/Vistaar_Icon_logo.png',
        },
      },
      datePublished: '2026-10-15',
      mainEntityOfPage: {
        '@type': 'WebPage',
        '@id': `https://www.vistaarone.com/blog/${post.slug}`,
      },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.vistaarone.com/' },
        { '@type': 'ListItem', position: 2, name: 'Blog', item: 'https://www.vistaarone.com/blog' },
        { '@type': 'ListItem', position: 3, name: post.title, item: `https://www.vistaarone.com/blog/${post.slug}` },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors selection:bg-blue-600 selection:text-white">
      <SEOHead
        title={`${post.title} | VISTAAR Knowledge Base`}
        description={post.excerpt}
        canonicalPath={`/blog/${post.slug}`}
        structuredData={articleSchema}
      />

      <PublicHeader />

      <main className="flex-1 py-12 sm:py-16">
        <article className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Breadcrumb Navigation */}
          <nav className="flex items-center gap-2 text-xs text-slate-500 mb-8 overflow-x-auto scrollbar-none">
            <a href="/" onClick={(e) => handleNav('/', e)} className="hover:text-blue-600 transition-colors">
              Home
            </a>
            <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
            <a href="/blog" onClick={(e) => handleNav('/blog', e)} className="hover:text-blue-600 transition-colors">
              Blog
            </a>
            <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
            <span className="text-slate-800 dark:text-slate-200 font-semibold truncate max-w-xs">
              {post.category}
            </span>
          </nav>

          {/* Article Header */}
          <header className="space-y-5 mb-10 pb-8 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900/60 text-blue-700 dark:text-blue-300 text-xs font-bold uppercase tracking-wider">
                {post.category}
              </span>
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <Clock className="w-3.5 h-3.5" />
                <span>{post.readTime}</span>
              </div>
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 dark:text-white tracking-tight leading-tight">
              {post.title}
            </h1>

            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed font-normal">
              {post.excerpt}
            </p>

            <div className="flex flex-wrap items-center justify-between gap-4 pt-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-xs">
                  {post.author[0]}
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white">
                    {post.author}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {post.authorRole} &bull; {post.publishedDate}
                  </div>
                </div>
              </div>

              <button
                onClick={handleCopyLink}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Share2 className="w-3.5 h-3.5" />}
                <span>{copied ? 'Link Copied' : 'Share Guide'}</span>
              </button>
            </div>
          </header>

          {/* Article Body Content */}
          <div 
            className="prose prose-slate dark:prose-invert max-w-none text-sm sm:text-base leading-relaxed space-y-6 [&>h2]:text-xl [&>h2]:font-bold [&>h2]:text-slate-900 [&>h2]:dark:text-white [&>h2]:mt-8 [&>h2]:mb-3 [&>p]:text-slate-700 [&>p]:dark:text-slate-300 [&>ul]:list-disc [&>ul]:pl-5 [&>ul]:space-y-2 [&>ul>li]:text-slate-700 [&>ul>li]:dark:text-slate-300"
            dangerouslySetInnerHTML={{ __html: post.contentHtml }}
          />

          {/* Tags */}
          <div className="mt-12 pt-6 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-400 mr-2 flex items-center gap-1">
              <Tag className="w-3 h-3" /> Tags:
            </span>
            {post.tags.map((t) => (
              <span
                key={t}
                className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-medium text-slate-600 dark:text-slate-400"
              >
                #{t}
              </span>
            ))}
          </div>

          {/* In-Article Product CTA Banner */}
          <div className="my-14 rounded-3xl bg-gradient-to-tr from-slate-900 to-blue-950 p-8 text-white border border-slate-800 shadow-xl">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="space-y-2 text-center sm:text-left">
                <div className="inline-flex items-center gap-1.5 text-blue-400 text-xs font-bold uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Experience VISTAAR Business OS</span>
                </div>
                <h3 className="text-xl font-bold">
                  Run Better. Grow Wider.
                </h3>
                <p className="text-xs text-slate-300 max-w-md">
                  Eliminate inventory loss, speed up counter billing, and manage customer credit in one high-reliability cloud system.
                </p>
              </div>
              <a
                href="/signup"
                onClick={(e) => handleNav('/signup', e)}
                className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs whitespace-nowrap shadow-lg shadow-blue-500/25 transition-all cursor-pointer"
              >
                Start 14-Day Free Trial
              </a>
            </div>
          </div>

          {/* Related Articles */}
          {relatedPosts.length > 0 && (
            <div className="pt-8 border-t border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6">
                Recommended Operating Guides
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {relatedPosts.map((rel) => (
                  <div
                    key={rel.slug}
                    onClick={(e) => handleNav(`/blog/${rel.slug}`, e)}
                    className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-500/40 hover:shadow-lg transition-all cursor-pointer group"
                  >
                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                      {rel.category}
                    </span>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors mt-1 line-clamp-2">
                      {rel.title}
                    </h4>
                    <p className="text-xs text-slate-500 line-clamp-2 mt-1">
                      {rel.excerpt}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </article>
      </main>

      <PublicFooter />
    </div>
  );
};
