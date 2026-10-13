import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { palette } from './theme.js';

// Icons are white SLDS utility glyphs on a filled circle, which is exactly how the
// official Salesforce diagram icon set is built. `plain` icons are drawn without a
// circle in their own colour (logos).
export interface IconDef {
  label: string;
  glyph: string; // SLDS utility icon name
  color: string;
  plain?: boolean;
  aliases?: string[];
}

const P = palette;

export const catalog: Record<string, IconDef> = {
  // Salesforce brand & clouds
  salesforce: { label: 'Salesforce', glyph: 'salesforce1', color: '#0E9DDA', plain: true, aliases: ['salesforce-logo', 'sfdc'] },
  'salesforce-platform': { label: 'Salesforce Platform', glyph: 'salesforce1', color: P.navy, aliases: ['platform', 'lightning-platform'] },
  'sales-cloud': { label: 'Sales Cloud', glyph: 'line_chart', color: P.teal, aliases: ['sales'] },
  'service-cloud': { label: 'Service Cloud', glyph: 'heart', color: P.maroon, aliases: ['service'] },
  'marketing-cloud': { label: 'Marketing Cloud', glyph: 'campaign', color: P.orange, aliases: ['marketing'] },
  'commerce-cloud': { label: 'Commerce Cloud', glyph: 'cart', color: P.green, aliases: ['commerce', 'b2c-commerce', 'b2b-commerce'] },
  'experience-cloud': { label: 'Experience Cloud', glyph: 'groups', color: P.blue, aliases: ['community', 'communities', 'portal'] },
  'data-cloud': { label: 'Data 360', glyph: 'data_cloud', color: P.darkpurple, aliases: ['data-360', 'data360', 'cdp'] },
  agentforce: { label: 'Agentforce', glyph: 'agent_astro', color: P.navy, aliases: ['agent', 'agentforce-360'] },
  einstein: { label: 'Einstein', glyph: 'einstein', color: P.navy, aliases: ['ai'] },
  tableau: { label: 'Tableau', glyph: 'tableau', color: P.navy, aliases: ['tableau-cloud', 'crm-analytics', 'reports-dashboards'] },
  mulesoft: { label: 'MuleSoft', glyph: 'mulesoft', color: P.navy, aliases: ['mule', 'anypoint'] },
  slack: { label: 'Slack', glyph: 'slack', color: P.navy },
  'field-service': { label: 'Field Service', glyph: 'location', color: P.teal },
  'industries': { label: 'Industries', glyph: 'company', color: P.indigo },
  omnistudio: { label: 'OmniStudio', glyph: 'builder', color: P.navy, aliases: ['omni-studio'] },
  'crm-apps': { label: 'CRM Apps', glyph: 'apps', color: P.navy, aliases: ['apps-launcher'] },
  heroku: { label: 'Heroku', glyph: 'apex_plugin', color: '#6762A6' },

  // Platform capabilities
  flow: { label: 'Flow', glyph: 'flow_alt', color: P.navy, aliases: ['automation', 'flows'] },
  apex: { label: 'Apex', glyph: 'apex', color: P.indigo, aliases: ['pro-code', 'code'] },
  'low-code': { label: 'Low Code', glyph: 'custom_apps', color: P.indigo },
  database: { label: 'Data', glyph: 'database', color: P.indigo, aliases: ['data', 'db'] },
  bot: { label: 'Bots', glyph: 'robot', color: P.indigo, aliases: ['bots', 'chatbot'] },
  security: { label: 'Privacy', glyph: 'shield', color: P.indigo, aliases: ['privacy', 'shield'] },
  mobile: { label: 'Apps', glyph: 'phone_portrait', color: P.indigo, aliases: ['mobile-app', 'phone'] },
  desktop: { label: 'Web', glyph: 'desktop', color: P.indigo, aliases: ['web', 'web-app', 'browser'] },
  identity: { label: 'Identity', glyph: 'identity', color: P.indigo, aliases: ['sso', 'auth'] },
  lock: { label: 'Encryption', glyph: 'lock', color: P.indigo, aliases: ['encryption'] },
  key: { label: 'Credentials', glyph: 'key', color: P.indigo, aliases: ['credentials', 'named-credential'] },
  events: { label: 'Platform Events', glyph: 'events', color: P.navy, aliases: ['platform-events', 'event', 'cdc', 'change-data-capture'] },
  integration: { label: 'Integration', glyph: 'integration', color: P.navy, aliases: ['connector'] },
  api: { label: 'API', glyph: 'connected_apps', color: P.navy, aliases: ['connected-app', 'rest-api'] },
  'external-service': { label: 'External Service', glyph: 'internal_share', color: P.navy, aliases: ['callout'] },
  sync: { label: 'Sync', glyph: 'sync', color: P.navy },
  batch: { label: 'Batch', glyph: 'clock', color: P.navy, aliases: ['clock', 'schedule', 'scheduled'] },
  email: { label: 'Email', glyph: 'email', color: P.navy },
  form: { label: 'Form', glyph: 'form', color: P.lightgreen, aliases: ['forms'] },
  file: { label: 'Files', glyph: 'file', color: P.indigo, aliases: ['files', 'document'] },
  'data-mapping': { label: 'Data Mapping', glyph: 'data_mapping', color: P.darkpurple },
  'data-model': { label: 'Data Model', glyph: 'data_model', color: P.darkpurple },
  dataspace: { label: 'Data Space', glyph: 'dataspace', color: P.darkpurple, aliases: ['data-space'] },
  analytics: { label: 'Analytics', glyph: 'metrics', color: P.navy, aliases: ['metrics', 'reports'] },
  knowledge: { label: 'Knowledge', glyph: 'knowledge_base', color: P.maroon, aliases: ['knowledge-base'] },
  chat: { label: 'Messaging', glyph: 'chat', color: P.maroon, aliases: ['messaging'] },
  'omni-channel': { label: 'Omni-Channel', glyph: 'omni_channel', color: P.maroon },
  hierarchy: { label: 'Hierarchy', glyph: 'hierarchy', color: P.navy, aliases: ['role-hierarchy', 'org-chart'] },
  rules: { label: 'Rules', glyph: 'rules', color: P.indigo },
  search: { label: 'Search', glyph: 'search', color: P.navy },

  // People & external
  user: { label: 'User', glyph: 'user', color: P.navy, aliases: ['person', 'employee'] },
  customer: { label: 'Customer', glyph: 'people', color: P.navy, aliases: ['customers', 'people', 'users'] },
  partner: { label: 'Partner', glyph: 'groups', color: P.navy, aliases: ['partners'] },
  building: { label: 'External System', glyph: 'company', color: P.lavender, aliases: ['external', 'external-system', 'company', 'erp', 'legacy', 'on-premise'] },
  cloud: { label: 'Cloud Service', glyph: 'world', color: P.lavender, aliases: ['internet', 'world', 'saas'] },
  server: { label: 'Server', glyph: 'database', color: P.lavender, aliases: ['data-warehouse', 'warehouse', 'data-lake'] },
  storage: { label: 'Object Storage', glyph: 'archive', color: P.lavender, aliases: ['bucket', 'object-storage', 's3'] },
  store: { label: 'Store', glyph: 'store', color: P.green, aliases: ['shop', 'retail'] },
  announcement: { label: 'Campaign', glyph: 'announcement', color: P.orange, aliases: ['campaign'] },
};

