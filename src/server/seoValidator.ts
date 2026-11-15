export interface SeoAuditCheck {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface SeoValidationResult {
  score: number;
  wordCountActual: number;
  duplicateScore: number;
  cannibalizationWarning: string | null;
  checks: SeoAuditCheck[];
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(
    a
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3)
  );
  const setB = new Set(
    b
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3)
  );
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const w of setA) {
    if (setB.has(w)) intersection++;
  }
  return Math.round((intersection / (setA.size + setB.size - intersection)) * 100);
}

export function validateArticleSeo(params: {
  articleId?: number;
  title: string;
  seoTitle: string;
  metaDescription: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  contentHtml: string;
  internalLinks: Array<{ url: string; anchor: string; valid?: boolean }>;
  externalLinks: Array<{ url: string; title: string; valid?: boolean }>;
  images: Array<{ url: string; alt: string }>;
  existingArticles: Array<{
    id: number;
    title: string;
    primaryKeyword: string;
    contentHtml: string;
  }>;
}): SeoValidationResult {
  const plainText = stripHtml(params.contentHtml);
  const words = plainText.split(/\s+/).filter(Boolean);
  const wordCountActual = words.length;
  const kwLower = params.primaryKeyword.trim().toLowerCase();

  const h2Count = (params.contentHtml.match(/<h2[\s>]/gi) || []).length;
  const h3Count = (params.contentHtml.match(/<h3[\s>]/gi) || []).length;
  const hasImgAlt =
    params.images.length > 0 &&
    params.images.every((img) => Boolean(img.alt && img.alt.trim().length >= 5));
  const hasPublicHttpsOrLocal =
    params.images.length === 0 ||
    params.images.every(
      (img) => img.url.startsWith('https://') || img.url.startsWith('/media/') || img.url.startsWith('/assets/')
    );

  // Check duplicate content & cannibalization against existing articles
  let maxDuplicate = 0;
  let cannibalizedTitle: string | null = null;
  for (const existing of params.existingArticles) {
    if (params.articleId && existing.id === params.articleId) continue;
    if (existing.primaryKeyword.trim().toLowerCase() === kwLower && kwLower.length > 0) {
      cannibalizedTitle = existing.title;
    }
    const sim = jaccardSimilarity(plainText.slice(0, 2500), stripHtml(existing.contentHtml).slice(0, 2500));
    if (sim > maxDuplicate) maxDuplicate = sim;
  }

  const invalidInternal = params.internalLinks.filter((l) => l.valid === false);
  const invalidExternal = params.externalLinks.filter((l) => l.valid === false);

  const checks: SeoAuditCheck[] = [
    {
      id: 'primary_keyword',
      label: 'Primary keyword defined & present in content',
      passed: kwLower.length >= 3 && plainText.toLowerCase().includes(kwLower),
      detail: kwLower.length >= 3 ? `Target: "${params.primaryKeyword}"` : 'Missing primary keyword',
    },
    {
      id: 'secondary_keywords',
      label: 'Supporting secondary keywords included',
      passed: params.secondaryKeywords.length >= 2,
      detail: `${params.secondaryKeywords.length} secondary keywords configured`,
    },
    {
      id: 'seo_title',
      label: 'Unique SEO title (35–68 chars)',
      passed: params.seoTitle.trim().length >= 35 && params.seoTitle.trim().length <= 68,
      detail: `${params.seoTitle.trim().length} characters`,
    },
    {
      id: 'meta_description',
      label: 'Descriptive meta description (110–165 chars)',
      passed: params.metaDescription.trim().length >= 110 && params.metaDescription.trim().length <= 165,
      detail: `${params.metaDescription.trim().length} characters`,
    },
    {
      id: 'headings',
      label: 'Structured H2 / H3 editorial hierarchy',
      passed: h2Count >= 3 && h3Count >= 1,
      detail: `${h2Count} H2 headings, ${h3Count} H3 subheadings`,
    },
    {
      id: 'word_count',
      label: 'Substantive editorial depth (600+ words)',
      passed: wordCountActual >= 600,
      detail: `${wordCountActual} words`,
    },
    {
      id: 'images',
      label: 'Relevant images with ALT attributes & valid URLs',
      passed: params.images.length > 0 && hasImgAlt && hasPublicHttpsOrLocal,
      detail:
        params.images.length > 0
          ? `${params.images.length} image(s) attached`
          : 'No images attached yet',
    },
    {
      id: 'internal_links',
      label: 'Verified internal TreeWalley links',
      passed: params.internalLinks.length >= 1 && invalidInternal.length === 0,
      detail: `${params.internalLinks.length} internal link(s), ${invalidInternal.length} broken`,
    },
    {
      id: 'external_links',
      label: 'Approved authoritative external references',
      passed: invalidExternal.length === 0,
      detail: `${params.externalLinks.length} reference(s), ${invalidExternal.length} broken`,
    },
    {
      id: 'duplicate_cannibalization',
      label: 'Originality & zero keyword cannibalization',
      passed: maxDuplicate < 45 && !cannibalizedTitle,
      detail: cannibalizedTitle
        ? `Keyword overlap with "${cannibalizedTitle}"`
        : `${maxDuplicate}% text overlap with existing drafts`,
    },
  ];

  const passedCount = checks.filter((c) => c.passed).length;
  const score = Math.round((passedCount / checks.length) * 100);

  return {
    score,
    wordCountActual,
    duplicateScore: maxDuplicate,
    cannibalizationWarning: cannibalizedTitle
      ? `Primary keyword "${params.primaryKeyword}" is already targeted by "${cannibalizedTitle}".`
      : null,
    checks,
  };
}
