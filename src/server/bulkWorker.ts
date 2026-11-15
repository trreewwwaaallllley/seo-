import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { articles, bulkJobs, externalReferences, internalLinks, mediaAssets } from '../db/schema.ts';
import { generateSeoArticle } from './gemini.ts';
import { validateArticleSeo } from './seoValidator.ts';
import { LANGUAGES_350 } from '../data/languages.ts';

const activeRunners = new Set<number>();

export async function startBulkJobRunner(jobId: number, userUid: string) {
  if (activeRunners.has(jobId)) return;
  activeRunners.add(jobId);

  try {
    const [job] = await db
      .select()
      .from(bulkJobs)
      .where(and(eq(bulkJobs.id, jobId), eq(bulkJobs.userUid, userUid)))
      .limit(1);
    if (!job || job.status === 'completed') return;

    const startedAt = job.startedAt || new Date();
    await db
      .update(bulkJobs)
      .set({ status: 'running', startedAt })
      .where(and(eq(bulkJobs.id, jobId), eq(bulkJobs.userUid, userUid)));

    const langObj = LANGUAGES_350.find((l) => l.code === job.languageCode);
    const reliabilityFlag = langObj?.reliability || 'Good';

    const userLinks = await db
      .select()
      .from(internalLinks)
      .where(eq(internalLinks.userUid, userUid))
      .limit(20);

    const userRefs = await db
      .select()
      .from(externalReferences)
      .where(eq(externalReferences.userUid, userUid))
      .limit(10);

    const userMedia = await db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.userUid, userUid))
      .limit(15);

    const topics = [...(job.topicsJson || [])];
    const concurrency = Math.max(1, Math.min(job.concurrency || 3, 5));
    let completed = topics.filter((t) => t.status === 'completed').length;
    let failed = topics.filter((t) => t.status === 'failed').length;

    const pendingIndices = topics
      .map((t, idx) => ({ t, idx }))
      .filter((x) => x.t.status !== 'completed');

    let cursor = 0;

    async function processNext() {
      while (cursor < pendingIndices.length) {
        const [latestJob] = await db
          .select({ status: bulkJobs.status })
          .from(bulkJobs)
          .where(and(eq(bulkJobs.id, jobId), eq(bulkJobs.userUid, userUid)))
          .limit(1);
        if (!latestJob || latestJob.status === 'paused') {
          return;
        }

        const item = pendingIndices[cursor++];
        if (!item) return;

        const topicEntry = topics[item.idx];
        topicEntry.status = 'running';

        let attempts = 0;
        let success = false;
        let lastErr = '';

        while (attempts < 2 && !success) {
          attempts++;
          try {
            const matchingImages = userMedia
              .filter(
                (m) =>
                  m.category.toLowerCase().includes(topicEntry.category.toLowerCase()) ||
                  topicEntry.category.toLowerCase().includes(m.category.toLowerCase())
              )
              .slice(0, 2);
            const fallbackImages = matchingImages.length ? matchingImages : userMedia.slice(0, 1);

            const generated = await generateSeoArticle({
              topic: topicEntry.topic,
              primaryKeyword: topicEntry.primaryKeyword,
              secondaryKeywords: [
                `${topicEntry.category} india`,
                `solid sheesham ${topicEntry.category.toLowerCase()}`,
              ],
              targetCountry: 'India',
              targetAudience: 'Indian homeowners seeking solid wood furniture',
              languageCode: job.languageCode,
              languageName: job.languageName,
              regionalVariation: langObj?.region || 'India',
              wordCount: 1000,
              mode: job.mode,
              writingStyle: job.writingStyle,
              blogCategory: topicEntry.category,
              productLinks: [
                'https://www.treewalley.com/',
                'https://www.amazon.in/stores/TreeWalley/page/1DC3D299-35DD-4738-8AB4-14CCC2956151',
              ],
              internalLinks: userLinks.slice(0, 4).map((l) => ({ url: l.url, title: l.title })),
              externalReferences: userRefs
                .filter((r) => r.approved)
                .slice(0, 2)
                .map((r) => ({ url: r.url, title: r.title, publisher: r.publisher })),
              selectedImages: fallbackImages.map((img) => ({
                url: img.webpUrl || img.publicUrl,
                alt: img.altText,
                caption: img.caption || undefined,
              })),
            });

            const existingArticles = await db
              .select({
                id: articles.id,
                title: articles.title,
                primaryKeyword: articles.primaryKeyword,
                contentHtml: articles.contentHtml,
              })
              .from(articles)
              .where(eq(articles.userUid, userUid));

            const attachedImages = fallbackImages.map((img, i) => ({
              url: img.webpUrl || img.publicUrl,
              alt: generated.imageAlts[i]?.alt || img.altText,
              caption: generated.imageAlts[i]?.caption || img.caption || '',
              width: img.width,
              height: img.height,
            }));

            const usedInternalLinks = userLinks.slice(0, 3).map((l) => ({
              url: l.url,
              anchor: l.title,
              valid: true,
            }));

            const usedExternalLinks = userRefs
              .filter((r) => r.approved)
              .slice(0, 2)
              .map((r) => ({
                url: r.url,
                title: r.title,
                valid: true,
              }));

            const validation = validateArticleSeo({
              title: generated.blogTitle,
              seoTitle: generated.seoTitle,
              metaDescription: generated.metaDescription,
              primaryKeyword: generated.localizedPrimaryKeyword || topicEntry.primaryKeyword,
              secondaryKeywords: generated.localizedSecondaryKeywords,
              contentHtml: generated.contentHtml,
              internalLinks: usedInternalLinks,
              externalLinks: usedExternalLinks,
              images: attachedImages,
              existingArticles,
            });

            const [savedArticle] = await db
              .insert(articles)
              .values({
                userUid,
                bulkJobId: jobId,
                title: generated.blogTitle,
                seoTitle: generated.seoTitle,
                slug: `${generated.slug}-${Date.now().toString(36).slice(-4)}`,
                metaDescription: generated.metaDescription,
                primaryKeyword: generated.localizedPrimaryKeyword || topicEntry.primaryKeyword,
                secondaryKeywordsJson: generated.localizedSecondaryKeywords,
                languageCode: job.languageCode,
                languageName: job.languageName,
                regionalVariation: langObj?.region || 'India',
                targetCountry: 'India',
                mode: job.mode,
                writingStyle: job.writingStyle,
                blogCategory: topicEntry.category,
                wordCountTarget: 1000,
                wordCountActual: validation.wordCountActual,
                contentHtml: generated.contentHtml,
                faqJson: generated.faq,
                internalLinksJson: usedInternalLinks,
                externalLinksJson: usedExternalLinks,
                featuredImageUrl: attachedImages[0]?.url || null,
                imagesJson: attachedImages,
                labelsJson: [topicEntry.category, job.languageName, 'TreeWalley'],
                seoScore: validation.score,
                seoAuditJson: { score: validation.score, checks: validation.checks },
                cannibalizationWarning: validation.cannibalizationWarning,
                duplicateScore: validation.duplicateScore,
                languageReliabilityFlag: reliabilityFlag,
                status: 'draft', // NEVER auto-publish bulk batches
              })
              .returning();

            topicEntry.status = 'completed';
            topicEntry.articleId = savedArticle.id;
            completed++;
            success = true;
          } catch (err: any) {
            lastErr = err?.message || 'AI generation failed';
            if (attempts < 2) {
              await new Promise((r) => setTimeout(r, 1500));
            }
          }
        }

        if (!success) {
          topicEntry.status = 'failed';
          topicEntry.error = lastErr;
          failed++;
        }

        const elapsedMinutes = Math.max((Date.now() - startedAt.getTime()) / 60000, 0.05);
        const measuredThroughput = Number((completed / elapsedMinutes).toFixed(2));

        await db
          .update(bulkJobs)
          .set({
            topicsJson: topics,
            completedCount: completed,
            failedCount: failed,
            throughputPerMin: measuredThroughput,
          })
          .where(and(eq(bulkJobs.id, jobId), eq(bulkJobs.userUid, userUid)));
      }
    }

    await Promise.all(Array.from({ length: concurrency }, () => processNext()));

    const [finalCheck] = await db
      .select({ status: bulkJobs.status })
      .from(bulkJobs)
      .where(and(eq(bulkJobs.id, jobId), eq(bulkJobs.userUid, userUid)))
      .limit(1);

    if (finalCheck && finalCheck.status !== 'paused') {
      const elapsedMinutes = Math.max((Date.now() - startedAt.getTime()) / 60000, 0.05);
      await db
        .update(bulkJobs)
        .set({
          status: completed === 0 && failed > 0 ? 'failed' : 'completed',
          finishedAt: new Date(),
          completedCount: completed,
          failedCount: failed,
          throughputPerMin: Number((completed / elapsedMinutes).toFixed(2)),
          topicsJson: topics,
        })
        .where(and(eq(bulkJobs.id, jobId), eq(bulkJobs.userUid, userUid)));
    }
  } catch (err: any) {
    await db
      .update(bulkJobs)
      .set({ status: 'failed', errorSummary: err?.message || 'Worker crashed unexpectedly' })
      .where(and(eq(bulkJobs.id, jobId), eq(bulkJobs.userUid, userUid)));
  } finally {
    activeRunners.delete(jobId);
  }
}
