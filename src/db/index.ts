import { AsyncLocalStorage } from 'node:async_hooks';
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };
import * as schema from './schema.ts';

interface DbAuthContext {
  uid: string;
  idToken: string;
}

const authStorage = new AsyncLocalStorage<DbAuthContext>();
const uidTokenCache = new Map<string, string>();
const tableCounters = new Map<string, number>();

const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents`;

export function runWithDbAuth<T>(ctx: DbAuthContext, fn: () => T): T {
  uidTokenCache.set(ctx.uid, ctx.idToken);
  return authStorage.run(ctx, fn);
}

export function setCachedDbToken(uid: string, idToken: string) {
  uidTokenCache.set(uid, idToken);
}

function getIdTokenForUid(uidHint?: string | null): string | null {
  const store = authStorage.getStore();
  if (store?.idToken) return store.idToken;
  if (uidHint && uidTokenCache.has(uidHint)) {
    return uidTokenCache.get(uidHint) || null;
  }
  return null;
}

interface TableMeta {
  tableName: string;
  sqlToJs: Record<string, string>;
  jsToCol: Record<string, any>;
  dateFields: Set<string>;
}

const metaCache = new WeakMap<object, TableMeta>();

function getTableMeta(table: any): TableMeta {
  const cached = metaCache.get(table);
  if (cached) return cached;

  const nameSym = Object.getOwnPropertySymbols(table).find(
    (s) => s.description === 'drizzle:Name'
  );
  const tableName = nameSym ? String(table[nameSym]) : 'unknown_table';

  const sqlToJs: Record<string, string> = {};
  const jsToCol: Record<string, any> = {};
  const dateFields = new Set<string>();

  for (const [jsKey, col] of Object.entries<any>(table)) {
    if (col && typeof col === 'object' && typeof col.name === 'string') {
      sqlToJs[col.name] = jsKey;
      jsToCol[jsKey] = col;
      if (col.dataType === 'date' || col.columnType === 'PgTimestamp') {
        dateFields.add(jsKey);
      }
    }
  }

  const meta: TableMeta = { tableName, sqlToJs, jsToCol, dateFields };
  metaCache.set(table, meta);
  return meta;
}

type ParsedFilter =
  | { op: 'EQUAL'; field: string; value: unknown }
  | { op: 'IN'; field: string; values: unknown[] };

function parseWhereNode(node: any, meta: TableMeta, out: ParsedFilter[]): void {
  if (!node || typeof node !== 'object') return;
  const chunks: any[] = Array.isArray(node.queryChunks) ? node.queryChunks : [];
  if (!chunks.length) return;

  // Check if this is a compound expression containing nested SQL nodes
  const hasNestedSql = chunks.some((c) => c && typeof c === 'object' && Array.isArray(c.queryChunks));
  if (hasNestedSql) {
    for (const c of chunks) {
      if (c && typeof c === 'object' && Array.isArray(c.queryChunks)) {
        parseWhereNode(c, meta, out);
      }
    }
    return;
  }

  // Leaf predicate: look for Column + operator string + value/array
  let colName: string | null = null;
  let isIn = false;
  let inValues: unknown[] | null = null;
  let eqValue: unknown = undefined;
  let hasEqValue = false;

  for (const c of chunks) {
    if (c && typeof c === 'object' && typeof c.name === 'string' && c.table) {
      colName = c.name;
    } else if (c && typeof c === 'object' && Array.isArray(c.value)) {
      const joined = c.value.join('');
      if (joined.includes(' in ')) {
        isIn = true;
      }
    } else if (Array.isArray(c)) {
      inValues = c.map((item) =>
        item && typeof item === 'object' && 'value' in item ? item.value : item
      );
    } else if (c && typeof c === 'object' && 'value' in c && !Array.isArray(c.value)) {
      eqValue = c.value;
      hasEqValue = true;
    }
  }

  if (colName && meta.sqlToJs[colName]) {
    const field = meta.sqlToJs[colName];
    if (isIn) {
      out.push({ op: 'IN', field, values: inValues || [] });
    } else if (hasEqValue) {
      out.push({ op: 'EQUAL', field, value: eqValue });
    }
  }
}

interface ParsedOrder {
  field: string;
  direction: 'asc' | 'desc';
}

function parseOrderNodes(orders: any[], meta: TableMeta): ParsedOrder[] {
  const result: ParsedOrder[] = [];
  for (const ord of orders) {
    const chunks: any[] = Array.isArray(ord?.queryChunks) ? ord.queryChunks : [];
    let colName: string | null = null;
    let direction: 'asc' | 'desc' = 'asc';
    for (const c of chunks) {
      if (c && typeof c === 'object' && typeof c.name === 'string' && c.table) {
        colName = c.name;
      } else if (c && typeof c === 'object' && Array.isArray(c.value)) {
        if (c.value.join('').toLowerCase().includes('desc')) {
          direction = 'desc';
        }
      }
    }
    if (colName && meta.sqlToJs[colName]) {
      result.push({ field: meta.sqlToJs[colName], direction });
    }
  }
  return result;
}

function toFirestoreValue(val: unknown): Record<string, any> {
  if (val === null || val === undefined) {
    return { nullValue: null };
  }
  if (val instanceof Date) {
    return { timestampValue: val.toISOString() };
  }
  if (typeof val === 'boolean') {
    return { booleanValue: val };
  }
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return { nullValue: null };
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (typeof val === 'string') {
    return { stringValue: val };
  }
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map((item) => toFirestoreValue(item)) } };
  }
  if (typeof val === 'object') {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (v !== undefined) {
        fields[k] = toFirestoreValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function fromFirestoreValue(raw: any, isDateField = false): any {
  if (!raw || typeof raw !== 'object') return null;
  if ('nullValue' in raw) return null;
  if ('booleanValue' in raw) return Boolean(raw.booleanValue);
  if ('integerValue' in raw) return Number(raw.integerValue);
  if ('doubleValue' in raw) return Number(raw.doubleValue);
  if ('timestampValue' in raw) {
    const d = new Date(raw.timestampValue);
    return isDateField ? d : d.toISOString();
  }
  if ('stringValue' in raw) {
    if (isDateField) {
      const d = new Date(raw.stringValue);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    return raw.stringValue;
  }
  if ('arrayValue' in raw) {
    const vals = Array.isArray(raw.arrayValue?.values) ? raw.arrayValue.values : [];
    return vals.map((item: any) => fromFirestoreValue(item, false));
  }
  if ('mapValue' in raw) {
    const fields = raw.mapValue?.fields || {};
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(fields)) {
      out[k] = fromFirestoreValue(v, false);
    }
    return out;
  }
  return null;
}

function encodeDocumentFields(row: Record<string, any>): Record<string, any> {
  const fields: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v !== undefined) {
      fields[k] = toFirestoreValue(v);
    }
  }
  return fields;
}

function decodeDocument(doc: any, meta: TableMeta): Record<string, any> {
  const fields = doc?.fields || {};
  const row: Record<string, any> = {};
  for (const [k, v] of Object.entries(fields)) {
    row[k] = fromFirestoreValue(v, meta.dateFields.has(k));
  }
  // Ensure every schema column exists with null if omitted
  for (const jsKey of Object.keys(meta.jsToCol)) {
    if (!(jsKey in row)) {
      row[jsKey] = null;
    }
  }
  return row;
}

function buildStructuredWhere(filters: ParsedFilter[]): Record<string, any> | undefined {
  if (filters.length === 0) return undefined;
  const fsFilters = filters.map((f) => {
    if (f.op === 'IN') {
      return {
        fieldFilter: {
          field: { fieldPath: f.field },
          op: 'IN',
          value: { arrayValue: { values: f.values.map((v) => toFirestoreValue(v)) } },
        },
      };
    }
    return {
      fieldFilter: {
        field: { fieldPath: f.field },
        op: 'EQUAL',
        value: toFirestoreValue(f.value),
      },
    };
  });

  if (fsFilters.length === 1) return fsFilters[0];
  return {
    compositeFilter: {
      op: 'AND',
      filters: fsFilters,
    },
  };
}

function extractUidHint(filters: ParsedFilter[], rows?: Record<string, any>[]): string | null {
  for (const f of filters) {
    if ((f.field === 'userUid' || f.field === 'uid') && f.op === 'EQUAL' && typeof f.value === 'string') {
      return f.value;
    }
  }
  if (rows) {
    for (const r of rows) {
      if (typeof r.userUid === 'string') return r.userUid;
      if (typeof r.uid === 'string') return r.uid;
    }
  }
  return null;
}

async function firestoreFetch(
  path: string,
  options: RequestInit,
  uidHint?: string | null
): Promise<Response> {
  const idToken = getIdTokenForUid(uidHint);
  const headers = new Headers(options.headers || {});
  if (idToken) {
    headers.set('Authorization', `Bearer ${idToken}`);
  }
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(`${FIRESTORE_BASE}${path}`, {
    ...options,
    headers,
  });
}

async function runCollectionQuery(
  meta: TableMeta,
  filters: ParsedFilter[],
  uidHint?: string | null
): Promise<Array<{ docId: string; data: Record<string, any> }>> {
  for (const f of filters) {
    if (f.op === 'IN' && f.values.length === 0) {
      return [];
    }
  }

  const structuredQuery: Record<string, any> = {
    from: [{ collectionId: meta.tableName }],
  };
  const whereClause = buildStructuredWhere(filters);
  if (whereClause) {
    structuredQuery.where = whereClause;
  }

  const res = await firestoreFetch(
    ':runQuery',
    {
      method: 'POST',
      body: JSON.stringify({ structuredQuery }),
    },
    uidHint || extractUidHint(filters)
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Firestore query on "${meta.tableName}" failed (${res.status}): ${text}`);
  }

  const items = (await res.json()) as Array<{ document?: any }>;
  const results: Array<{ docId: string; data: Record<string, any> }> = [];
  for (const item of items) {
    if (item.document) {
      const fullName: string = item.document.name || '';
      const docId = fullName.split('/').pop() || '';
      results.push({ docId, data: decodeDocument(item.document, meta) });
    }
  }
  return results;
}

