import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

export const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

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

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
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
  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Analyze SEO keyword opportunities for TreeWalley Furniture (Indian solid Sheesham wood furniture brand: beds, king/queen beds, wardrobes, almari, coffee tables, cabinets, sideboards, dining tables, TV units).
Input Query: "${params.seed}" (Input Type: ${params.searchType})
Target Country: ${params.country}, Region: ${params.region}, Language: ${params.language}.

IMPORTANT DATA HONESTY RULE:
- Do NOT fabricate Google Ads search volume numbers or Search Console impressions/clicks.
- Provide semantic intent classification, culturally natural localized/regional search phrasing, related keywords, long-tail keywords, and editorial blog topic suggestions.`,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
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
}

export async function generateTrendTopics(params: {
  category: string;
  risingQueries: string[];
  country: string;
}) {
  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Based on these furniture trend signals for TreeWalley Furniture in ${params.country}:
Category: ${params.category}
Rising Queries: ${params.risingQueries.join(', ') || params.category}

Recommend 5 high-intent editorial blog topics and 1 brief seasonal observation grounded strictly in furniture buying cycles in India (wedding season, monsoon wood care, Diwali home refresh, summer move-ins).`,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
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
}

export async function generateAuditSummaryAndPlan(contextJson: string) {
  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `You are the Principal SEO Strategist for TreeWalley Furniture. Review this factual snapshot of Search Console metrics, indexing status, internal link health, image optimization status, and published articles. Write a concise, factual Executive Summary, 5 concrete Next Month Content Plan topics, and 6 prioritized Recommended Improvements. Never invent metrics that are absent from the input.\n\nData:\n${contextJson}`,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
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
}

export async function generateImageMetadata(params: {
  originalName: string;
  category: string;
  isTreeWalleyProduct: boolean;
}) {
  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Generate an SEO-friendly filename (lowercase hyphenated, ending in .webp), descriptive accessible ALT text (under 125 chars), and short editorial caption for a TreeWalley Furniture image.
Original filename: ${params.originalName}
Category: ${params.category}
TreeWalley authentic product photo: ${params.isTreeWalleyProduct ? 'Yes' : 'No (generic solid wood inspiration)'}`,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
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
}
