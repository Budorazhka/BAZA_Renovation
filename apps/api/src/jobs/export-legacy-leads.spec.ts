import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runExport } from './export-legacy-leads.script';
import type { LegacyLead } from '../modules/crm/legacy-lead.types';

const VALID_TOKEN = 'test-jwt-token';

interface FakeLead {
  _id: string;
  name: string;
  phone: string;
  stage: string;
  productType: string;
  assignedTo: string;
  createdBy: string;
  dealValue: number;
  createdAt: string;
  updatedAt: string;
}

function makeLead(id: string): FakeLead {
  return {
    _id: id,
    name: `Lead ${id}`,
    phone: `+7000000${id}`,
    stage: 'new',
    productType: 'sales',
    assignedTo: 'acc-1',
    createdBy: 'acc-1',
    dealValue: 1000,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function historyFor(leadId: string) {
  return [
    {
      fromStage: 'new',
      toStage: 'contact',
      changedAt: '2026-01-01T01:00:00.000Z',
      changedBy: 'acc-1',
      userName: 'Agent',
      userRole: 'agent',
      comment: `history for ${leadId}`,
    },
  ];
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(payload);
}

describe('export-legacy-leads.script runExport (fake HTTP server)', () => {
  let server: Server;
  let baseUrl: string;
  let outDir: string;
  let outPath: string;

  beforeEach(() => {
    outDir = mkdtempSync(join(tmpdir(), 'legacy-export-test-'));
    outPath = join(outDir, 'out.json');
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    rmSync(outDir, { recursive: true, force: true });
  });

  function startServer(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<string> {
    server = createServer(handler);
    return new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (address && typeof address === 'object') {
          resolve(`http://127.0.0.1:${address.port}`);
        }
      });
    });
  }

  function requireAuth(req: IncomingMessage, res: ServerResponse): boolean {
    if (req.headers.authorization !== `Bearer ${VALID_TOKEN}`) {
      sendJson(res, 401, { success: false, message: 'Unauthorized' });
      return false;
    }
    return true;
  }

  it('постранично выгружает лидов и их историю, пишет итоговый JSON', async () => {
    const leadIds = ['1', '2', '3'];
    baseUrl = await startServer((req, res) => {
      if (!requireAuth(req, res)) return;
      const url = new URL(req.url || '', 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/crm/leads') {
        const page = Number(url.searchParams.get('page') || '1');
        const limit = Number(url.searchParams.get('limit') || '2');
        const pages = chunk(leadIds, limit);
        const items = (pages[page - 1] || []).map(makeLead);
        sendJson(res, 200, {
          success: true,
          data: { items, total: leadIds.length, page, totalPages: pages.length },
        });
        return;
      }
      const historyMatch = url.pathname.match(/^\/crm\/leads\/([^/]+)\/history$/);
      if (req.method === 'GET' && historyMatch) {
        sendJson(res, 200, { success: true, data: historyFor(historyMatch[1]!) });
        return;
      }
      sendJson(res, 404, { success: false, message: 'not found' });
    });

    const report = await runExport({
      baseUrl,
      token: VALID_TOKEN,
      outPath,
      pageSize: 2,
      delayMs: 1,
      resume: false,
    });

    expect(report.totalLeads).toBe(3);
    expect(report.totalPages).toBe(2);
    expect(report.exported).toBe(3);
    expect(report.failedLeads).toEqual([]);
    expect(report.failedPages).toEqual([]);

    const written: LegacyLead[] = JSON.parse(readFileSync(outPath, 'utf-8'));
    expect(written.map((l) => l._id).sort()).toEqual(['1', '2', '3']);
    expect(written[0]!.history).toEqual([
      {
        fromStage: 'new',
        toStage: 'contact',
        changedAt: '2026-01-01T01:00:00.000Z',
        changedBy: 'acc-1',
        userName: 'Agent',
        userRole: 'agent',
        comment: `history for ${written[0]!._id}`,
      },
    ]);
  });

  it('--resume продолжает с места обрыва, не перезапрашивая уже выгруженную историю', async () => {
    const leadIds = ['1', '2', '3'];
    const historyRequests: string[] = [];
    let failHistoryFor: string | null = '2';

    baseUrl = await startServer((req, res) => {
      if (!requireAuth(req, res)) return;
      const url = new URL(req.url || '', 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/crm/leads') {
        sendJson(res, 200, {
          success: true,
          data: { items: leadIds.map(makeLead), total: leadIds.length, page: 1, totalPages: 1 },
        });
        return;
      }
      const historyMatch = url.pathname.match(/^\/crm\/leads\/([^/]+)\/history$/);
      if (req.method === 'GET' && historyMatch) {
        const leadId = historyMatch[1]!;
        historyRequests.push(leadId);
        if (leadId === failHistoryFor) {
          sendJson(res, 500, { success: false, message: 'boom' });
          return;
        }
        sendJson(res, 200, { success: true, data: historyFor(leadId) });
        return;
      }
      sendJson(res, 404, { success: false, message: 'not found' });
    });

    const firstReport = await runExport({
      baseUrl,
      token: VALID_TOKEN,
      outPath,
      pageSize: 10,
      delayMs: 1,
      resume: false,
    });

    // Лид "2" не смог получить историю (500 при каждой retry-попытке) —
    // помечен failed, остальные два успешно выгружены.
    expect(firstReport.exported).toBe(2);
    expect(firstReport.failedLeads.map((f) => f.id)).toEqual(['2']);
    expect(existsSync(`${outPath}.progress.jsonl`)).toBe(true);

    historyRequests.length = 0;
    failHistoryFor = null; // теперь сервер "чинится"

    const secondReport = await runExport({
      baseUrl,
      token: VALID_TOKEN,
      outPath,
      pageSize: 10,
      delayMs: 1,
      resume: true,
    });

    expect(secondReport.exported).toBe(3);
    expect(secondReport.failedLeads).toEqual([]);
    // История для уже выгруженных 1 и 3 не перезапрашивалась при resume.
    expect(historyRequests.sort()).toEqual(['2']);

    const written: LegacyLead[] = JSON.parse(readFileSync(outPath, 'utf-8'));
    expect(written.map((l) => l._id).sort()).toEqual(['1', '2', '3']);
  });

  it('retry: сервер отвечает 500 первые 2 раза для страницы, затем 200 — скрипт не падает', async () => {
    let attempts = 0;
    baseUrl = await startServer((req, res) => {
      if (!requireAuth(req, res)) return;
      const url = new URL(req.url || '', 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/crm/leads') {
        attempts += 1;
        if (attempts <= 2) {
          sendJson(res, 500, { success: false, message: 'temporary failure' });
          return;
        }
        sendJson(res, 200, {
          success: true,
          data: { items: [makeLead('1')], total: 1, page: 1, totalPages: 1 },
        });
        return;
      }
      const historyMatch = url.pathname.match(/^\/crm\/leads\/([^/]+)\/history$/);
      if (req.method === 'GET' && historyMatch) {
        sendJson(res, 200, { success: true, data: historyFor(historyMatch[1]!) });
        return;
      }
      sendJson(res, 404, { success: false, message: 'not found' });
    });

    const report = await runExport({
      baseUrl,
      token: VALID_TOKEN,
      outPath,
      pageSize: 10,
      delayMs: 1,
      resume: false,
    });

    expect(attempts).toBe(3);
    expect(report.exported).toBe(1);
    expect(report.failedLeads).toEqual([]);
    expect(report.failedPages).toEqual([]);
  }, 15000);

  it('retry: страница не восстанавливается за отведённые попытки — помечается failed, скрипт продолжает', async () => {
    baseUrl = await startServer((req, res) => {
      if (!requireAuth(req, res)) return;
      const url = new URL(req.url || '', 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/crm/leads') {
        const page = Number(url.searchParams.get('page') || '1');
        if (page === 1) {
          sendJson(res, 200, {
            success: true,
            data: { items: [makeLead('1')], total: 2, page: 1, totalPages: 2 },
          });
          return;
        }
        sendJson(res, 500, { success: false, message: 'always broken' });
        return;
      }
      const historyMatch = url.pathname.match(/^\/crm\/leads\/([^/]+)\/history$/);
      if (req.method === 'GET' && historyMatch) {
        sendJson(res, 200, { success: true, data: historyFor(historyMatch[1]!) });
        return;
      }
      sendJson(res, 404, { success: false, message: 'not found' });
    });

    const report = await runExport({
      baseUrl,
      token: VALID_TOKEN,
      outPath,
      pageSize: 10,
      delayMs: 1,
      resume: false,
    });

    expect(report.exported).toBe(1);
    expect(report.failedPages).toEqual([{ page: 2, reason: expect.stringContaining('HTTP 500') }]);
  }, 15000);
});

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}