const require = createRequire(import.meta.url);

function glyphDir(): string {
  const pkg = require.resolve('@salesforce-ux/icons/package.json');
  return path.join(path.dirname(pkg), 'dist/salesforce-lightning-design-system-icons/utility');
}

export interface Glyph {
  viewBox: string;
  body: string; // inner SVG markup
}

const glyphCache = new Map<string, Glyph>();

export function parseSvg(src: string): Glyph {
  const start = src.indexOf('<svg');
  const open = src.slice(start).match(/^<svg[^>]*>/);
  if (!open) throw new Error('not an svg');
  const vb = open[0].match(/viewBox="([^"]+)"/)?.[1];
  const w = open[0].match(/\swidth="([\d.]+)/)?.[1];
  const h = open[0].match(/\sheight="([\d.]+)/)?.[1];
  const body = src
    .slice(start + open[0].length)
    .replace(/<\/svg>\s*$/, '')
    .replace(/<title>.*?<\/title>/gs, '');
  return { viewBox: vb ?? `0 0 ${w ?? 52} ${h ?? 52}`, body };
}

export function loadGlyph(name: string): Glyph {
  let g = glyphCache.get(name);
  if (!g) {
    const file = path.join(glyphDir(), `${name}.svg`);
    if (!fs.existsSync(file)) throw new Error(`SLDS glyph "${name}" not found`);
    g = parseSvg(fs.readFileSync(file, 'utf8'));
    glyphCache.set(name, g);
  }
  return g;
}

export function sldsGlyphExists(name: string): boolean {
  return fs.existsSync(path.join(glyphDir(), `${name}.svg`));
}

const aliasIndex = new Map<string, string>();
for (const [id, def] of Object.entries(catalog)) {
  for (const a of def.aliases ?? []) aliasIndex.set(a, id);
}

export interface ResolvedIcon {
  id: string;
  label: string;
  color: string;
  plain: boolean;
  glyph: Glyph;
  /** true when the local file is a complete icon (its own circle/colours) */
  custom: boolean;
}

/**
 * Resolve an icon reference. Lookup order:
 *   1. <iconDir>/<id>.svg  — local override, e.g. the official icon pack
 *   2. catalog id or alias
 *   3. "slds:<name>" or "slds:<name>/<color>" — any SLDS utility glyph
 */
export function resolveIcon(ref: string, iconDirs: string[] = []): ResolvedIcon | undefined {
  for (const dir of iconDirs) {
    const file = path.join(dir, `${ref}.svg`);
    if (fs.existsSync(file)) {
      const def = catalog[ref] ?? catalog[aliasIndex.get(ref) ?? ''];
      return {
        id: ref,
        label: def?.label ?? titleCase(ref),
        color: def?.color ?? palette.navy,
        plain: true,
        glyph: parseSvg(fs.readFileSync(file, 'utf8')),
        custom: true,
      };
    }
  }
  if (ref.startsWith('slds:')) {
    const [name, color] = ref.slice(5).split('/');
    if (!sldsGlyphExists(name)) return undefined;
    return {
      id: ref,
      label: titleCase(name),
      color: color ? (color.startsWith('#') ? color : palette[color] ?? palette.navy) : palette.navy,
      plain: false,
      glyph: loadGlyph(name),
      custom: false,
    };
  }
  const id = catalog[ref] ? ref : aliasIndex.get(ref);
  if (!id) return undefined;
  const def = catalog[id];
  return { id, label: def.label, color: def.color, plain: !!def.plain, glyph: loadGlyph(def.glyph), custom: false };
}

export function iconIds(): string[] {
  return [...Object.keys(catalog), ...aliasIndex.keys()];
}

function titleCase(s: string): string {
  return s.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
