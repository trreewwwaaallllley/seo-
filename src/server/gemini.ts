import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

export const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

export class GeminiApiFriendlyError extends Error {
  httpStatus: number;
  errorCode: string;
  isQuotaOrBilling: boolean;

  constructor(
    message: string,
    opts?: { httpStatus?: number; errorCode?: string; isQuotaOrBilling?: boolean }
  ) {
    super(message);
    this.name = 'GeminiApiFriendlyError';
    this.httpStatus = opts?.httpStatus || 502;
    this.errorCode = opts?.errorCode || 'gemini_error';
    this.isQuotaOrBilling = Boolean(opts?.isQuotaOrBilling);
  }
}

export function parseGeminiApiError(err: unknown): GeminiApiFriendlyError {
  if (err instanceof GeminiApiFriendlyError) return err;

  const rawMsg = err instanceof Error ? err.message : String(err || 'Gemini request failed');
  let parsedCode: number | undefined = (err as any)?.status || (err as any)?.code;
  let parsedStatus = '';
  let parsedMessage = rawMsg;

  try {
    const jsonMatch = rawMsg.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const obj = JSON.parse(jsonMatch[0]);
      const inner = obj?.error || obj;
      if (typeof inner?.code === 'number') parsedCode = inner.code;
      if (typeof inner?.status === 'string') parsedStatus = inner.status;
      if (typeof inner?.message === 'string') parsedMessage = inner.message;
    }
  } catch {
    // Non-JSON error message; continue with string analysis
  }

  const lower = `${parsedMessage} ${parsedStatus} ${rawMsg}`.toLowerCase();

  if (parsedCode === 402 || lower.includes('prepayment credits are depleted') || lower.includes('billing#prepay')) {
    return new GeminiApiFriendlyError(
      'Gemini API prepayment credits on the attached Google Cloud project are depleted (HTTP 402). Select a free-tier API key in Settings > Secrets or manage billing at https://ai.studio/projects.',
      { httpStatus: 402, errorCode: 'PREPAYMENT_CREDITS_DEPLETED', isQuotaOrBilling: true }
    );
  }

  if (parsedCode === 429 || lower.includes('resource_exhausted') || lower.includes('quota')) {
    return new GeminiApiFriendlyError(
      'Gemini API free-tier quota or rate limit was reached (HTTP 429). Wait briefly or use a free-tier project key in Settings > Secrets.',
      { httpStatus: 429, errorCode: 'RESOURCE_EXHAUSTED', isQuotaOrBilling: true }
    );
  }

  if (parsedCode === 403 || parsedCode === 400 || lower.includes('api_key_invalid') || lower.includes('permission_denied')) {
    return new GeminiApiFriendlyError(
      'Gemini API key permission denied or invalid. Verify your GEMINI_API_KEY in Settings > Secrets.',
      { httpStatus: parsedCode || 403, errorCode: 'GEMINI_KEY_ERROR', isQuotaOrBilling: false }
    );
  }

  return new GeminiApiFriendlyError(parsedMessage.slice(0, 320), {
    httpStatus: typeof parsedCode === 'number' && parsedCode >= 400 ? parsedCode : 502,
    errorCode: parsedStatus || 'GEMINI_ERROR',
    isQuotaOrBilling: false,
  });
}

async function generateTextWithFreeFallback(params: {
  contents: any;
  config?: Record<string, any>;
}) {
  const candidates: Array<{ model: string; thinkingLevel: ThinkingLevel }> = [
    { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW },
    { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL },
  ];

  let lastParsed: GeminiApiFriendlyError | null = null;
  for (const cand of candidates) {
    try {
      const mergedConfig = {
        ...(params.config || {}),
        thinkingConfig: { thinkingLevel: cand.thinkingLevel },
      };
      return await ai.models.generateContent({
        model: cand.model,
        contents: params.contents,
        config: mergedConfig,
      });
    } catch (err) {
      lastParsed = parseGeminiApiError(err);
      // Try lighter free model if billing/quota/availability issue occurs on primary
      if (
        lastParsed.isQuotaOrBilling ||
        lastParsed.httpStatus === 404 ||
        lastParsed.httpStatus === 503
      ) {
        continue;
      }
      throw lastParsed;
    }
  }

  throw lastParsed || new GeminiApiFriendlyError('Gemini generation failed.');
}

