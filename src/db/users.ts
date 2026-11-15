import { eq } from 'drizzle-orm';
import { db } from './index.ts';
import {
  activityLogs,
  adminSettings,
  articles,
  auditReports,
  bulkJobs,
  externalReferences,
  gscSnapshots,
  indexInspections,
  internalLinks,
  keywords,
  mediaAssets,
  oauthConnections,
  publishingLogs,
  rankHistory,
  trendSnapshots,
  users,
} from './schema.ts';

const DEFAULT_ALLOWLIST_EMAIL = (process.env.ADMIN_ALLOWLIST_EMAIL || 'mrramsain03@gmail.com').toLowerCase();

export async function getOrCreateAdminUser(
  uid: string,
  email: string,
  displayName?: string,
  photoUrl?: string
) {
  try {
    const normalizedEmail = email.toLowerCase();
    if (normalizedEmail !== DEFAULT_ALLOWLIST_EMAIL) {
      throw new Error(`ACCESS_DENIED: ${email} is not on the single-administrator allowlist.`);
    }

    const existingSettings = await db
      .select()
      .from(adminSettings)
      .where(eq(adminSettings.userUid, uid))
      .limit(1);
    const allowlist = (existingSettings[0]?.allowlistedEmail || DEFAULT_ALLOWLIST_EMAIL).toLowerCase();

    if (normalizedEmail !== allowlist) {
      throw new Error(`ACCESS_DENIED: ${email} is not on the single-administrator allowlist.`);
    }

    const [user] = await db
      .insert(users)
      .values({
        uid,
        email: normalizedEmail,
        displayName: displayName || 'TreeWalley Admin',
        photoUrl: photoUrl || null,
        role: 'admin',
        lastLoginAt: new Date(),
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email: normalizedEmail,
          displayName: displayName || 'TreeWalley Admin',
          photoUrl: photoUrl || null,
          lastLoginAt: new Date(),
        },
      })
      .returning();

    await db
      .insert(adminSettings)
      .values({
        userUid: uid,
        allowlistedEmail: allowlist,
      })
      .onConflictDoNothing({ target: adminSettings.userUid });

    await seedInitialBrandCatalogIfEmpty(uid);

    return user;
  } catch (error: any) {
    if (error?.message?.startsWith('ACCESS_DENIED:')) {
      throw error;
    }
    console.error('Database query failed in getOrCreateAdminUser:', error);
    throw new Error('Failed to verify administrator account in database.', { cause: error });
  }
}

