import { expect, Page, test } from '@playwright/test';
import { ArrowType, ConnectionStyle, IdeaCard, RelationType } from '../types';
import { buildExportDraft } from '../services/exportDraftService';

const ignoredConsoleErrors = [
  /favicon/i,
  /env\.js/i,
  /ResizeObserver loop/i,
  /Failed to load resource: the server responded with a status of 404/i,
];

const collectRuntimeErrors = (page: Page) => {
  const errors: string[] = [];

  page.on('pageerror', error => {
    errors.push(`pageerror: ${error.message}`);
  });

  page.on('console', message => {
    if (message.type() === 'error') {
      const location = message.location();
      const suffix = location.url ? ` (${location.url})` : '';
      errors.push(`console: ${message.text()}${suffix}`);
    }
  });

  page.on('response', response => {
    const status = response.status();
    const url = response.url();
    if (status >= 400 && !/env\.js|favicon/i.test(url)) {
      errors.push(`response: ${status} ${url}`);
    }
  });

  return errors;
};

const expectNoRuntimeErrors = (errors: string[]) => {
  const unexpected = errors.filter(error => !ignoredConsoleErrors.some(pattern => pattern.test(error)));
  expect(unexpected).toEqual([]);
};

type PdfExportDetail = { name: string; byteLength: number };

const card = (id: string, text: string, x: number, y: number, body = ''): IdeaCard => ({
  id,
  x,
  y,
  text,
  content: body ? JSON.stringify([{ id: `${id}-body`, type: 'text', text: body, style: { listType: 'none' } }]) : undefined,
  createdAt: Date.now(),
  width: 220,
  height: 140,
  color: '#ffffff',
  style: { isBold: false, isItalic: false, fontFamily: 'sans', fontSize: 16 },
  collectionId: 'test',
  kind: 'text',
});

const parentConnection = (fromId: string, toId: string) => ({
  id: `${fromId}-${toId}`,
  fromId,
  toId,
  style: ConnectionStyle.SOLID,
  arrowStart: ArrowType.NONE,
  arrowEnd: ArrowType.STANDARD,
  relationType: RelationType.PARENT_TO_CHILD,
  color: '#3b82f6',
});

test('relationship inference promotes DSA concepts over filler AI responses', async () => {
  const cards = [
    card('dsa', 'DSA concepts', 0, 0, 'Data structures and algorithms overview'),
    card('arrays', 'array algorithms', -360, -80, 'sorting searching arrays quicksort selection sort bubble sort'),
    card('linked', 'linked lists', -320, 210, 'nodes pointers singly doubly circular linked lists'),
    card('trees', 'trees', 260, 220, 'binary trees traversals depth first search'),
    card('graphs', 'graph', 330, -90, 'vertices edges graph traversal bfs dfs'),
    card('quick', 'quicksort', -560, -200),
    card('select', 'Selection sort', -420, -230),
    card('binary', 'binary trees', 480, 290),
    card('dfs', 'DFS types', 620, 170),
    card('ai', 'AI responses', 40, -260, 'A long assistant response that should not become the topic card.'),
  ];

  const connections = [
    parentConnection('dsa', 'arrays'),
    parentConnection('dsa', 'linked'),
    parentConnection('dsa', 'trees'),
    parentConnection('dsa', 'graphs'),
    parentConnection('arrays', 'quick'),
    parentConnection('arrays', 'select'),
    parentConnection('trees', 'binary'),
    parentConnection('graphs', 'dfs'),
    parentConnection('dsa', 'ai'),
  ];

  const draft = await buildExportDraft('Data Structures and Algorithms', cards, connections);
  const chapter = draft.chapters[0];
  const sectionTitles = chapter.sections.map(section => section.title);

  expect(chapter.title).toBe('DSA concepts');
  expect(sectionTitles).toEqual(expect.arrayContaining(['array algorithms', 'linked lists', 'trees', 'graph']));
});