export interface ArticleGenerationInput {
  topic: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  targetCountry: string;
  targetAudience: string;
  languageCode: string;
  languageName: string;
  regionalVariation: string;
  wordCount: number;
  mode: string;
  writingStyle: string;
  blogCategory: string;
  productLinks: string[];
  internalLinks: Array<{ url: string; title: string }>;
  externalReferences: Array<{ url: string; title: string; publisher: string }>;
  selectedImages: Array<{ url: string; alt: string; caption?: string }>;
}

export interface GeneratedArticlePayload {
  seoTitle: string;
  blogTitle: string;
  metaDescription: string;
  slug: string;
  localizedPrimaryKeyword: string;
  localizedSecondaryKeywords: string[];
  contentHtml: string;
  faq: Array<{ question: string; answer: string }>;
  relatedArticleIdeas: string[];
  imageAlts: Array<{ url: string; alt: string; caption: string }>;
}

export async function generateSeoArticle(
  input: ArticleGenerationInput
): Promise<GeneratedArticlePayload> {
  const imageContext = input.selectedImages.length
    ? input.selectedImages
        .map((img, i) => `Image ${i + 1}: URL="${img.url}", Alt="${img.alt}", Caption="${img.caption || ''}"`)
        .join('\n')
    : 'No images attached yet; place clean semantic figure placeholders only if URLs are provided.';

  const internalLinksContext = input.internalLinks.length
    ? input.internalLinks.map((l) => `- ${l.title} (${l.url})`).join('\n')
    : '- TreeWalley Furniture (https://www.treewalley.com/)\n- TreeWalley Amazon Store (https://www.amazon.in/stores/TreeWalley/page/1DC3D299-35DD-4738-8AB4-14CCC2956151)';

  const externalRefsContext = input.externalReferences.length
    ? input.externalReferences.map((r) => `- ${r.title} by ${r.publisher} (${r.url})`).join('\n')
    : '- Bureau of Indian Standards (https://www.bis.gov.in/)';

  const systemInstruction = `You are the Senior Editorial Director & Furniture Domain Specialist for TreeWalley Furniture (https://www.treewalley.com), a premier Indian solid wood furniture brand specializing in Sheesham wood beds, king & queen size beds, wooden wardrobes & almari, coffee tables, cabinets, sideboards, dining tables, and TV units.

CRITICAL EDITORIAL STANDARDS:
- Write naturally like an authoritative interior design & woodworking publication (such as Architectural Digest India or a master timber craft journal).
- NEVER use clichéd AI phrases ("In today's fast-paced world", "Look no further", "Elevate your space", "game-changer", "testament to", "delve into").
- NEVER stuff keywords artificially. Integrate the primary keyword and secondary keywords organically.
- NEVER invent product specs, fake warranties, fake awards, or unverified claims. Only reference real TreeWalley URLs provided below and real authoritative external URLs provided below.
- Do NOT include any internal SEO dashboard metadata or scores in the article HTML.
- MULTILINGUAL LOCALIZATION: Write natively in ${input.languageName} (${input.languageCode}) for ${input.targetCountry} (${input.regionalVariation}). Do NOT translate English search phrases literally if local buyers use native furniture terminology (for example, "almari" vs "wardrobe", "palang" / "diwan" / "sheesham lakdi ka bed" in Hindi/regional markets). Translate the SEO Title, Blog Title, Meta Description, URL Slug (transliterated/URL-safe), and Image Alt Text naturally into ${input.languageName}.
- Target length: approximately ${input.wordCount} words.
- Format \`contentHtml\` with semantic HTML5: an engaging <p> introduction, structured <h2> and <h3> subheadings, scannable bullet lists where genuinely helpful, product recommendation callouts linking to the verified TreeWalley URLs, natural placement of the provided <img> tags wrapped in <figure> with <figcaption> and localized alt attributes, an FAQ section, and a thoughtful conclusion.`;

  const prompt = `Create a complete ${input.mode} article in a ${input.writingStyle} voice.

Topic: ${input.topic}
Primary Keyword: ${input.primaryKeyword}
Secondary Keywords: ${input.secondaryKeywords.join(', ') || 'None specified'}
Category: ${input.blogCategory}
Target Country: ${input.targetCountry}
Target Audience: ${input.targetAudience}
Language: ${input.languageName} (${input.languageCode})

Verified Internal Links (ONLY use these exact URLs, do not invent URLs):
${internalLinksContext}

Approved Product / Amazon Store Links:
${input.productLinks.join('\n') || 'https://www.treewalley.com/\nhttps://www.amazon.in/stores/TreeWalley/page/1DC3D299-35DD-4738-8AB4-14CCC2956151'}

Approved Authoritative External References (ONLY use these exact URLs):
${externalRefsContext}

Available Images to Embed Inside contentHtml:
${imageContext}`;

  const response = await generateTextWithFreeFallback({
    contents: prompt,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          seoTitle: { type: Type.STRING, description: 'Concise 50-60 char SEO meta title tag.' },
          blogTitle: { type: Type.STRING, description: 'Editorial H1 headline for the blog post.' },
          metaDescription: { type: Type.STRING, description: '140-160 character search meta description.' },
          slug: { type: Type.STRING, description: 'Lowercase hyphenated URL-safe SEO slug.' },
          localizedPrimaryKeyword: { type: Type.STRING },
          localizedSecondaryKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
          contentHtml: {
            type: Type.STRING,
            description: 'Complete semantic HTML article body with H2, H3, paragraphs, figures with provided images, verified links, and conclusion.',
          },
          faq: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING },
                answer: { type: Type.STRING },
              },
              required: ['question', 'answer'],
            },
          },
          relatedArticleIdeas: { type: Type.ARRAY, items: { type: Type.STRING } },
          imageAlts: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                url: { type: Type.STRING },
                alt: { type: Type.STRING },
                caption: { type: Type.STRING },
              },
              required: ['url', 'alt', 'caption'],
            },
          },
        },
        required: [
          'seoTitle',
          'blogTitle',
          'metaDescription',
          'slug',
          'localizedPrimaryKeyword',
          'localizedSecondaryKeywords',
          'contentHtml',
          'faq',
          'relatedArticleIdeas',
          'imageAlts',
        ],
      },
    },
  });

  const text = (response.text || '{}').trim();
  return JSON.parse(text) as GeneratedArticlePayload;
}