async function seedInitialBrandCatalogIfEmpty(uid: string) {
  try {
    const existingLinks = await db
      .select()
      .from(internalLinks)
      .where(eq(internalLinks.userUid, uid))
      .limit(1);

    if (existingLinks.length === 0) {
      await db.insert(internalLinks).values([
        {
          userUid: uid,
          url: 'https://www.treewalley.com/',
          title: 'TreeWalley Furniture — Solid Sheesham Wood Furniture India',
          pageType: 'brand',
          category: 'Solid wood furniture',
          keywordsJson: ['treewalley furniture', 'solid wood furniture india', 'sheesham wood furniture'],
          source: 'manual',
        },
        {
          userUid: uid,
          url: 'https://www.amazon.in/stores/TreeWalley/page/1DC3D299-35DD-4738-8AB4-14CCC2956151',
          title: 'TreeWalley Official Amazon India Storefront',
          pageType: 'brand',
          category: 'Solid wood furniture',
          keywordsJson: ['treewalley amazon store', 'buy treewalley online'],
          source: 'manual',
        },
      ]);
    }

    const existingRefs = await db
      .select()
      .from(externalReferences)
      .where(eq(externalReferences.userUid, uid))
      .limit(1);

    if (existingRefs.length === 0) {
      await db.insert(externalReferences).values([
        {
          userUid: uid,
          url: 'https://developers.google.com/search/docs/fundamentals/creating-helpful-content',
          title: 'Google Search Central — Creating Helpful, Reliable, People-First Content',
          publisher: 'Google Search Central',
          category: 'Google Documentation',
          approved: true,
        },
        {
          userUid: uid,
          url: 'https://www.bis.gov.in/',
          title: 'Bureau of Indian Standards (BIS) — Timber & Furniture Standards',
          publisher: 'Government of India (BIS)',
          category: 'Government Standards',
          approved: true,
        },
        {
          userUid: uid,
          url: 'https://icfre.gov.in/',
          title: 'Indian Council of Forestry Research and Education — Dalbergia sissoo (Sheesham) Research',
          publisher: 'ICFRE Government of India',
          category: 'Timber Research',
          approved: true,
        },
      ]);
    }

    const existingMedia = await db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.userUid, uid))
      .limit(1);

    if (existingMedia.length === 0) {
      await db.insert(mediaAssets).values([
        {
          userUid: uid,
          filename: 'treewalley_sheesham_bed_1794723622129.jpg',
          seoFilename: 'treewalley-solid-sheesham-king-size-bed.jpg',
          originalName: 'treewalley_sheesham_bed_1794723622129.jpg',
          category: 'King size beds',
          mimeType: 'image/jpeg',
          width: 1408,
          height: 768,
          sizeBytes: 245000,
          publicUrl: '/assets/images/treewalley_sheesham_bed_1794723622129.jpg',
          altText: 'Handcrafted solid Sheesham wood king size bed with clean architectural headboard in sunlit bedroom',
          caption: 'Solid Sheesham wood king bed architectural finish inspiration',
          isTreeWalleyProduct: false,
          publicVerified: true,
        },
        {
          userUid: uid,
          filename: 'treewalley_wooden_wardrobe_1794723622012.jpg',
          seoFilename: 'treewalley-solid-wood-wardrobe-almari.jpg',
          originalName: 'treewalley_wooden_wardrobe_1794723622012.jpg',
          category: 'Wooden wardrobes',
          mimeType: 'image/jpeg',
          width: 1200,
          height: 896,
          sizeBytes: 210000,
          publicUrl: '/assets/images/treewalley_wooden_wardrobe_1794723622012.jpg',
          altText: 'Solid Indian Sheesham wood two-door wardrobe almari with brass hardware against warm ivory wall',
          caption: 'Sheesham wood wardrobe grain and brass joinery detail',
          isTreeWalleyProduct: false,
          publicVerified: true,
        },
        {
          userUid: uid,
          filename: 'treewalley_coffee_table_1794723623053.jpg',
          seoFilename: 'treewalley-solid-rosewood-coffee-table.jpg',
          originalName: 'treewalley_coffee_table_1794723623053.jpg',
          category: 'Coffee tables',
          mimeType: 'image/jpeg',
          width: 1200,
          height: 896,
          sizeBytes: 198000,
          publicUrl: '/assets/images/treewalley_coffee_table_1794723623053.jpg',
          altText: 'Minimalist solid rosewood coffee table on handwoven neutral rug in living room',
          caption: 'Handcrafted solid wood coffee table living room styling',
          isTreeWalleyProduct: false,
          publicVerified: true,
        },
        {
          userUid: uid,
          filename: 'treewalley_dining_table_1794723623185.jpg',
          seoFilename: 'treewalley-sheesham-six-seater-dining-table.jpg',
          originalName: 'treewalley_dining_table_1794723623185.jpg',
          category: 'Dining tables',
          mimeType: 'image/jpeg',
          width: 1408,
          height: 768,
          sizeBytes: 262000,
          publicUrl: '/assets/images/treewalley_dining_table_1794723623185.jpg',
          altText: 'Solid Sheesham wood six-seater dining table with sculpted wooden chairs in contemporary dining room',
          caption: 'Solid wood dining room editorial showcase',
          isTreeWalleyProduct: false,
          publicVerified: true,
        },
      ]);
    }
  } catch (err) {
    console.error('Non-fatal seed error:', err);
  }
}