test('draft layout grows long headings and content blocks around wrapped text', async () => {
  const longTitle = 'AI/ML - Week 5: MCP, Multi-Agent Orchestration & Tool Design';
  const body = [
    'Model Context Protocol protocol fundamentals transport capabilities.',
    'Building MCP servers exposing resources tools and prompts.',
    'Connecting MCP clients to existing apps and orchestrating supervisor worker patterns.',
    'Tool design for agents clear names narrow scopes and useful error handling.',
  ].join(' ');
  const draft = await buildExportDraft('Long heading regression', [
    card('long-root', longTitle, 0, 0, body.repeat(3)),
  ], []);

  const blocks = draft.pages.flatMap(page => page.blocks);
  const heading = blocks.find(block => block.id.startsWith('chapter-heading-'));
  const content = blocks.find(block => block.sourceCardId === 'long-root' && block.type === 'text');

  expect(heading?.layout?.height).toBeGreaterThan(70);
  expect(content?.layout?.height).toBeGreaterThan(110);
  expect(content!.layout!.y).toBeGreaterThanOrEqual(heading!.layout!.y + heading!.layout!.height + 18);
});

test('demo user can create a canvas, open PDF preview, and export final PDF', async ({ page }) => {
  const errors = collectRuntimeErrors(page);
  const longTitle = 'AI/ML - Week 5: MCP, Multi-Agent Orchestration & Tool Design';

  await page.goto('/');
  await expect(page.getByText(/Every card is/i)).toBeVisible();

  await page.getByRole('button', { name: /Start for Free|Launch App/i }).first().click();
  await expect(page.getByTestId('create-canvas-button')).toBeVisible();

  await page.getByTestId('create-canvas-button').click();
  await expect(page.getByTestId('canvas')).toBeVisible();
  await expect(page.getByTestId('card')).toHaveCount(1);

  const skipTour = page.getByRole('button', { name: 'Skip tour' }).last();
  if (await skipTour.isVisible().catch(() => false)) {
    await skipTour.click();
  }

  await page.getByTestId('card-title-input').first().fill(longTitle);
  await expect(page.getByTestId('card-title-input').first()).toHaveValue(longTitle);

  await page.getByTestId('create-card-button').click();
  await expect(page.getByTestId('card')).toHaveCount(2);
  await page.getByTestId('card-title-input').nth(1).fill('array algorithms');

  await page.getByTestId('create-card-button').click();
  await expect(page.getByTestId('card')).toHaveCount(3);
  await page.getByTestId('card-title-input').nth(2).fill('linked lists');

  await page.getByTestId('master-pdf-button').click();
  await expect(page.getByTestId('pdf-preview-editor')).toBeVisible();
  await expect(page.getByTestId('pdf-page-1')).toBeVisible();
  const longHeadingBlock = page.locator('[data-export-block-id^="chapter-heading-"]').filter({ hasText: longTitle }).first();
  await expect(longHeadingBlock).toBeVisible();
  const longHeadingOverflows = await longHeadingBlock.evaluate(el =>
    el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1
  );
  expect(longHeadingOverflows).toBe(false);

  await page.evaluate(() => {
    const w = window as typeof window & {
      __lastBrainstormPdfExport?: PdfExportDetail | null;
      __lastBrainstormPdfExportError?: { message: string } | null;
    };
    w.__lastBrainstormPdfExport = null;
    w.__lastBrainstormPdfExportError = null;
    window.addEventListener('brainstorm:pdf-rendered', ((event: Event) => {
      w.__lastBrainstormPdfExport = (event as CustomEvent<PdfExportDetail>).detail;
    }) as EventListener, { once: true });
    window.addEventListener('brainstorm:pdf-export-failed', ((event: Event) => {
      w.__lastBrainstormPdfExportError = (event as CustomEvent<{ message: string }>).detail;
    }) as EventListener, { once: true });
  });
  await page.getByTestId('export-final-pdf').click();
  const exportHandle = await page.waitForFunction(() => {
    const w = window as typeof window & {
      __lastBrainstormPdfExport?: PdfExportDetail | null;
      __lastBrainstormPdfExportError?: { message: string } | null;
    };
    return w.__lastBrainstormPdfExport || w.__lastBrainstormPdfExportError || null;
  }, null, { timeout: 15_000 });
  const exportOutcome = await exportHandle.jsonValue() as PdfExportDetail | { message: string };

  expect('message' in exportOutcome ? exportOutcome.message : '').toBe('');
  const exportDetails = exportOutcome as PdfExportDetail;
  expect(exportDetails.name).toMatch(/\.pdf$/);
  expect(exportDetails.byteLength).toBeGreaterThan(1000);

  expectNoRuntimeErrors(errors);
});