export async function analyzeKeywordExpansion(params: {
  seed: string;
  searchType: string;
  country: string;
  region: string;
  language: string;
}) {
  try {
    const response = await generateTextWithFreeFallback({
      contents: `Analyze SEO keyword opportunities for TreeWalley Furniture (Indian solid Sheesham wood furniture brand: beds, king/queen beds, wardrobes, almari, coffee tables, cabinets, sideboards, dining tables, TV units).
Input Query: "${params.seed}" (Input Type: ${params.searchType})
Target Country: ${params.country}, Region: ${params.region}, Language: ${params.language}.

IMPORTANT DATA HONESTY RULE:
- Do NOT fabricate Google Ads search volume numbers or Search Console impressions/clicks.
- Provide semantic intent classification, culturally natural localized/regional search phrasing, related keywords, long-tail keywords, and editorial blog topic suggestions.`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            keywords: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  keyword: { type: Type.STRING },
                  commercialIntent: { type: Type.STRING, description: 'High, Medium, or Low commercial buyer intent' },
                  informationalIntent: { type: Type.STRING, description: 'High, Medium, or Low research intent' },
                  relatedKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
                  longTailKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
                  suggestedTopic: { type: Type.STRING },
                  relevanceScore: { type: Type.INTEGER, description: '1-100 relevance to TreeWalley solid wood catalog' },
                },
                required: [
                  'keyword',
                  'commercialIntent',
                  'informationalIntent',
                  'relatedKeywords',
                  'longTailKeywords',
                  'suggestedTopic',
                  'relevanceScore',
                ],
              },
            },
          },
          required: ['keywords'],
        },
      },
    });

    const parsed = JSON.parse((response.text || '{"keywords":[]}').trim());
    return parsed.keywords as Array<{
      keyword: string;
      commercialIntent: string;
      informationalIntent: string;
      relatedKeywords: string[];
      longTailKeywords: string[];
      suggestedTopic: string;
      relevanceScore: number;
    }>;
  } catch (err) {
    const parsedErr = parseGeminiApiError(err);
    if (!parsedErr.isQuotaOrBilling) throw parsedErr;

    const cleanSeed = params.seed.replace(/^https?:\/\/[^/]+\/?/i, '').replace(/[-_/]+/g, ' ').trim() || 'solid wood furniture';
    const baseLower = cleanSeed.toLowerCase();
    return [
      {
        keyword: baseLower,
        commercialIntent: 'High',
        informationalIntent: 'Medium',
        relatedKeywords: [`sheesham ${baseLower}`, `${baseLower} online india`, `solid wood ${baseLower}`],
        longTailKeywords: [`best ${baseLower} for indian homes`, `solid sheesham ${baseLower} buying guide`],
        suggestedTopic: `Complete Solid Sheesham Wood ${cleanSeed} Buying Guide for ${params.country} Homes`,
        relevanceScore: 92,
      },
      {
        keyword: `sheesham ${baseLower} price india`,
        commercialIntent: 'High',
        informationalIntent: 'Low',
        relatedKeywords: [`${baseLower} treewalley`, `handcrafted ${baseLower}`, `${baseLower} wooden finish`],
        longTailKeywords: [`buy ${baseLower} in ${params.region.toLowerCase()}`, `seasoned sheesham ${baseLower} durability`],
        suggestedTopic: `How to Compare Craftsmanship & Timber Seasoning When Buying ${cleanSeed}`,
        relevanceScore: 86,
      },
      {
        keyword: `${baseLower} care and maintenance guide`,
        commercialIntent: 'Low',
        informationalIntent: 'High',
        relatedKeywords: [`monsoon care ${baseLower}`, `sheesham wood polish`, `prevent wood warping`],
        longTailKeywords: [`how to protect ${baseLower} in humid weather`, `natural oil vs melamine finish ${baseLower}`],
        suggestedTopic: `Monsoon & Year-Round Care Guide for Solid Wood ${cleanSeed}`,
        relevanceScore: 80,
      },
    ];
  }
}