async function getDocumentById(
  meta: TableMeta,
  docId: string,
  uidHint?: string | null
): Promise<Record<string, any> | null> {
  const res = await firestoreFetch(
    `/${meta.tableName}/${encodeURIComponent(docId)}`,
    { method: 'GET' },
    uidHint
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Firestore get "${meta.tableName}/${docId}" failed (${res.status}): ${text}`);
  }
  const doc = await res.json();
  return decodeDocument(doc, meta);
}

async function upsertDocument(
  meta: TableMeta,
  docId: string,
  row: Record<string, any>,
  uidHint?: string | null
): Promise<void> {
  const res = await firestoreFetch(
    `/${meta.tableName}/${encodeURIComponent(docId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        fields: encodeDocumentFields(row),
      }),
    },
    uidHint
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Firestore write "${meta.tableName}/${docId}" failed (${res.status}): ${text}`);
  }
}

async function deleteDocument(
  meta: TableMeta,
  docId: string,
  uidHint?: string | null
): Promise<void> {
  const res = await firestoreFetch(
    `/${meta.tableName}/${encodeURIComponent(docId)}`,
    { method: 'DELETE' },
    uidHint
  );
  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => '');
    throw new Error(`Firestore delete "${meta.tableName}/${docId}" failed (${res.status}): ${text}`);
  }
}

async function nextIdForTable(meta: TableMeta, uidHint?: string | null): Promise<number> {
  const counterKey = `${meta.tableName}:${uidHint || 'global'}`;
  let current = tableCounters.get(counterKey);
  if (current === undefined) {
    const filters: ParsedFilter[] = [];
    if (uidHint) {
      if (meta.tableName === 'users') {
        filters.push({ op: 'EQUAL', field: 'uid', value: uidHint });
      } else if ('userUid' in meta.jsToCol) {
        filters.push({ op: 'EQUAL', field: 'userUid', value: uidHint });
      }
    }
    const existing = await runCollectionQuery(meta, filters, uidHint).catch(() => []);
    let maxId = 0;
    for (const item of existing) {
      const idNum = Number(item.data.id);
      if (Number.isFinite(idNum) && idNum > maxId) {
        maxId = idNum;
      }
    }
    current = maxId;
  }
  const next = current + 1;
  tableCounters.set(counterKey, next);
  return next;
}

function docIdForRow(meta: TableMeta, row: Record<string, any>): string {
  if (meta.tableName === 'users' && row.uid) {
    return String(row.uid);
  }
  if (meta.tableName === 'admin_settings' && row.userUid) {
    return String(row.userUid);
  }
  if (meta.tableName === 'oauth_connections' && row.userUid) {
    return `${row.userUid}_${row.provider || 'google'}`;
  }
  return String(row.id);
}

function applyDefaults(meta: TableMeta, input: Record<string, any>): Record<string, any> {
  const row: Record<string, any> = { ...input };
  for (const [jsKey, col] of Object.entries<any>(meta.jsToCol)) {
    if (row[jsKey] === undefined) {
      if (jsKey === 'id') continue;
      if (meta.dateFields.has(jsKey)) {
        row[jsKey] = col.hasDefault ? new Date() : null;
      } else if (col.hasDefault && col.default !== undefined) {
        row[jsKey] =
          typeof col.default === 'object' && col.default !== null
            ? structuredClone(col.default)
            : col.default;
      } else {
        row[jsKey] = null;
      }
    }
  }
  return row;
}

function sortRows(rows: Record<string, any>[], orders: ParsedOrder[]): Record<string, any>[] {
  if (orders.length === 0) return rows;
  return [...rows].sort((a, b) => {
    for (const ord of orders) {
      const va = a[ord.field];
      const vb = b[ord.field];
      const na = va instanceof Date ? va.getTime() : va;
      const nb = vb instanceof Date ? vb.getTime() : vb;
      if (na === nb) continue;
      if (na === null || na === undefined) return 1;
      if (nb === null || nb === undefined) return -1;
      const cmp = na < nb ? -1 : 1;
      return ord.direction === 'desc' ? -cmp : cmp;
    }
    return 0;
  });
}

function applyProjection(
  rows: Record<string, any>[],
  projection: Record<string, any> | undefined,
  meta: TableMeta
): any[] {
  if (!projection) return rows;
  return rows.map((row) => {
    const out: Record<string, any> = {};
    for (const [outKey, col] of Object.entries<any>(projection)) {
      const jsKey = col?.name && meta.sqlToJs[col.name] ? meta.sqlToJs[col.name] : outKey;
      out[outKey] = row[jsKey] ?? null;
    }
    return out;
  });
}

function enforceOwnerFilter(meta: TableMeta, filters: ParsedFilter[]): void {
  const store = authStorage.getStore();
  if (!store?.uid) return;
  const ownerField =
    meta.tableName === 'users'
      ? 'uid'
      : 'userUid' in meta.jsToCol
      ? 'userUid'
      : null;
  if (!ownerField) return;
  if (!filters.some((f) => f.field === ownerField)) {
    filters.push({ op: 'EQUAL', field: ownerField, value: store.uid });
  }
}

type InferProjectionRow<P extends Record<string, any>> = {
  [K in keyof P]: P[K] extends { _: { data: infer D; notNull: infer NN } }
    ? NN extends true
      ? D
      : D | null
    : any;
};

class SelectBuilder<TRow = any, THasProj extends boolean = false> implements PromiseLike<TRow[]> {
  private table: any;
  private projection: Record<string, any> | undefined;
  private whereNode: any;
  private orderNodes: any[] = [];
  private limitCount: number | undefined;

  constructor(projection?: Record<string, any>) {
    this.projection = projection;
  }

  from<TTable extends { $inferSelect: any }>(
    table: TTable
  ): SelectBuilder<THasProj extends true ? TRow : TTable['$inferSelect'], THasProj> {
    this.table = table;
    return this as any;
  }

  where(cond: any): this {
    this.whereNode = cond;
    return this;
  }

  orderBy(...cols: any[]): this {
    this.orderNodes = cols;
    return this;
  }

  limit(n: number): this {
    this.limitCount = n;
    return this;
  }

  private async execute(): Promise<TRow[]> {
    const meta = getTableMeta(this.table);
    const filters: ParsedFilter[] = [];
    if (this.whereNode) {
      parseWhereNode(this.whereNode, meta, filters);
    }
    enforceOwnerFilter(meta, filters);
    const docs = await runCollectionQuery(meta, filters);
    let rows = docs.map((d) => d.data);

    if (this.orderNodes.length > 0) {
      rows = sortRows(rows, parseOrderNodes(this.orderNodes, meta));
    }
    if (typeof this.limitCount === 'number') {
      rows = rows.slice(0, this.limitCount);
    }
    return applyProjection(rows, this.projection, meta) as TRow[];
  }

  then<TResult1 = TRow[], TResult2 = never>(
    onfulfilled?: ((value: TRow[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null
  ): Promise<TRow[] | TResult> {
    return this.execute().catch(onrejected);
  }
}

class InsertBuilder<TInsert extends Record<string, any> = Record<string, any>, TSelect = any>
  implements PromiseLike<TSelect[]>
{
  private table: any;
  private rowsToInsert: Record<string, any>[] = [];
  private conflictMode: 'none' | 'nothing' | 'update' = 'none';
  private conflictSet: Record<string, any> | undefined;

  constructor(table: any) {
    this.table = table;
  }

  values(vals: TInsert | TInsert[]): this {
    this.rowsToInsert = Array.isArray(vals) ? vals : [vals];
    return this;
  }

  onConflictDoNothing(_opts?: any): this {
    this.conflictMode = 'nothing';
    return this;
  }

  onConflictDoUpdate(opts: { target?: any; set: Partial<TInsert> }): this {
    this.conflictMode = 'update';
    this.conflictSet = opts.set;
    return this;
  }

  returning(): this {
    return this;
  }

  private async execute(): Promise<TSelect[]> {
    const meta = getTableMeta(this.table);
    const uidHint = extractUidHint([], this.rowsToInsert);
    const written: Record<string, any>[] = [];

    for (const rawInput of this.rowsToInsert) {
      const row = applyDefaults(meta, rawInput);
      const rowUid = (row.userUid as string) || (row.uid as string) || uidHint;

      if (row.id === undefined || row.id === null) {
        row.id = await nextIdForTable(meta, rowUid);
      }

      const docId = docIdForRow(meta, row);

      if (this.conflictMode !== 'none') {
        const existing = await getDocumentById(meta, docId, rowUid);
        if (existing) {
          if (this.conflictMode === 'nothing') {
            continue;
          }
          const merged = {
            ...existing,
            ...this.conflictSet,
          };
          await upsertDocument(meta, docId, merged, rowUid);
          written.push(merged);
          continue;
        }
      }

      await upsertDocument(meta, docId, row, rowUid);
      written.push(row);
    }

    return written as TSelect[];
  }

  then<TResult1 = TSelect[], TResult2 = never>(
    onfulfilled?: ((value: TSelect[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null
  ): Promise<TSelect[] | TResult> {
    return this.execute().catch(onrejected);
  }
}

class UpdateBuilder<TSet extends Record<string, any> = Record<string, any>, TSelect = any>
  implements PromiseLike<TSelect[]>
{
  private table: any;
  private patch: Record<string, any> = {};
  private whereNode: any;

  constructor(table: any) {
    this.table = table;
  }

  set(values: TSet): this {
    this.patch = values;
    return this;
  }

  where(cond: any): this {
    this.whereNode = cond;
    return this;
  }

  returning(): this {
    return this;
  }

  private async execute(): Promise<TSelect[]> {
    const meta = getTableMeta(this.table);
    const filters: ParsedFilter[] = [];
    if (this.whereNode) {
      parseWhereNode(this.whereNode, meta, filters);
    }
    enforceOwnerFilter(meta, filters);
    const uidHint = extractUidHint(filters);
    const matches = await runCollectionQuery(meta, filters, uidHint);
    const updatedRows: Record<string, any>[] = [];

    for (const item of matches) {
      const merged: Record<string, any> = { ...item.data };
      for (const [k, v] of Object.entries(this.patch)) {
        if (v !== undefined) {
          merged[k] = v;
        }
      }
      await upsertDocument(meta, item.docId, merged, uidHint || merged.userUid || merged.uid);
      updatedRows.push(merged);
    }

    return updatedRows as TSelect[];
  }

  then<TResult1 = TSelect[], TResult2 = never>(
    onfulfilled?: ((value: TSelect[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null
  ): Promise<TSelect[] | TResult> {
    return this.execute().catch(onrejected);
  }
}

class DeleteBuilder implements PromiseLike<void> {
  private table: any;
  private whereNode: any;

  constructor(table: any) {
    this.table = table;
  }

  where(cond: any): this {
    this.whereNode = cond;
    return this;
  }

  private async execute(): Promise<void> {
    const meta = getTableMeta(this.table);
    const filters: ParsedFilter[] = [];
    if (this.whereNode) {
      parseWhereNode(this.whereNode, meta, filters);
    }
    enforceOwnerFilter(meta, filters);
    const uidHint = extractUidHint(filters);
    const matches = await runCollectionQuery(meta, filters, uidHint);
    for (const item of matches) {
      await deleteDocument(meta, item.docId, uidHint || item.data.userUid || item.data.uid);
    }
  }

  then<TResult1 = void, TResult2 = never>(
    onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null
  ): Promise<void | TResult> {
    return this.execute().catch(onrejected);
  }
}

export interface FirestoreDb {
  schema: typeof schema;
  select(): SelectBuilder<any, false>;
  select<TProj extends Record<string, any>>(
    projection: TProj
  ): SelectBuilder<InferProjectionRow<TProj>, true>;
  insert<TTable extends { $inferSelect: any; $inferInsert: any }>(
    table: TTable
  ): InsertBuilder<TTable['$inferInsert'], TTable['$inferSelect']>;
  update<TTable extends { $inferSelect: any; $inferInsert: any }>(
    table: TTable
  ): UpdateBuilder<Partial<TTable['$inferInsert']>, TTable['$inferSelect']>;
  delete(table: any): DeleteBuilder;
  transaction<T>(fn: (tx: FirestoreDb) => Promise<T>): Promise<T>;
}

export const db: FirestoreDb = {
  schema,
  select(projection?: Record<string, any>): any {
    return new SelectBuilder(projection);
  },
  insert<TTable extends { $inferSelect: any; $inferInsert: any }>(table: TTable) {
    return new InsertBuilder<TTable['$inferInsert'], TTable['$inferSelect']>(table);
  },
  update<TTable extends { $inferSelect: any; $inferInsert: any }>(table: TTable) {
    return new UpdateBuilder<Partial<TTable['$inferInsert']>, TTable['$inferSelect']>(table);
  },
  delete(table: any) {
    return new DeleteBuilder(table);
  },
  async transaction<T>(fn: (tx: FirestoreDb) => Promise<T>): Promise<T> {
    return fn(db);
  },
};