export async function generateTrendTopics(params: {
  category: string;
  risingQueries: string[];
  country: string;
}) {
  try {
    const response = await generateTextWithFreeFallback({
      contents: `Based on these furniture trend signals for TreeWalley Furniture in ${params.country}:
Category: ${params.category}
Rising Queries: ${params.risingQueries.join(', ') || params.category}

Recommend 5 high-intent editorial blog topics and 1 brief seasonal observation grounded strictly in furniture buying cycles in India (wedding season, monsoon wood care, Diwali home refresh, summer move-ins).`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            topics: { type: Type.ARRAY, items: { type: Type.STRING } },
            seasonalNote: { type: Type.STRING },
          },
          required: ['topics', 'seasonalNote'],
        },
      },
    });
    return JSON.parse((response.text || '{"topics":[],"seasonalNote":""}').trim()) as {
      topics: string[];
      seasonalNote: string;
    };
  } catch (err) {
    const parsedErr = parseGeminiApiError(err);
    if (!parsedErr.isQuotaOrBilling) throw parsedErr;

    const topRising = params.risingQueries.slice(0, 3);
    return {
      topics: [
        `Complete ${params.category} Buying Guide for ${params.country} Homes`,
        ...topRising.map((q) => `What Homeowners Search About "${q}" Before Buying Solid Wood`),
        `Solid Sheesham ${params.category}: Joinery, Storage & Seasonal Timber Care`,
      ].slice(0, 5),
      seasonalNote: `Topics generated directly from your imported CSV trend signals for ${params.category} (free fallback mode).`,
    };
  }
}

export async function generateAuditSummaryAndPlan(contextJson: string) {
  try {
    const response = await generateTextWithFreeFallback({
      contents: `You are the Principal SEO Strategist for TreeWalley Furniture. Review this factual snapshot of Search Console metrics, indexing status, internal link health, image optimization status, and published articles. Write a concise, factual Executive Summary, 5 concrete Next Month Content Plan topics, and 6 prioritized Recommended Improvements. Never invent metrics that are absent from the input.\n\nData:\n${contextJson}`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            executiveSummary: { type: Type.STRING },
            nextMonthContentPlan: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  targetKeyword: { type: Type.STRING },
                  category: { type: Type.STRING },
                  priority: { type: Type.STRING },
                },
                required: ['title', 'targetKeyword', 'category', 'priority'],
              },
            },
            recommendedImprovements: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  area: { type: Type.STRING },
                  recommendation: { type: Type.STRING },
                  impact: { type: Type.STRING },
                },
                required: ['area', 'recommendation', 'impact'],
              },
            },
          },
          required: ['executiveSummary', 'nextMonthContentPlan', 'recommendedImprovements'],
        },
      },
    });
    return JSON.parse((response.text || '{}').trim());
  } catch (err) {
    const parsedErr = parseGeminiApiError(err);
    if (!parsedErr.isQuotaOrBilling) throw parsedErr;

    const ctx = (() => {
      try {
        return JSON.parse(contextJson);
      } catch {
        return {};
      }
    })();

    const org = typeof ctx.organicPerformance === 'object' && ctx.organicPerformance ? ctx.organicPerformance : null;
    const summary = org
      ? `Factual Audit for ${ctx.reportMonth || 'current month'}: ${org.clicks} Search Console clicks across ${org.impressions} impressions (${org.avgCtr}% CTR, avg position ${org.avgPosition}). Tracked ${ctx.trackedKeywordsCount || 0} keywords, ${ctx.articlesTotal || 0} articles (${ctx.publishedArticlesCount || 0} published), ${ctx.brokenLinksCount || 0} broken internal links, and ${ctx.notIndexedUrlsCount || 0} non-indexed inspected URLs.`
      : `Factual Audit for ${ctx.reportMonth || 'current month'}: ${ctx.articlesTotal || 0} articles (${ctx.publishedArticlesCount || 0} published), ${ctx.trackedKeywordsCount || 0} keywords, ${ctx.internalLinksCount || 0} internal links (${ctx.brokenLinksCount || 0} broken), and ${ctx.mediaCount || 0} media assets. Sync Google Search Console in Overview to include live click & impression telemetry.`;

    return {
      executiveSummary: summary,
      nextMonthContentPlan: [
        {
          title: 'Solid Sheesham Wood King vs Queen Bed Size Guide for Indian Bedrooms',
          targetKeyword: 'sheesham wood king size bed india',
          category: 'King size beds',
          priority: 'High',
        },
        {
          title: 'How to Choose a Termite-Resistant Solid Wood Wardrobe (Almari)',
          targetKeyword: 'solid wood almari wardrobe india',
          category: 'Wooden wardrobes',
          priority: 'High',
        },
        {
          title: 'Coffee Table Proportions for Compact & Spacious Living Rooms',
          targetKeyword: 'solid wood coffee table living room',
          category: 'Coffee tables',
          priority: 'Medium',
        },
      ],
      recommendedImprovements: [
        {
          area: 'Search Console & Indexing',
          recommendation: org
            ? `Inspect and submit ${ctx.notIndexedUrlsCount || 0} unindexed URL(s) in Index Monitor.`
            : 'Authorize Google Search Console in Google Connections and run Sync in Overview.',
          impact: 'High',
        },
        {
          area: 'Internal Link Hygiene',
          recommendation:
            (ctx.brokenLinksCount || 0) > 0
              ? `Repair or remove ${ctx.brokenLinksCount} broken internal link(s) detected in Internal Links.`
              : 'Continue crawling your XML sitemap weekly to keep product links verified.',
          impact: 'High',
        },
        {
          area: 'Image SEO & WebP',
          recommendation:
            (ctx.unoptimizedImagesCount || 0) > 0
              ? `Add complete ALT text and WebP versions for ${ctx.unoptimizedImagesCount} media asset(s).`
              : 'All tracked media assets have ALT text; keep attaching WebP images to new drafts.',
          impact: 'Medium',
        },
      ],
    };
  }
}

export async function generateImageMetadata(params: {
  originalName: string;
  category: string;
  isTreeWalleyProduct: boolean;
}) {
  const response = await generateTextWithFreeFallback({
    contents: `Generate an SEO-friendly filename (lowercase hyphenated, ending in .webp), descriptive accessible ALT text (under 125 chars), and short editorial caption for a TreeWalley Furniture image.
Original filename: ${params.originalName}
Category: ${params.category}
TreeWalley authentic product photo: ${params.isTreeWalleyProduct ? 'Yes' : 'No (generic solid wood inspiration)'}`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          seoFilename: { type: Type.STRING },
          altText: { type: Type.STRING },
          caption: { type: Type.STRING },
        },
        required: ['seoFilename', 'altText', 'caption'],
      },
    },
  });
  return JSON.parse((response.text || '{}').trim()) as {
    seoFilename: string;
    altText: string;
    caption: string;
  };
}

export async function generateInspirationImage(prompt: string): Promise<{ dataBase64: string; mimeType: string }> {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite-image',
      contents: {
        parts: [
          {
            text: `${prompt}. Authentic Indian solid wood interior editorial photography, warm natural light, no brand logos or watermarks.`,
          },
        ],
      },
      config: {
        imageConfig: {
          aspectRatio: '4:3',
        },
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData?.data) {
        return {
          dataBase64: part.inlineData.data,
          mimeType: part.inlineData.mimeType || 'image/png',
        };
      }
    }
    throw new Error('Model did not return an image part.');
  } catch (err) {
    const parsed = parseGeminiApiError(err);
    if (parsed.isQuotaOrBilling) {
      throw new GeminiApiFriendlyError(
        'AI Image Generation requires a billing-enabled Gemini API key with available credits (gemini-3.1-flash-lite-image). Uploading real TreeWalley product photos for WebP conversion and SEO naming remains 100% free.',
        { httpStatus: parsed.httpStatus, errorCode: parsed.errorCode, isQuotaOrBilling: true }
      );
    }
    throw parsed;
  }
}
